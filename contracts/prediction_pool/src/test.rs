#![cfg(test)]
use super::*;
use soroban_sdk::{testutils::Address as _, testutils::Ledger as _, Env, Address, token};

#[test]
fn test_prediction_pool_complete_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let bettor1 = Address::generate(&env);
    let bettor2 = Address::generate(&env);
    let bettor3 = Address::generate(&env);

    // Register a token for staking (e.g. Native XLM SAC)
    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin.clone()).address();
    let token_client = token::Client::new(&env, &token_id);
    let token_admin_client = token::StellarAssetClient::new(&env, &token_id);

    // Register prediction pool contract
    let contract_id = env.register(PredictionPool, ());
    let client = PredictionPoolClient::new(&env, &contract_id);

    // Initialize prediction pool
    client.initialize(&admin, &token_id);

    // Create a round
    let now = env.ledger().timestamp();
    let end_time = now + 1000;
    let min_stake = 10_000_000; // 10 XLM in stroops
    let round_id = client.create_round(&creator, &end_time, &min_stake);
    assert_eq!(round_id, 1);

    // Mint tokens to bettors
    let initial_balance = 100_000_000; // 100 XLM
    token_admin_client.mint(&bettor1, &initial_balance);
    token_admin_client.mint(&bettor2, &initial_balance);
    token_admin_client.mint(&bettor3, &initial_balance);

    assert_eq!(token_client.balance(&bettor1), initial_balance);

    // Place bets
    // Bettor 1: predicts 135_000, stakes 10_000_000  (Error: |135_000 - 142_000| = 7_000, Rank 2)
    client.place_bet(&round_id, &bettor1, &135_000, &10_000_000);
    // Bettor 2: predicts 140_000, stakes 20_000_000  (Error: |140_000 - 142_000| = 2_000, Rank 1)
    client.place_bet(&round_id, &bettor2, &140_000, &20_000_000);
    // Bettor 3: predicts 150_000, stakes 15_000_000  (Error: |150_000 - 142_000| = 8_000, Rank 3)
    client.place_bet(&round_id, &bettor3, &150_000, &15_000_000);

    // Check round details
    let round = client.get_round(&round_id);
    assert_eq!(round.total_pool, 45_000_000);
    assert_eq!(client.get_participant_count(&round_id), 3);

    // Warp ledger time to after end_time to allow settlement
    env.ledger().set_timestamp(end_time + 10);

    // Settle round with actual price 142_000
    // Winners:
    // Rank 1: Bettor 2 (error 2_000, stake1 = 20_000_000)
    // Rank 2: Bettor 1 (error 7_000, stake2 = 10_000_000)
    client.settle_round(&round_id, &142_000);

    // Check settlement
    let settled_round = client.get_round(&round_id);
    assert!(matches!(settled_round.status, RoundStatus::Settled));

    // Verify rewards
    // Prize pool = total_pool - stake_1 - stake_2 = 45M - 20M - 10M = 15M
    // Rank 1 (Bettor 2): stake_1 (20M) + 65% of prize pool (9.75M) = 29.75M
    // Rank 2 (Bettor 1): stake_2 (10M) + 35% of prize pool (5.25M) = 15.25M
    let reward1 = client.get_reward(&round_id, &bettor2); // Bettor 2 (Rank 1)
    let reward2 = client.get_reward(&round_id, &bettor1); // Bettor 1 (Rank 2)
    let reward3 = client.get_reward(&round_id, &bettor3); // Bettor 3 (Rank 3)
    assert_eq!(reward1, 29_750_000);
    assert_eq!(reward2, 15_250_000);
    assert_eq!(reward3, 0);

    // Claim rewards
    let balance_before_claim = token_client.balance(&bettor2);
    client.claim_reward(&round_id, &bettor2);
    let balance_after_claim = token_client.balance(&bettor2);
    assert_eq!(balance_after_claim - balance_before_claim, 29_750_000);
}

#[test]
fn test_prediction_pool_cancellation_flow() {
    let env = Env::default();
    env.mock_all_auths();

    let admin = Address::generate(&env);
    let creator = Address::generate(&env);
    let bettor1 = Address::generate(&env);
    let bettor2 = Address::generate(&env);

    // Register token
    let token_admin = Address::generate(&env);
    let token_id = env.register_stellar_asset_contract_v2(token_admin.clone()).address();
    let token_client = token::Client::new(&env, &token_id);
    let token_admin_client = token::StellarAssetClient::new(&env, &token_id);

    // Register prediction pool contract
    let contract_id = env.register(PredictionPool, ());
    let client = PredictionPoolClient::new(&env, &contract_id);

    // Initialize
    client.initialize(&admin, &token_id);

    // Create a round
    let now = env.ledger().timestamp();
    let end_time = now + 1000;
    let min_stake = 10_000_000;
    let round_id = client.create_round(&creator, &end_time, &min_stake);

    // Mint tokens
    let initial_balance = 100_000_000;
    token_admin_client.mint(&bettor1, &initial_balance);
    token_admin_client.mint(&bettor2, &initial_balance);

    // Only 2 participants bet (less than MIN_PARTICIPANTS = 3)
    client.place_bet(&round_id, &bettor1, &135_000, &10_000_000);
    client.place_bet(&round_id, &bettor2, &140_000, &20_000_000);

    // Warp to after lock time (lock time is 50% through the round duration)
    let lock_time = now + (end_time - now) / 2;
    env.ledger().set_timestamp(lock_time + 10);

    // Try to settle (should panic due to not enough participants)
    // We can also verify cancel_round works properly and refunds stakes
    client.cancel_round(&round_id);

    let round = client.get_round(&round_id);
    assert!(matches!(round.status, RoundStatus::Cancelled));

    // Verify refund
    assert_eq!(token_client.balance(&bettor1), initial_balance);
    assert_eq!(token_client.balance(&bettor2), initial_balance);
}
