use soroban_sdk::{contracttype, Address};

#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Treasury,
    RoundCounter,
    Round(u32),
    Bet(u32, Address),
    Reward(u32, Address),
    ParticipantCount(u32),
    BettorList(u32),
}
