import React, { useState, useRef, useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Wallet, Bell, LogOut, Copy, CheckCheck, LayoutDashboard, Trophy, History } from 'lucide-react';
import { cn } from '../lib/utils';
import { useWallet } from '../lib/walletContext';
import type { WalletType } from '../services/wallet';
import styles from './Navbar.module.css';

// ── Wallet picker modal ───────────────────────────────────────────────────────
const WalletModal = ({
  onSelect,
  onClose,
  connecting,
}: {
  onSelect: (type: WalletType) => void;
  onClose: () => void;
  connecting: boolean;
}) => (
  <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
    <div className={styles.modalHeader}>
      <h3 className={styles.modalTitle}>Connect Wallet</h3>
      <p className={styles.modalSubtitle}>Select your Stellar wallet</p>
    </div>

    <div className={styles.walletList}>
      {/* Freighter */}
      <button
        onClick={() => onSelect('freighter')}
        disabled={connecting}
        className={styles.walletOption}
      >
        <div className={styles.walletIconContainer}>
          <img
            src="https://avatars.githubusercontent.com/u/74329244?s=200&v=4"
            alt="Freighter"
            className={styles.walletIcon}
            onError={(e) => { (e.target as HTMLImageElement).src = 'https://www.freighter.app/favicon.ico'; }}
          />
        </div>
        <div className={styles.walletInfo}>
          <p className={styles.walletName}>Freighter</p>
          <p className={styles.walletDesc}>Stellar Development Foundation</p>
        </div>
        <div className={styles.arrow}>→</div>
      </button>

      {/* Rabet */}
      <button
        onClick={() => onSelect('rabet')}
        disabled={connecting}
        className={styles.walletOption}
      >
        <div className={styles.walletIconContainer}>
          <img
            src="https://rabet.io/favicon.ico"
            alt="Rabet"
            className={styles.walletIcon}
            onError={(e) => { (e.target as HTMLImageElement).src = '🎭'; }}
          />
        </div>
        <div className={styles.walletInfo}>
          <p className={styles.walletName}>Rabet</p>
          <p className={styles.walletDesc}>Stellar browser extension</p>
        </div>
        <div className={styles.arrow}>→</div>
      </button>
    </div>

    {connecting && (
      <div className="mt-4 flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
        <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
        <p className="text-xs font-medium text-cyan-400">Connecting...</p>
      </div>
    )}
  </div>
);

// ── Navbar ────────────────────────────────────────────────────────────────────
export const Navbar = () => {
  const { address, connecting, connect, disconnect, xlmBalance, isModalOpen, setModalOpen } = useWallet();
  const [copied, setCopied] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const addressBtnRef = useRef<HTMLButtonElement>(null);
  const connectRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        addressBtnRef.current && !addressBtnRef.current.contains(e.target as Node)
      ) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  // Close connect popover on outside click
  useEffect(() => {
    if (!isModalOpen) return;
    const handler = (e: MouseEvent) => {
      if (connectRef.current && !connectRef.current.contains(e.target as Node)) {
        setModalOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isModalOpen, setModalOpen]);

  const handleCopy = () => {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSelectWallet = async (type: WalletType) => {
    await connect(type);
  };

  const short = address ? `${address.slice(0, 4)}...${address.slice(-4)}` : null;

  return (
    <>
      <header className={styles.header}>
        {/* Left: Logo + Nav */}
        <div className={styles.left}>
          <span className={styles.logo}>Stellar Predict</span>
          <nav className={styles.nav}>
            <NavLink to="/" className={({ isActive }) => cn(styles.navItem, isActive && styles.activeNavItem)}>
              <LayoutDashboard className="w-4 h-4" />
              Home
            </NavLink>
            <NavLink to="/leaderboard" className={({ isActive }) => cn(styles.navItem, isActive && styles.activeNavItem)}>
              <Trophy className="w-4 h-4" />
              Leaderboard
            </NavLink>
            <NavLink to="/positions" className={({ isActive }) => cn(styles.navItem, isActive && styles.activeNavItem)}>
              <Wallet className="w-4 h-4" />
              My Positions
            </NavLink>
            <NavLink to="/history" className={({ isActive }) => cn(styles.navItem, isActive && styles.activeNavItem)}>
              <History className="w-4 h-4" />
              History
            </NavLink>
          </nav>
        </div>

        {/* Right: Wallet */}
        <div className={styles.right}>
          {address ? (
            <>
              {/* Balance */}
              <div className={styles.balance}>
                <Wallet className={styles.balanceIcon} />
                <span className={styles.balanceText}>{xlmBalance.toFixed(2)} XLM</span>
              </div>

              {/* Address button + dropdown */}
              <div className={styles.addressWrapper}>
                <button
                  ref={addressBtnRef}
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  className={styles.addressButton}
                >
                  <span className={styles.connectedDot} />
                  {short}
                </button>

                {dropdownOpen && (
                  <div ref={dropdownRef} className={styles.dropdown}>
                    <div className={styles.dropdownHeader}>
                      <p className={styles.dropdownLabel}>Connected Wallet</p>
                      <div className={styles.addressRow}>
                        <div className={styles.statusDot}></div>
                        <p className={styles.addressText}>{address}</p>
                      </div>
                    </div>

                    <div className={styles.dropdownActions}>
                      <button onClick={handleCopy} className={styles.actionButton}>
                        {copied ? (
                          <>
                            <CheckCheck size={14} className="text-emerald-400" />
                            <span className="text-emerald-300">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy size={14} />
                            <span>Copy address</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => { disconnect(); setDropdownOpen(false); }}
                        className={cn(styles.actionButton, styles.logoutBtn)}
                      >
                        <LogOut size={14} />
                        <span>Logout</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <div className={styles.balance}>
                <Wallet className={styles.balanceIcon} />
                <span className={styles.balanceText}>0.00 XLM</span>
              </div>
              <div ref={connectRef} className={styles.connectWrapper}>
                <button
                  onClick={() => setModalOpen(true)}
                  disabled={connecting}
                  className={cn(styles.connectButton, 'disabled:opacity-50')}
                >
                  {connecting ? 'Connecting...' : 'Connect Wallet'}
                </button>

                {isModalOpen && !address && (
                  <div className={styles.popover} onClick={(e) => e.stopPropagation()}>
                    <div className={styles.popoverBox} onClick={(e) => e.stopPropagation()}>
                      <WalletModal
                        onSelect={handleSelectWallet}
                        onClose={() => setModalOpen(false)}
                        connecting={connecting}
                      />
                    </div>
                  </div>
                )}
              </div>

            </>
          )}

          <button className={styles.iconButton}>
            <Bell className="w-5 h-5" />
          </button>
        </div>

      </header>

      {/* Centered wallet modal overlay removed; using anchored popover instead */}
    </>
  );
};
