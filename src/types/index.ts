export type PredictionStatus = 'LIVE' | 'LOCKED' | 'WON' | 'LOST' | 'OPEN' | 'PENDING' | 'SUCCESS' | 'FAILED';
export type Sentiment = 'BULLISH' | 'BEARISH';

export interface Participant {
  id: string;
  rank: number;
  walletAddress: string;
  avatarUrl: string;
  prediction: number;
  sentiment: Sentiment;
  stake: number;
  timestamp: string;
  status: PredictionStatus;
  isUser?: boolean;
}

export interface Round {
  id: string;
  pair: string;
  currentPrice: number;
  priceChange: number;
  timer: string;
  poolSize: number;
  avgPrediction: number;
  participants: number;
  status: PredictionStatus;
}

export interface Transaction {
  id: string;
  type: 'Reward' | 'Stake' | 'Deposit' | 'Withdraw';
  amount: number;
  status: PredictionStatus;
  timestamp: string;
  hash: string;
  currency: string;
}

export interface Position {
  id: string;
  roundId: string;
  pair: string;
  predictedPrice: number;
  stakeAmount: number;
  status: PredictionStatus;
  yield?: number;
  asset: string;
  outcome?: 'Successful' | 'Unsuccessful' | 'Pending';
  sentiment: Sentiment;
  timestamp: string;
  expiryPrice?: number;
}
