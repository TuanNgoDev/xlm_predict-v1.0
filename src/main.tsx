import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './pages';
import { WalletProvider } from './lib/walletContext';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <WalletProvider>
      <App />
    </WalletProvider>
  </StrictMode>,
);
