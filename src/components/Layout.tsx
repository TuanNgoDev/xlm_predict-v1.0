import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';

import styles from './Layout.module.css';

export const Layout = () => {
  return (
    <div className={styles.container}>
      <Navbar />
      <div className={styles.body}>
        <Sidebar />
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
      
      {/* Background Decorative Elements */}
      <div className={styles.glowContainer}>
        <div className={styles.glowOne}>
          <div className={styles.glowOneInner}></div>
        </div>
        <div className={styles.glowTwo}>
          <div className={styles.glowTwoInner}></div>
        </div>
      </div>
    </div>
  );
};
