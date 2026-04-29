import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  connectFreighter, connectRabet, getFreighterAddress,
  signWithFreighter, signWithRabet,
  type WalletType,
} from '../services/wallet';

interface WalletContextType {
  address: string | null;
  walletType: WalletType | null;
  connecting: boolean;
  connect: (type: WalletType) => Promise<void>;
  disconnect: () => void;
  xlmBalance: number;
  refreshBalance: () => void;
  isModalOpen: boolean;
  setModalOpen: (open: boolean) => void;
  signTx: (xdr: string) => Promise<string>;
}

const WalletContext = createContext<WalletContextType>({
  address: null,
  walletType: null,
  connecting: false,
  connect: async () => {},
  disconnect: () => {},
  xlmBalance: 0,
  refreshBalance: () => {},
  isModalOpen: false,
  setModalOpen: () => {},
  signTx: async () => { throw new Error('Wallet not connected'); },
});

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string | null>(null);
  const [walletType, setWalletType] = useState<WalletType | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [xlmBalance, setXlmBalance] = useState(0);
  const [isModalOpen, setModalOpen] = useState(false);

  // Restore session on mount
  useEffect(() => {
    const savedType = localStorage.getItem('walletType') as WalletType | null;
    if (!savedType) return;

    if (savedType === 'freighter') {
      getFreighterAddress().then(addr => {
        if (addr) { setAddress(addr); setWalletType('freighter'); }
      });
    } else if (savedType === 'rabet' && window.rabet) {
      // Rabet: try to reconnect silently
      window.rabet.connect().then(r => {
        if (r.publicKey) { setAddress(r.publicKey); setWalletType('rabet'); }
      }).catch(() => {});
    }
  }, []);

  // Fetch XLM balance when address changes, then poll every 30s for updates
  useEffect(() => {
    if (!address) { setXlmBalance(0); return; }

    const fetchBalance = () => {
      fetch(`https://horizon-testnet.stellar.org/accounts/${address}`)
        .then(r => r.json())
        .then((data: { balances?: Array<{ asset_type: string; balance: string }> }) => {
          const native = data.balances?.find(b => b.asset_type === 'native');
          setXlmBalance(parseFloat(native?.balance || '0'));
        })
        .catch(() => {});
    };

    fetchBalance();
    const interval = setInterval(fetchBalance, 30_000);
    return () => clearInterval(interval);
  }, [address]);

  const refreshBalance = useCallback(() => {
    if (!address) return;
    fetch(`https://horizon-testnet.stellar.org/accounts/${address}`)
      .then(r => r.json())
      .then((data: { balances?: Array<{ asset_type: string; balance: string }> }) => {
        const native = data.balances?.find(b => b.asset_type === 'native');
        setXlmBalance(parseFloat(native?.balance || '0'));
      })
      .catch(() => {});
  }, [address]);

  const connect = useCallback(async (type: WalletType) => {
    setConnecting(true);
    try {
      let addr: string;
      if (type === 'rabet') {
        addr = await connectRabet();
      } else {
        addr = await connectFreighter();
      }
      setAddress(addr);
      setWalletType(type);
      localStorage.setItem('walletType', type);
      setModalOpen(false); // Close modal on success
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    if (walletType === 'rabet' && window.rabet) {
      window.rabet.disconnect();
    }
    setAddress(null);
    setWalletType(null);
    setXlmBalance(0);
    localStorage.removeItem('walletType');
  }, [walletType]);

  const signTx = useCallback(async (xdr: string): Promise<string> => {
    if (!walletType) throw new Error('Wallet not connected');
    if (walletType === 'rabet') return signWithRabet(xdr);
    return signWithFreighter(xdr, address ?? undefined);
  }, [walletType, address]);

  return (
    <WalletContext.Provider value={{ 
      address, walletType, connecting, connect, disconnect, xlmBalance, refreshBalance,
      isModalOpen, setModalOpen, signTx,
    }}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  return useContext(WalletContext);
}
