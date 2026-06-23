#![no_std]

mod types;
mod storage;

#[cfg(test)]
mod test;

use soroban_sdk::{contract, contractimpl, panic_with_error, token, Address, Env, Vec};
use types::*;
use storage::*;


const MAX_PARTICIPANTS: u32 = 100;
const MIN_DURATION_SECS: u64 = 290; // ~5 minutes with block time buffer
const MIN_PARTICIPANTS: u32 = 3;    // Need at least 3 to proceed

#[contract]
pub struct PredictionPool;

#[contractimpl]
impl PredictionPool {
    // ── Initialize ───────────────────────────────────────────────────────────
    pub fn initialize(env: Env, admin: Address, token: Address) {
        if env.storage().instance().has(&DataKey::Admin) { panic_with_error!(&env, Error::AlreadyInitialized); }
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::RoundCounter, &0u32);
    }

    // ── Anyone can create a round ────────────────────────────────────────────
    pub fn create_round(env: Env, creator: Address, end_time: u64, min_stake: i128) -> u32 {
        creator.require_auth();

        let now = env.ledger().timestamp();
        if end_time < now + MIN_DURATION_SECS { panic_with_error!(&env, Error::InvalidTime); } // If <= MIN = 300 ok else < MIN < 300

        let lock_time = now + (end_time - now) / 2;
        let round_id: u32 = env.storage().instance().get(&DataKey::RoundCounter).unwrap_or(0);
        let new_id = round_id + 1;

        let round = Round {
            id: new_id,
            creator: creator.clone(),
            start_time: now,
            lock_time,
            end_time,
            min_stake,
            total_pool: 0,
            status: RoundStatus::Open,
            settle_price: 0,
        };

        env.storage().persistent().set(&DataKey::Round(new_id), &round);
        env.storage().instance().set(&DataKey::RoundCounter, &new_id);
        env.storage().persistent().set(&DataKey::BettorList(new_id), &Vec::<Address>::new(&env));
        env.storage().persistent().set(&DataKey::ParticipantCount(new_id), &0u32);

        env.events().publish((soroban_sdk::symbol_short!("created"), new_id, creator), (lock_time, end_time));
        new_id
    }

    // ── Place bet — only allowed before lock_time ────────────────────────────
    pub fn place_bet(env: Env, round_id: u32, bettor: Address, predicted_price: i128, stake_amount: i128) {
        bettor.require_auth();

        let mut round: Round = env.storage().persistent().get(&DataKey::Round(round_id)).unwrap_or_else(|| panic_with_error!(&env, Error::RoundNotFound));
        let now = env.ledger().timestamp();

        if now >= round.lock_time { panic_with_error!(&env, Error::RoundLocked); }
        if round.status != RoundStatus::Open { panic_with_error!(&env, Error::RoundNotOpen); }
        if stake_amount < round.min_stake { panic_with_error!(&env, Error::StakeTooLow); }
        if predicted_price <= 0 { panic_with_error!(&env, Error::InvalidPrediction); }

        let count: u32 = env.storage().persistent().get(&DataKey::ParticipantCount(round_id)).unwrap_or(0);
        if count >= MAX_PARTICIPANTS { panic_with_error!(&env, Error::RoundFull); }
        if env.storage().persistent().has(&DataKey::Bet(round_id, bettor.clone())) { panic_with_error!(&env, Error::AlreadyBet); }

        let token_address: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let xlm = token::Client::new(&env, &token_address);
        xlm.transfer(&bettor, &env.current_contract_address(), &stake_amount);

        env.storage().persistent().set(&DataKey::Bet(round_id, bettor.clone()), &Bet { bettor: bettor.clone(), predicted_price, stake_amount });

        let mut bettors: Vec<Address> = env.storage().persistent().get(&DataKey::BettorList(round_id)).unwrap_or_else(|| Vec::new(&env));
        bettors.push_back(bettor.clone());
        env.storage().persistent().set(&DataKey::BettorList(round_id), &bettors);
        env.storage().persistent().set(&DataKey::ParticipantCount(round_id), &(count + 1));

        round.total_pool += stake_amount;
        env.storage().persistent().set(&DataKey::Round(round_id), &round);

        env.events().publish((soroban_sdk::symbol_short!("bet"), round_id, bettor), (predicted_price, stake_amount));
    }

    // ── Cancel round — called if < 3 participants after lock_time ────────────
    pub fn cancel_round(env: Env, round_id: u32) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let mut round: Round = env.storage().persistent().get(&DataKey::Round(round_id)).unwrap_or_else(|| panic_with_error!(&env, Error::RoundNotFound));

        // Allow cancel after lock_time if not enough participants
        if env.ledger().timestamp() < round.lock_time { panic_with_error!(&env, Error::TooEarly); }
        if round.status != RoundStatus::Open { panic_with_error!(&env, Error::AlreadySettled); }

        let count: u32 = env.storage().persistent().get(&DataKey::ParticipantCount(round_id)).unwrap_or(0);
        if count >= MIN_PARTICIPANTS { panic_with_error!(&env, Error::EnoughParticipants); }

        round.status = RoundStatus::Cancelled;
        env.storage().persistent().set(&DataKey::Round(round_id), &round);

        let bettors: Vec<Address> = env.storage().persistent().get(&DataKey::BettorList(round_id)).unwrap_or_else(|| Vec::new(&env));
        let token_address: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let xlm = token::Client::new(&env, &token_address);
        for bettor in bettors.iter() {
            if let Some(bet) = env.storage().persistent().get::<DataKey, Bet>(&DataKey::Bet(round_id, bettor.clone())) {
                xlm.transfer(&env.current_contract_address(), &bettor, &bet.stake_amount);
            }
        }

        env.events().publish((soroban_sdk::symbol_short!("cancelled"), round_id), count);
    }

    // ── Settle round — called by backend with oracle price after end_time ────
    pub fn settle_round(env: Env, round_id: u32, actual_price: i128) {
        let admin: Address = env.storage().instance().get(&DataKey::Admin).unwrap();
        admin.require_auth();

        let mut round: Round = env.storage().persistent().get(&DataKey::Round(round_id)).unwrap_or_else(|| panic_with_error!(&env, Error::RoundNotFound));

        if env.ledger().timestamp() < round.end_time { panic_with_error!(&env, Error::TooEarly); }
        if round.status != RoundStatus::Open { panic_with_error!(&env, Error::AlreadySettled); }
        if actual_price <= 0 { panic_with_error!(&env, Error::InvalidPrediction); }

        let count: u32 = env.storage().persistent().get(&DataKey::ParticipantCount(round_id)).unwrap_or(0);
        if count < MIN_PARTICIPANTS { panic_with_error!(&env, Error::NotEnoughParticipants); }

        round.status = RoundStatus::Settled;
        round.settle_price = actual_price;

        let bettors: Vec<Address> = env.storage().persistent().get(&DataKey::BettorList(round_id)).unwrap_or_else(|| Vec::new(&env));

        // Collect (error, index, stake) and sort ascending by error
        let n = bettors.len();
        let mut errors: Vec<(i128, u32, i128)> = Vec::new(&env);
        for i in 0..n {
            let bettor = bettors.get(i).unwrap();
            if let Some(bet) = env.storage().persistent().get::<DataKey, Bet>(&DataKey::Bet(round_id, bettor)) {
                errors.push_back(((bet.predicted_price - actual_price).abs(), i, bet.stake_amount));
            }
        }

        // Insertion sort by error
        let m = errors.len();
        for i in 1..m {
            let key = errors.get(i).unwrap();
            let mut j = i;
            while j > 0 {
                let prev = errors.get(j - 1).unwrap();
                if prev.0 > key.0 { errors.set(j, prev); j -= 1; } else { break; }
            }
            errors.set(j, key);
        }

        // Reward logic:
        // - Top 1: stake_1 + 65% of (total_pool - stake_1 - stake_2)
        // - Top 2: stake_2 + 35% of (total_pool - stake_1 - stake_2)
        // - Others: 0 (lose stake)
        if m >= 2 {
            let (_, idx1, stake1) = errors.get(0).unwrap();
            let (_, idx2, stake2) = errors.get(1).unwrap();
            let winner1 = bettors.get(idx1).unwrap();
            let winner2 = bettors.get(idx2).unwrap();
            let prize_pool = round.total_pool - stake1 - stake2;
            let reward2 = stake2 + (prize_pool * 35) / 100;
            let reward1 = stake1 + prize_pool - (reward2 - stake2);
            env.storage().persistent().set(&DataKey::Reward(round_id, winner1.clone()), &reward1);
            env.storage().persistent().set(&DataKey::Reward(round_id, winner2.clone()), &reward2);
        }

        env.storage().persistent().set(&DataKey::Round(round_id), &round);
        env.events().publish((soroban_sdk::symbol_short!("settled"), round_id), (actual_price, round.total_pool));
    }

    // ── Claim reward ─────────────────────────────────────────────────────────
    pub fn claim_reward(env: Env, round_id: u32, claimer: Address) {
        claimer.require_auth();

        let round: Round = env.storage().persistent().get(&DataKey::Round(round_id)).unwrap_or_else(|| panic_with_error!(&env, Error::RoundNotFound));
        if round.status != RoundStatus::Settled { panic_with_error!(&env, Error::NotSettled); }

        let reward: i128 = env.storage().persistent().get(&DataKey::Reward(round_id, claimer.clone())).unwrap_or(0);
        if reward <= 0 { panic_with_error!(&env, Error::NoReward); }

        env.storage().persistent().set(&DataKey::Reward(round_id, claimer.clone()), &0i128);

        let token_address: Address = env.storage().instance().get(&DataKey::Token).unwrap();
        let xlm = token::Client::new(&env, &token_address);
        xlm.transfer(&env.current_contract_address(), &claimer, &reward);

        env.events().publish((soroban_sdk::symbol_short!("claimed"), round_id, claimer), reward);
    }

    // ── Views ────────────────────────────────────────────────────────────────
    pub fn get_round(env: Env, round_id: u32) -> Round {
        env.storage().persistent().get(&DataKey::Round(round_id)).unwrap_or_else(|| panic_with_error!(&env, Error::RoundNotFound))
    }

    pub fn get_bet(env: Env, round_id: u32, bettor: Address) -> Bet {
        env.storage().persistent().get(&DataKey::Bet(round_id, bettor)).unwrap_or_else(|| panic_with_error!(&env, Error::NoBet))
    }

    pub fn get_reward(env: Env, round_id: u32, bettor: Address) -> i128 {
        env.storage().persistent().get(&DataKey::Reward(round_id, bettor)).unwrap_or(0)
    }

    pub fn get_current_round(env: Env) -> u32 {
        env.storage().instance().get(&DataKey::RoundCounter).unwrap_or(0)
    }

    pub fn get_participant_count(env: Env, round_id: u32) -> u32 {
        env.storage().persistent().get(&DataKey::ParticipantCount(round_id)).unwrap_or(0)
    }
}
