import React, { useState, useEffect } from 'react';
import { Search, SlidersHorizontal as Sliders, Trophy } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useToast } from '../../lib/useToast';
import { api, LeaderboardEntry } from '../../services/api';
import styles from './LeaderboardPage.module.css';

export const LeaderboardPage = () => {
  const { showToast, ToastUI } = useToast();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.leaderboard.getGlobal({ limit: 50 })
      .then(res => setEntries(res.data))
      .catch(() => showToast('error', 'Failed to load leaderboard'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = entries.filter(e =>
    e.walletAddress.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h1 className={styles.title}>Market Oracle</h1>
          <p className={styles.description}>
            Live prediction leaderboard for the XLM/USDC pair.
          </p>
        </div>
        <div className={styles.controls}>
          <div className={styles.searchBox}>
            <Search className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder="Filter by Wallet..."
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <button className={styles.filterButton}>
            <Sliders className={styles.filterIcon} />
            <span className={styles.filterLabel}>Filters</span>
          </button>
        </div>
      </div>

      <div className={cn('glass-card', styles.leaderboardTableContainer)}>
        {loading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <span className={styles.loadingText}>Fetching oracle standings...</span>
          </div>
        ) : (
          <div className={styles.tableContainer}>
            <table className={styles.table}>
              <thead>
                <tr className={styles.tableHead}>
                  <th className={styles.tableHeadCell}>Rank</th>
                  <th className={styles.tableHeadCell}>Wallet</th>
                  <th className={styles.tableHeadCell}>Wins / Bets</th>
                  <th className={cn(styles.tableHeadCell, styles.alignRight)}>Win Rate</th>
                  <th className={cn(styles.tableHeadCell, styles.alignRight)}>Rewards (XLM)</th>
                  <th className={cn(styles.tableHeadCell, styles.alignRight)}>Staked (XLM)</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(entry => (
                  <tr key={entry.walletAddress} className={styles.tableRow}>
                    <td className={styles.tableCell}>
                      <div className={styles.rankCell}>
                        {entry.rank <= 3 && (
                          <Trophy className={cn(
                            styles.rankIcon,
                            entry.rank === 1 ? styles.gold : entry.rank === 2 ? styles.silver : styles.bronze
                          )} />
                        )}
                        <span className={styles.rankNumber}>{String(entry.rank).padStart(2, '0')}</span>
                      </div>
                    </td>
                    <td className={styles.tableCell}>
                      <span className={styles.walletAddress}>
                        {entry.walletAddress.slice(0, 6)}...{entry.walletAddress.slice(-4)}
                      </span>
                    </td>
                    <td className={styles.tableCell}>{entry.totalWins} / {entry.totalBets}</td>
                    <td className={cn(styles.tableCell, styles.alignRight)}>{entry.winRate.toFixed(1)}%</td>
                    <td className={cn(styles.tableCell, styles.alignRight)}>
                      {entry.totalRewardsXlm.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                    <td className={cn(styles.tableCell, styles.alignRight)}>
                      {entry.totalStakedXlm.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6}>
                      <div className={styles.emptyState}>
                        <div className={styles.emptyIconContainer}>
                          <Trophy className={styles.emptyIcon} />
                        </div>
                        <h3 className={styles.emptyTitle}>
                          {entries.length === 0 ? 'No Leaderboard Data' : 'No Results Found'}
                        </h3>
                        <p className={styles.emptyDescription}>
                          {entries.length === 0
                            ? 'Be the first to predict and claim the top spot!'
                            : 'No wallets match your filter search.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
