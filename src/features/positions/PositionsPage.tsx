import React from 'react';
import { 
  Trophy, 
  TrendingUp, 
  ArrowUpRight, 
  History, 
  Clock, 
  Download, 
  PlusCircle,
  Gem
} from 'lucide-react';
import { userPositions } from '../../services/mockData';
import { cn, formatCurrency } from '../../lib/utils';
import { PredictionStatus } from '../../types';

interface PositionCardProps {
  position: typeof userPositions[0];
}

import styles from './PositionsPage.module.css';

interface PositionCardProps {
  position: typeof userPositions[0];
}

const PositionCard = ({ position }: PositionCardProps) => {
  const getStatusStyle = (status: PredictionStatus) => {
    switch (status) {
      case 'WON': return styles.won;
      case 'LOST': return styles.lost;
      case 'PENDING': return styles.pending;
      default: return styles.open;
    }
  };

  return (
    <div className={cn("glass-card", styles.positionCard, getStatusStyle(position.status))}>
      <div className={styles.cardHeader}>
        <div>
          <span className={styles.roundId}>{position.roundId}</span>
          <h3 className={styles.pairName}>{position.pair}</h3>
        </div>
        <span className={cn(styles.pnlBadge, getStatusStyle(position.status))}>
          {position.status}
        </span>
      </div>

      <div className={styles.cardGrid}>
        <div className={styles.cardStat}>
          <p className={styles.cardStatLabel}>Predicted Price</p>
          <p className={styles.cardStatValue}>${position.predictedPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </div>
        <div className={styles.cardStat}>
          <p className={styles.cardStatLabel}>Stake Amount</p>
          <p className={styles.cardStatValue}>{position.stakeAmount} XLM</p>
        </div>
      </div>

      {position.status === 'WON' && (
        <div className={cn(styles.resultNotification, styles.wonArea)}>
          <div className={styles.resultInfo}>
            <p className={styles.resultLabel}>You won</p>
            <p className={styles.resultValue}>{position.yield} XLM</p>
          </div>
          <button className={styles.claimButton}>
            Claim
          </button>
        </div>
      )}

      {position.status === 'LOST' && (
        <div className={styles.expiryNote}>
          Prediction expired at <span className={styles.expiryPrice}>${position.expiryPrice?.toLocaleString()}</span>
        </div>
      )}

      {position.status === 'OPEN' && (
        <div className={styles.timerArea}>
          <Clock className={styles.timerIcon} />
          <span>Ends in 02:14:45</span>
        </div>
      )}

      {position.status === 'PENDING' && (
        <div className={styles.pendingArea}>
          <div className={styles.pendingPulse}></div>
          <span className={styles.pendingLabel}>Finalizing result...</span>
        </div>
      )}
    </div>
  );
};

export const PositionsPage = () => {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <h1 className={styles.title}>My Positions</h1>
          <p className={styles.subTitle}>Manage your active predictions and claim your rewards from the cosmos.</p>
        </div>
        <div className={styles.quickStats}>
          <div className={cn("glass-card", styles.quickStatCard)}>
            <span className={styles.quickStatLabel}>Total Win Rate</span>
            <span className={styles.quickStatValue}>68.4%</span>
          </div>
          <div className={cn("glass-card", styles.quickStatCard)}>
            <span className={styles.quickStatLabel}>Net Earnings</span>
            <span className={styles.quickStatValue}>+1,240 XLM</span>
          </div>
        </div>
      </header>

      <div className={styles.positionsGrid}>
        {userPositions.map((p) => (
          <PositionCard key={p.id} position={p} />
        ))}
        
        <div className={cn("glass-card", styles.newPredictionCard)}>
          <div className={styles.plusIconArea}>
            <PlusCircle className={styles.plusIcon} />
          </div>
          <p className={styles.newPredictTitle}>New Prediction</p>
          <p className={styles.newPredictSub}>Predict the next price movement</p>
        </div>
      </div>

      <section className={styles.ledgerSection}>
        <div className={styles.ledgerHeader}>
          <h2 className={styles.ledgerTitle}>Activity Ledger</h2>
          <button className={styles.exportButton}>
            Export CSV 
            <Download className={styles.exportIcon} />
          </button>
        </div>

        <div className={cn("glass-card", styles.tableContainer)}>
          <table className={styles.table}>
            <thead>
              <tr className={styles.tableHead}>
                <th className={styles.th}>Timestamp</th>
                <th className={styles.th}>Asset</th>
                <th className={styles.th}>Position</th>
                <th className={styles.th}>Outcome</th>
                <th className={cn(styles.th, styles.alignRight)}>Yield</th>
              </tr>
            </thead>
            <tbody>
              {userPositions.filter(p => p.status !== 'OPEN').map((p) => (
                <tr key={p.id} className={styles.tableRow}>
                  <td className={styles.timestampCell}>{p.timestamp}</td>
                  <td className={styles.assetCell}>{p.asset}</td>
                  <td className={styles.td}>
                    <span className={cn(styles.sentimentText, p.sentiment === 'BULLISH' ? styles.bullish : styles.bearish)}>
                      {p.sentiment === 'BULLISH' ? 'Bullish' : 'Bearish'}
                    </span>
                  </td>
                  <td className={styles.td}>
                    <span className={cn(styles.outcomeText, p.outcome === 'Successful' ? styles.success : styles.fail)}>
                      {p.outcome}
                    </span>
                  </td>
                  <td className={styles.yieldCell}>
                    {p.status === 'WON' ? `+${p.yield}.00 XLM` : `-${Math.abs(p.stakeAmount).toFixed(2)} XLM`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
