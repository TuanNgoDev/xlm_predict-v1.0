import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ActiveRoundPage } from './features/rounds/ActiveRoundPage';
import { LeaderboardPage } from './features/leaderboard/LeaderboardPage';
import { HistoryPage } from './features/history/HistoryPage';
import { PositionsPage } from './features/positions/PositionsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<ActiveRoundPage />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/positions" element={<PositionsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
