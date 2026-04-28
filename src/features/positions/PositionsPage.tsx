import React, { useState, useEffect } from 'react';
import { Clock, PlusCircle, Download } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useToast } from '../../lib/useToast';
import { api, ApiPosition } from '../../services/api';
import { useWallet } from '../../lib/walletContext';
import styles from './PositionsPage.module.css';

const PositionCard = ({ position }: { position: ApiPosition }) => {
  const outcomeStyle =
    position.outcome === 'Won' ? styles.won :
    position.outcome === 'Lost' ? styles.lost : styles.pending;

  return (
    <div className={cn('glass-card', styles.positionCard, outcomeStyle)}>
      <div className={styles.cardHeader}>
        <div>
          <span className={styles.roundId}>Round #{position.roundId}</span>
          <h3 className={styles.pairName}>{position.pair}</h3>
        </div>
        <span className={cn(styles.pnlBadge, outcomeStyle)}>{position.outcome}</span>
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

      {position.outcome === 'Won' && position.rewardXlm > 0 && (
        <div className={cn(styles.resultNotification, styles.wonArea)}>
          <div className={styles.resultInfo}>
            <p className={styles.resultLabel}>You won</p>
            <p className={styles.resultValue}>{position.rewardXlm.toFixed(2)} XLM</p>
          </div>
          {!position.claimed && (
            <span className="text-xs text-emerald-400 font-bold">Claimable</span>
          )}
        </div>
      )}

      {position.outcome === 'Lost' && position.settlePrice && (
        <div className={styles.expiryNote}>
          Settled at <span className={styles.expiryPrice}>${position.settlePrice.toFixed(6)}</span>
        </div>
      )}

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
  const { address } = useWallet();
  const { showToast, ToastUI } = useToast();
  const [positions, setPositions] = useState<ApiPosition[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    api.bets.getPositions(address)
      .then(setPositions)
      .catch(e => showToast('error', 'Failed to load positions'))
      .finally(() => setLoading(false));
  }, [address]);

  const totalWins = positions.filter(p => p.outcome === 'Won').length;
  const winRate = positions.length > 0 ? ((totalWins / positions.length) * 100).toFixed(1) : '0';
  const netEarnings = positions.reduce((s, p) => s + p.rewardXlm - p.stakeAmountXlm, 0);

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
            <PositionCard key={`${p.roundId}-${i}`} position={p} />
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
