import React from 'react';
import { NavLink } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Trophy, 
  Wallet, 
  History, 
  Rocket, 
  ChevronRight 
} from 'lucide-react';
import { cn } from '../lib/utils';

import styles from './Sidebar.module.css';

interface NavItemProps {
  to: string;
  icon: React.ElementType;
  label: string;
}

const NavItem = ({ to, icon: Icon, label }: NavItemProps) => {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => cn(
        styles.navItem,
        isActive && styles.activeNavItem
      )}
    >
      <Icon className="w-5 h-5" />
      <span className={styles.navLabel}>{label}</span>
    </NavLink>
  );
};

export const Sidebar = () => {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.content}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>
            <Rocket className="text-white w-5 h-5 fill-current" />
          </div>
          <div>
            <p className={styles.logoText}>Cosmic Finance</p>
            <p className={styles.logoSub}>Predict & Earn</p>
          </div>
        </div>

        <nav className={styles.nav}>
          <NavItem to="/" icon={LayoutDashboard} label="Home" />
          <NavItem to="/leaderboard" icon={Trophy} label="Leaderboard" />
          <NavItem to="/positions" icon={Wallet} label="My Positions" />
          <NavItem to="/history" icon={History} label="History" />
        </nav>

        <div className={styles.footer}>
          <button className={styles.actionButton}>
            View Active Rounds
          </button>
        </div>
      </div>
    </aside>
  );
};
