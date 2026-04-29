import React, { useState, useEffect, useCallback } from 'react';
import { Clock, PlusCircle, CheckCircle, RefreshCw } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useToast } from '../../lib/useToast';
import { api, ApiPosition } from '../../services/api';
import { useWallet } from '../../lib/walletContext';
import { claimReward } from '../../services/contract';
import styles from './PositionsPage.module.css';

interface PositionCardProps {
  position: ApiPosition;
  onClaim: (roundId: number) => Promise<void>;
  claiming: boolean;
}

const PositionCard = ({ position, onClaim, claiming }: PositionCardProps) => {
  const outcomeStyle =
    position.outcome === 'Won' ? styles.won :
    position.outcome === 'Lost' ? styles.lost :
    position.outcome === 'Refunded' ? styles.pending :
    styles.pending;

  const outcomeLabel =
    position.outcome === 'Refunded' ? '↩ Refunded' : position.outcome;

  return (
    <div className={cn('glass-card', styles.positionCard, outcomeStyle)}>
      <div className={styles.cardHeader}>
        <div>
          <span className={styles.roundId}>Round #{position.roundId}</span>
          <h3 className={styles.pairName}>{position.pair}</h3>
        </div>
        <span className={cn(styles.pnlBadge, outcomeStyle)}>{outcomeLabel}</span>
      </div>

      <div className={styles.cardGrid}>
        <div className={styles.cardStat}>
          <p className={styles.cardStatLabel}>Predicted Price</p>
          <p className={styles.cardStatValue}>${position.predictedPriceUsd.toFixed(6)}</p>
        </div>
        <div className={styles.cardStat}>
          <p className={styles.cardStatLabel}>Stake Amount</p>
          <p className={styles.cardStatValue}>{position.stakeAmountXlm.toFixed(2)} XLM</p>
        </div>
      </div>

      {/* Won — show reward + claim button */}
      {position.outcome === 'Won' && position.rewardXlm > 0 && (
        <div className={cn(styles.resultNotification, styles.wonArea)}>
          <div className={styles.resultInfo}>
            <p className={styles.resultLabel}>
              {position.rank === 1 ? '🥇 1st Place' : '🥈 2nd Place'}
            </p>
            <p className={styles.resultValue}>{position.rewardXlm.toFixed(2)} XLM</p>
          </div>
          {position.claimed ? (
            <span className={cn(styles.claimedBadge, 'flex items-center gap-1 text-xs text-gray-400')}>
              <CheckCircle size={12} /> Claimed
            </span>
          ) : (
            <button
              className={styles.claimButton}
              onClick={() => onClaim(position.roundId)}
              disabled={claiming}
            >
              {claiming ? (
                <span className="flex items-center gap-1">
                  <RefreshCw size={12} className="animate-spin" /> Claiming...
                </span>
              ) : (
                'Claim'
              )}
            </button>
          )}
        </div>
      )}

      {/* Lost — show settle price */}
      {position.outcome === 'Lost' && position.settlePrice && (
        <div className={styles.expiryNote}>
          Settled at <span className={styles.expiryPrice}>${position.settlePrice.toFixed(6)}</span>
          {position.rank !== null && (
            <span className="ml-2 text-gray-500">· Rank #{position.rank}</span>
          )}
        </div>
      )}

      {/* Refunded — round was cancelled (< 3 participants), stake returned on-chain */}
      {position.outcome === 'Refunded' && (
        <div className={styles.expiryNote}>
          Round cancelled — stake of{' '}
          <span className={styles.expiryPrice}>{position.stakeAmountXlm.toFixed(2)} XLM</span>{' '}
          was refunded to your wallet automatically.
        </div>
      )}

      {/* Pending */}
      {position.outcome === 'Pending' && (
        <div className={styles.timerArea}>
          <Clock className={styles.timerIcon} />
          <span>Awaiting settlement</span>
        </div>
      )}
    </div>
  );
};

export const PositionsPage = () => {
  const { address, signTx } = useWallet();
  const { showToast, ToastUI } = useToast();
  const [positions, setPositions] = useState<ApiPosition[]>([]);
  const [loading, setLoading] = useState(false);
  const [claimingRound, setClaimingRound] = useState<number | null>(null);

  const loadPositions = useCallback(() => {
    if (!address) return;
    setLoading(true);
    api.bets.getPositions(address)
      .then(setPositions)
      .catch(() => showToast('error', 'Failed to load positions'))
      .finally(() => setLoading(false));
  }, [address]);

  useEffect(() => {
    loadPositions();
  }, [loadPositions]);

  const handleClaim = useCallback(async (roundId: number) => {
    if (!address) return;
    setClaimingRound(roundId);
    try {
      // 1. Build + sign + submit claim_reward on-chain
      const txHash = await claimReward(address, roundId, signTx);

      // 2. Record claim in backend DB (idempotent)
      await api.rewards.recordClaim({ address, roundId, txHash });

      showToast('success', `Reward claimed! Tx: ${txHash.slice(0, 8)}…`);

      // 3. Refresh positions so card flips to "Claimed"
      loadPositions();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Claim failed';
      showToast('error', msg);
    } finally {
      setClaimingRound(null);
    }
  }, [address, signTx, loadPositions]);

  const totalWins = positions.filter(p => p.outcome === 'Won').length;
  const winRate = positions.length > 0 ? ((totalWins / positions.length) * 100).toFixed(1) : '0';
  const netEarnings = positions.reduce((s, p) => {
    if (p.outcome === 'Won') return s + p.rewardXlm - p.stakeAmountXlm;
    if (p.outcome === 'Lost') return s - p.stakeAmountXlm;
    return s; // Pending / Refunded don't count yet
  }, 0);

  return (
    <div className={styles.container}>
      {ToastUI}
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>My Positions</h1>
          <p className={styles.subTitle}>Manage your active predictions and claim your rewards.</p>
        </div>
        <div className={styles.quickStats}>
          <div className={cn('glass-card', styles.quickStatCard)}>
            <span className={styles.quickStatLabel}>Win Rate</span>
            <span className={styles.quickStatValue}>{winRate}%</span>
          </div>
          <div className={cn('glass-card', styles.quickStatCard)}>
            <span className={styles.quickStatLabel}>Net Earnings</span>
            <span className={styles.quickStatValue}>
              {netEarnings >= 0 ? '+' : ''}{netEarnings.toFixed(2)} XLM
            </span>
          </div>
        </div>
      </header>

      {!address ? (
        <div className="glass-card p-8 text-center text-gray-500">
          Connect your wallet to view positions
        </div>
      ) : loading ? (
        <div className="glass-card p-8 text-center text-gray-500">Loading positions...</div>
      ) : (
        <div className={styles.positionsGrid}>
          {positions.map((p, i) => (
            <PositionCard
              key={`${p.roundId}-${i}`}
              position={p}
              onClaim={handleClaim}
              claiming={claimingRound === p.roundId}
            />
          ))}
          <div className={cn('glass-card', styles.newPredictionCard)}>
            <div className={styles.plusIconArea}>
              <PlusCircle className={styles.plusIcon} />
            </div>
            <p className={styles.newPredictTitle}>New Prediction</p>
            <p className={styles.newPredictSub}>Predict the next price movement</p>
          </div>
        </div>
      )}
    </div>
  );
};
