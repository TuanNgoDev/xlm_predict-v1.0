import React from 'react';
import { Search, SlidersHorizontal as Sliders, Trophy } from 'lucide-react';
import { leaderboardData } from '../../services/mockData';
import { cn, formatCurrency } from '../../lib/utils';

import styles from './LeaderboardPage.module.css';

export const LeaderboardPage = () => {
  return (
    <div className={styles.container}>
      {/* Header Section */}
      <div className={styles.header}>
        <div className={styles.titleArea}>
          <h1 className={styles.title}>Market Oracle</h1>
          <p className={styles.description}>
            Live prediction leaderboard for the XLM/USDC pair. Higher accuracy and larger stakes climb the rankings.
          </p>
        </div>
        <div className={styles.controls}>
          <div className={styles.searchBox}>
            <Search className={styles.searchIcon} />
            <input 
              className={styles.searchInput}
              placeholder="Filter by Wallet..."
              type="text"
            />
          </div>
          <button className={styles.filterButton}>
            <Sliders className={styles.filterIcon} />
            <span className={styles.filterLabel}>Filters</span>
          </button>
        </div>
      </div>

      {/* Bento Stats Grid */}
      <div className={styles.statsGrid}>
        <div className={cn("glass-card", styles.statCard)}>
          <span className={styles.statLabel}>Total Pool</span>
          <div className={styles.statValueArea}>
            <span className={styles.statValue}>45,820</span>
            <span className={styles.statUnit}>XLM</span>
          </div>
        </div>
        <div className={cn("glass-card", styles.statCard)}>
          <span className={styles.statLabel}>Active Rounds</span>
          <div className={styles.statValueArea}>
            <span className={styles.statValue}>12</span>
            <span className={styles.liveBadge}>LIVE NOW</span>
          </div>
        </div>
        <div className={cn("glass-card", styles.statCard)}>
          <span className={styles.statLabel}>Your Standing</span>
          <div className={styles.statValueArea}>
            <span className={cn(styles.statValue, styles.primaryText)}>#42</span>
            <span className={cn(styles.paginationInfo, styles.statSub)}>Top 5%</span>
          </div>
        </div>
        <div className={cn("glass-card", styles.statCard, styles.sentimentCard)}>
          <div className={styles.sentimentContent}>
            <p className={styles.sentimentTitle}>Global Sentiment</p>
            <div className={styles.sentimentBar}>
              <div className={styles.sentimentBullish}></div>
              <div className={styles.sentimentBearish}></div>
            </div>
            <div className={styles.sentimentLabels}>
              <span className={styles.primaryText}>67% BULLISH</span>
              <span className={styles.bearishText}>33% BEARISH</span>
            </div>
          </div>
        </div>
      </div>

      {/* Leaderboard Table */}
      <div className={cn("glass-card", styles.leaderboardTableContainer)}>
        <div className={styles.tableContainer}>
          <table className={styles.table}>
            <thead>
              <tr className={styles.tableHead}>
                <th className={styles.tableHeadCell}>Rank</th>
                <th className={styles.tableHeadCell}>Participant</th>
                <th className={styles.tableHeadCell}>Prediction</th>
                <th className={cn(styles.tableHeadCell, styles.alignRight)}>Stake (XLM)</th>
                <th className={cn(styles.tableHeadCell, styles.alignRight)}>Timestamp</th>
                <th className={cn(styles.tableHeadCell, styles.alignCenter)}>Status</th>
              </tr>
            </thead>
            <tbody>
              {leaderboardData.map((person) => (
                <tr 
                  key={person.id} 
                  className={cn(
                    styles.tableRow,
                    person.isUser && styles.userRow
                  )}
                >
                  <td className={styles.tableCell}>
                    <div className={styles.rankCell}>
                      {person.rank <= 3 && <Trophy className={cn(styles.rankIcon, person.rank === 1 ? styles.gold : person.rank === 2 ? styles.silver : styles.bronze)} />}
                      <span className={cn(styles.rankNumber, person.isUser && styles.userRankNumber)}>
                        {person.rank.toString().padStart(2, '0')}
                      </span>
                    </div>
                  </td>
                  <td className={styles.tableCell}>
                    <div className={styles.participantCell}>
                      <div className={styles.avatar}>
                        {person.avatarUrl ? (
                          <img src={person.avatarUrl} alt="" className={styles.avatarImg} />
                        ) : (
                          <span className={styles.avatarPlaceholder}>YOU</span>
                        )}
                      </div>
                      <div className={styles.participantInfo}>
                        <span className={cn(styles.walletAddress, person.isUser && styles.userWalletAddress)}>
                          {person.isUser ? `You (${person.walletAddress})` : person.walletAddress}
                        </span>
                        {person.isUser && <span className={styles.userSub}>Current Position</span>}
                      </div>
                    </div>
                  </td>
                  <td className={styles.tableCell}>
                    <div className={styles.predictionCell}>
                      <span className={cn(styles.predictionValue, person.sentiment === 'BULLISH' ? styles.bullish : styles.bearish)}>
                        ${person.prediction.toFixed(4)}
                      </span>
                      <span className={styles.sentimentTag}>{person.sentiment}</span>
                    </div>
                  </td>
                  <td className={styles.stakeCell}>
                    {person.stake.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                  <td className={styles.timestampCell}>
                    {person.timestamp}
                  </td>
                  <td className={styles.tableCell}>
                    <div className={styles.statusCell}>
                      {person.status === 'LIVE' ? (
                        <span className={cn("live-pulse", styles.live)}>LIVE</span>
                      ) : (
                        <span className={styles.locked}>LOCKED</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {/* Pagination */}
        <div className={styles.pagination}>
          <p className={styles.paginationInfo}>Showing <span className={styles.bold}>1 - 25</span> of 1,248 participants</p>
          <div className={styles.paginationButtons}>
            {[1, 2, 3, '...', 50].map((page, i) => (
              <button 
                key={i}
                className={cn(
                  styles.pageButton,
                  page === 1 && styles.activePage,
                  typeof page !== 'number' && styles.ellipsis
                )}
              >
                {page}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
