import React, { useState, useEffect } from 'react';
import {
  TrendingUp, Search, ExternalLink, History as HistoryIcon,
  ChevronLeft, ChevronRight, Download,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { api, ApiTransaction } from '../../services/api';
import { useWallet } from '../../lib/walletContext';
import styles from './HistoryPage.module.css';

const StatusBadge = ({ status }: { status: string }) => {
  const s = status.toUpperCase();
  const badgeStyles: Record<string, string> = {
    CONFIRMED: styles.successBadge,
    PENDING: styles.pendingBadge,
    FAILED: styles.failedBadge,
  };
  return (
    <div className={cn(styles.statusBadge, badgeStyles[s] ?? styles.pendingBadge)}>
      <span className={cn(styles.badgeDot, s === 'CONFIRMED' ? styles.successDot : s === 'PENDING' ? styles.pendingDot : styles.failedDot)} />
      {s}
    </div>
  );
};

export const HistoryPage = () => {
  const { address } = useWallet();
  const [transactions, setTransactions] = useState<ApiTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const limit = 20;

  useEffect(() => {
    if (!address) return;
    setLoading(true);
    api.users.getHistory(address, { page, limit })
      .then(res => {
        setTransactions(res.data);
        setTotal(res.pagination.total);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [address, page]);

  const filtered = transactions.filter(tx =>
    !search || tx.txHash?.toLowerCase().includes(search.toLowerCase())
  );

  const totalPages = Math.ceil(total / limit);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Transaction History</h1>
        <p className={styles.subTitle}>A chronological ledger of your stellar interactions.</p>
      </header>

      <div className={styles.ledgerContainer}>
        <div className={styles.ledgerHeader}>
          <div className={styles.filterTabs}>
            <button className={cn(styles.filterTab, styles.activeFilterTab)}>All Activities</button>
          </div>
          <div className={styles.searchWrapper}>
            <Search className={styles.searchIcon} />
            <input
              className={styles.searchInput}
              placeholder="Search hash..."
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {!address ? (
          <div className="p-8 text-center text-gray-500">Connect your wallet to view history</div>
        ) : loading ? (
          <div className="p-8 text-center text-gray-500">Loading...</div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr className={styles.tableHead}>
                  <th className={styles.th}>Type</th>
                  <th className={styles.th}>Amount (XLM)</th>
                  <th className={styles.th}>Status</th>
                  <th className={styles.th}>Round</th>
                  <th className={cn(styles.th, styles.alignRight)}>Transaction Hash</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(tx => (
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
                      <span className={cn(styles.amount, tx.amountXlm > 0 && styles.positive)}>
                        {tx.type === 'Stake' ? `- ${tx.amountXlm.toFixed(2)}` : `+ ${tx.amountXlm.toFixed(2)}`} XLM
                      </span>
                    </td>
                    <td className={styles.td}>
                      <StatusBadge status={tx.status} />
                    </td>
                    <td className={styles.td}>
                      {tx.roundId ? `#${tx.roundId}` : '—'}
                    </td>
                    <td className={cn(styles.td, styles.hash)}>
                      {tx.txHash ? (
                        <a
                          className={styles.hashLink}
                          href={`https://stellar.expert/explorer/testnet/tx/${tx.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          {tx.txHash.slice(0, 8)}...{tx.txHash.slice(-6)}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : '—'}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500">No transactions yet</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className={styles.footer}>
            <div>Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total}</div>
            <div className={styles.pagination}>
              <button className={styles.pageButton} onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button className={cn(styles.pageButton, styles.activePageButton)}>{page}</button>
              <button className={styles.pageButton} onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
