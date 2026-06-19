import React, { useState, useEffect } from 'react';
import { Trophy, Users, DollarSign, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { cn } from '../../lib/utils';
import { api, ApiRound, RoundLeaderboardEntry } from '../../services/api';
import styles from './HistoryPage.module.css';

// Format UTC+7
function formatUTC7(dateStr: string): string {
  const d = new Date(dateStr);
  const utc7 = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${utc7.getUTCFullYear()}-${pad(utc7.getUTCMonth() + 1)}-${pad(utc7.getUTCDate())} ${pad(utc7.getUTCHours())}:${pad(utc7.getUTCMinutes())} UTC+7`;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

interface RoundWithWinners extends ApiRound {
  winners?: RoundLeaderboardEntry[];
}

const StatusBadge = ({ status }: { status: string }) => {
  const map: Record<string, string> = {
    Settled: styles.badgeSettled,
    Cancelled: styles.badgeCancelled,
    Open: styles.badgeOpen,
    Locked: styles.badgeLocked,
  };
  return (
    <span className={cn(styles.badge, map[status] ?? styles.badgeOpen)}>
      {status}
    </span>
  );
};

export const HistoryPage = () => {
  const [rounds, setRounds] = useState<RoundWithWinners[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 10;

  useEffect(() => {
    setLoading(true);
    api.rounds.list({ page, limit, status: 'Settled' })
      .then(async (res) => {
        setTotal(res.pagination.total);
        setTotalPages(res.pagination.totalPages);

        // Fetch top 2 winners for each settled round in parallel
        const withWinners = await Promise.all(
          res.data.map(async (round) => {
            try {
              const winners = await api.leaderboard.getByRound(round.contractRoundId);
              return { ...round, winners: winners.slice(0, 2) };
            } catch {
              return { ...round, winners: [] };
            }
          })
        );
        setRounds(withWinners);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Round History</h1>
        <p className={styles.subTitle}>All settled rounds — results, oracle price, and winners.</p>
      </header>

      <div className={styles.ledgerContainer}>
        <div className={styles.ledgerHeader}>
          <span className={styles.ledgerTitle}>Settled Rounds</span>
          <span className={styles.ledgerCount}>{total} rounds</span>
        </div>

        {loading ? (
          <div className={styles.loadingState}>
            <div className={styles.spinner} />
            <span className={styles.loadingText}>Fetching round database...</span>
          </div>
        ) : rounds.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIconContainer}>
              <Trophy className={styles.emptyIcon} />
            </div>
            <h3 className={styles.emptyTitle}>No Settled Rounds Yet</h3>
            <p className={styles.emptyDescription}>
              Once prediction rounds are completed and settled by the oracle, they will be listed here.
            </p>
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr className={styles.tableHead}>
                  <th className={styles.th}>Round</th>
                  <th className={styles.th}>
                    <span className={styles.headerIconWrapper}><Users size={12} /> Participants</span>
                  </th>
                  <th className={styles.th}>
                    <span className={styles.headerIconWrapper}><DollarSign size={12} /> Oracle Price</span>
                  </th>
                  <th className={styles.th}>Pool (XLM)</th>
                  <th className={styles.th}>
                    <span className={styles.headerIconWrapper}><Trophy size={12} className={styles.goldTrophy} /> 🥇 Top 1</span>
                  </th>
                  <th className={styles.th}>
                    <span className={styles.headerIconWrapper}><Trophy size={12} className={styles.silverTrophy} /> 🥈 Top 2</span>
                  </th>
                  <th className={styles.th}>End Time</th>
                  <th className={styles.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rounds.map((round) => {
                  const top1 = round.winners?.[0];
                  const top2 = round.winners?.[1];
                  return (
                    <tr key={round.contractRoundId} className={styles.tableRow}>
                      {/* Round ID */}
                      <td className={styles.td}>
                        <span className={styles.roundId}>#{round.contractRoundId}</span>
                      </td>

                      {/* Participants */}
                      <td className={styles.td}>
                        <span className={styles.participants}>{round.participantCount}</span>
                      </td>

                      {/* Oracle settle price */}
                      <td className={styles.td}>
                        <span className={styles.price}>
                          {round.settlePrice != null
                            ? `$${round.settlePrice.toFixed(6)}`
                            : '—'}
                        </span>
                      </td>

                      {/* Pool */}
                      <td className={styles.td}>
                        <span className={styles.pool}>{round.totalPoolXlm.toFixed(0)} XLM</span>
                      </td>

                      {/* Top 1 */}
                      <td className={styles.td}>
                        {top1 ? (
                          <div className={styles.winnerCell}>
                            <span className={styles.winnerAddr}>{shortAddr(top1.bettorAddress)}</span>
                            <span className={styles.winnerReward}>+{top1.rewardXlm.toFixed(2)} XLM</span>
                          </div>
                        ) : <span className={styles.mutedDash}>—</span>}
                      </td>

                      {/* Top 2 */}
                      <td className={styles.td}>
                        {top2 ? (
                          <div className={styles.winnerCell}>
                            <span className={styles.winnerAddr}>{shortAddr(top2.bettorAddress)}</span>
                            <span className={styles.winnerReward2}>+{top2.rewardXlm.toFixed(2)} XLM</span>
                          </div>
                        ) : <span className={styles.mutedDash}>—</span>}
                      </td>

                      {/* End time UTC+7 */}
                      <td className={styles.td}>
                        <span className={styles.timestamp}>{formatUTC7(round.endTime)}</span>
                      </td>

                      {/* Status */}
                      <td className={styles.td}>
                        <StatusBadge status={round.status} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className={styles.footer}>
            <span>Page {page} / {totalPages} · {total} rounds</span>
            <div className={styles.pagination}>
              <button
                className={styles.pageButton}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className={styles.arrowIcon} />
              </button>
              <span className={cn(styles.pageButton, styles.activePageButton)}>{page}</span>
              <button
                className={styles.pageButton}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className={styles.arrowIcon} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
