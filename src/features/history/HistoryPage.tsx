import React from 'react';
import { 
  TrendingUp, 
  Search, 
  ArrowUpRight, 
  Receipt, 
  Download, 
  ChevronLeft, 
  ChevronRight,
  ExternalLink,
  History as HistoryIcon
} from 'lucide-react';
import { transactions } from '../../services/mockData';
import { cn } from '../../lib/utils';
import { PredictionStatus } from '../../types';

import styles from './HistoryPage.module.css';

const StatusBadge = ({ status }: { status: PredictionStatus }) => {
  const badgeStyles: Record<string, string> = {
    SUCCESS: styles.successBadge,
    PENDING: styles.pendingBadge,
    FAILED: styles.failedBadge,
  };

  return (
    <div className={cn(styles.statusBadge, badgeStyles[status])}>
      <span className={cn(styles.badgeDot, status === 'SUCCESS' ? styles.successDot : status === 'PENDING' ? styles.pendingDot : styles.failedDot)}></span>
      {status}
    </div>
  );
};

export const HistoryPage = () => {
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Transaction History</h1>
        <p className={styles.subTitle}>A chronological ledger of your stellar interactions and predictions.</p>
      </header>

      {/* Stats Overview */}
      <div className={styles.statsGrid}>
        <div className={styles.volumeCard}>
          <div className={styles.volumeContent}>
            <div className={styles.statTinyLabel}>Total Activity Volume</div>
            <div className={styles.volumeValue}>42,850.25 <span className={styles.volumeUnit}>XLM</span></div>
            <div className={styles.trendArea}>
              <TrendingUp className="w-4 h-4" />
              <span className={styles.trendText}>+12.4% this month</span>
            </div>
          </div>
          <div className={styles.volumeGradient}></div>
          <Receipt className={styles.volumeIcon} />
        </div>
        
        <div className={styles.successCard}>
          <div className={styles.statTinyLabel}>Successful Transactions</div>
          <div className={styles.successValue}>98.2<span className={styles.successUnit}>%</span></div>
          <div className={styles.successBarContainer}>
            <div className={styles.successBar}></div>
          </div>
        </div>
      </div>

      {/* Ledger Table Container */}
      <div className={styles.ledgerContainer}>
        <div className={styles.ledgerHeader}>
          <div className={styles.filterTabs}>
            <button className={cn(styles.filterTab, styles.activeFilterTab)}>All Activities</button>
            <button className={cn(styles.filterTab, styles.inactiveFilterTab)}>Stakes</button>
            <button className={cn(styles.filterTab, styles.inactiveFilterTab)}>Rewards</button>
          </div>
          <div className={styles.searchWrapper}>
            <Search className={styles.searchIcon} />
            <input 
              className={styles.searchInput} 
              placeholder="Search hash..." 
              type="text"
            />
          </div>
        </div>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr className={styles.tableHead}>
                <th className={styles.th}>Type</th>
                <th className={styles.th}>Amount</th>
                <th className={styles.th}>Status</th>
                <th className={styles.th}>Timestamp</th>
                <th className={cn(styles.th, styles.alignRight)}>Transaction Hash</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((tx) => (
                <tr key={tx.id} className={styles.tableRow}>
                  <td className={styles.td}>
                    <div className={styles.typeCell}>
                      <div className={styles.typeIconArea}>
                        <HistoryIcon className="w-4 h-4" />
                      </div>
                      <span className={styles.typeName}>{tx.type}</span>
                    </div>
                  </td>
                  <td className={styles.td}>
                    <span className={cn(styles.amount, tx.amount > 0 && styles.positive)}>
                      {tx.amount > 0 ? `+ ${tx.amount.toFixed(2)}` : `- ${Math.abs(tx.amount).toFixed(2)}`} {tx.currency}
                    </span>
                  </td>
                  <td className={styles.td}>
                    <StatusBadge status={tx.status} />
                  </td>
                  <td className={cn(styles.td, styles.timestamp)}>
                    {tx.timestamp}
                  </td>
                  <td className={cn(styles.td, styles.hash)}>
                    <a className={styles.hashLink} href="#">
                      {tx.hash}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={styles.footer}>
          <div>Showing 1 - 4 of 128 transactions</div>
          <div className={styles.pagination}>
            <button className={styles.pageButton} disabled>
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button className={cn(styles.pageButton, styles.activePageButton)}>1</button>
            <button className={styles.pageButton}>2</button>
            <button className={styles.pageButton}>3</button>
            <button className={styles.pageButton}>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Export Card */}
      <div className={styles.exportCard}>
        <div className={styles.exportInfo}>
          <div className={styles.exportIconArea}>
            <Download className={styles.exportIcon} />
          </div>
          <div>
            <h3 className={styles.exportTitle}>Export Ledger</h3>
            <p className={styles.exportDesc}>Download your transaction history as CSV or PDF for tax and reporting purposes.</p>
          </div>
        </div>
        <div className={styles.exportButtons}>
          <button className={styles.csvButton}>CSV</button>
          <button className={styles.pdfButton}>Download PDF</button>
        </div>
        <div className={styles.exportGlow}></div>
      </div>
    </div>
  );
};
