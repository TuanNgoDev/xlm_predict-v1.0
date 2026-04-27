import React from 'react';
import { NavLink } from 'react-router-dom';
import { Wallet, Bell, Search, Menu } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';

import styles from './Navbar.module.css';

export const Navbar = () => {
  return (
    <header className={styles.header}>
      <div className={styles.left}>
        <span className={styles.logo}>
          Stellar Predict
        </span>
        <nav className={styles.nav}>
          <NavLink to="/" className={({ isActive }) => cn(
            styles.navItem,
            isActive && styles.activeNavItem
          )}>
            Market
          </NavLink>
          <NavLink to="/leaderboard" className={({ isActive }) => cn(
            styles.navItem,
            isActive && styles.activeNavItem
          )}>
            Analytics
          </NavLink>
          <a href="#" className={styles.navItem}>
            Docs
          </a>
        </nav>
      </div>

      <div className={styles.right}>
        <div className={styles.balance}>
          <Wallet className={styles.balanceIcon} />
          <span className={styles.balanceText}>0.00 XLM</span>
        </div>
        
        <button className={styles.connectButton}>
          Connect Wallet
        </button>

        <button className={styles.iconButton}>
          <Bell className="w-5 h-5" />
        </button>
        
        <button className={cn(styles.iconButton, styles.menuButton)}>
          <Menu className="w-6 h-6" />
        </button>
      </div>
    </header>
  );
};
