use soroban_sdk::{contracterror, contracttype, Address};

#[contracttype]
#[derive(Clone, PartialEq)]
pub enum RoundStatus {
    Open,
    Settled,
    Cancelled,
}

#[contracttype]
#[derive(Clone)]
pub struct Round {
    pub id: u32,
    pub creator: Address,
    pub start_time: u64,    // When round was created
    pub lock_time: u64,     // 50% mark — no new bets after this
    pub end_time: u64,      // When round ends — settle/cancel after this
    pub min_stake: i128,
    pub total_pool: i128,
    pub status: RoundStatus,
    pub settle_price: i128, // micro-USD (e.g. 135_000 = $0.135000)
}

#[contracttype]
#[derive(Clone)]
pub struct Bet {
    pub bettor: Address,
    pub predicted_price: i128, // micro-USD
    pub stake_amount: i128,    // stroops
}

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized      = 1,
    RoundNotFound           = 2,
    RoundLocked             = 3,  // After lock_time (50% mark)
    RoundNotOpen            = 4,
    StakeTooLow             = 5,
    InvalidPrediction       = 6,
    RoundFull               = 7,
    AlreadyBet              = 8,
    TooEarly                = 9,  // Before end_time
    AlreadySettled          = 10,
    NotSettled              = 11,
    NoReward                = 12,
    NoBet                   = 13,
    InvalidTime             = 14, // end_time < now + 10min
    NotEnoughParticipants   = 15, // < 2 participants at settle
    EnoughParticipants      = 16, // >= 2 participants, use settle not cancel
}
