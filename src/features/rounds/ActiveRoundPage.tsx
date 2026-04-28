'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronRight, TrendingUp, TrendingDown, ArrowUpRight,
  Info, Lock, ExternalLink, Users, Target, Zap, RefreshCw,
  Plus, Wallet, CheckCircle, XCircle, Clock,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { TradingViewWidget } from './TradingViewWidget';
import { microUsdToUsd, formatPrice } from '../../services/oracle';
import {
  getRound, getCurrentRound, getParticipantCount, getReward,
  createRound, placeBet, claimReward, RoundData,
} from '../../services/contract';
import { useWallet } from '../../lib/walletContext';
import { api } from '../../services/api';
import styles from './ActiveRoundPage.module.css';

type Interval = '1H' | '4H' | '1D';
type Phase = 'open' | 'locked' | 'ended' | 'settled' | 'cancelled';

const POOL_MULTIPLIER = 4.25;

function getPhase(round: RoundData | null, now: number): Phase {
  if (!round) return 'open';
  const lockTime = Number(round.lock_time);
  const endTime = Number(round.end_time);
  if (round.status === 'Settled') return 'settled';
  if (round.status === 'Cancelled') return 'cancelled';
  if (now >= endTime) return 'ended';
  if (now >= lockTime) return 'locked';
  return 'open';
}

function formatCountdown(secs: number): string {
  if (secs <= 0) return '00:00:00';
  const h = Math.floor(secs / 3600).toString().padStart(2, '0');
  const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

export const ActiveRoundPage = () => {
  const [activeTab, setActiveTab] = useState<Interval>('1H');
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const { address: walletAddress, connect: connectWalletCtx } = useWallet();

  // Round state
  const [roundId, setRoundId] = useState<number>(0);
  const [round, setRound] = useState<RoundData | null>(null);
  const [participantCount, setParticipantCount] = useState(0);
  const [myReward, setMyReward] = useState<number>(0);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  // Form state
  const [prediction, setPrediction] = useState('');
  const [stake, setStake] = useState('');
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  // Create round form
  const [showCreate, setShowCreate] = useState(false);
  const [createDuration, setCreateDuration] = useState('60'); // minutes
  const [createMinStake, setCreateMinStake] = useState('1');

  const showToast = (type: 'success' | 'error', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Fetch live price from Binance ─────────────────────────────────────────
  const fetchPrice = useCallback(async () => {
    setPriceLoading(true);
    try {
      const p = await api.price.getCurrent();
      setLivePrice(p.priceUsd);
    } catch { /* keep previous */ }
    finally { setPriceLoading(false); }
  }, []);

  useEffect(() => {
    fetchPrice();
    const id = setInterval(fetchPrice, 30_000);
    return () => clearInterval(id);
  }, [fetchPrice]);

  // ── Clock ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Load wallet — handled by WalletProvider context ──────────────────────

  // ── Load current round ────────────────────────────────────────────────────
  const loadRound = useCallback(async () => {
    try {
      const id = await getCurrentRound();
      setRoundId(id);
      if (id > 0) {
        const r = await getRound(id);
        setRound(r);
        const cnt = await getParticipantCount(id);
        setParticipantCount(cnt);
        if (walletAddress) {
          const reward = await getReward(id, walletAddress);
          setMyReward(Number(reward) / 10_000_000);
        }
      }
    } catch (e) {
      console.error('loadRound:', e);
    }
  }, [walletAddress]);

  useEffect(() => {
    loadRound();
    const id = setInterval(loadRound, 15_000);
    return () => clearInterval(id);
  }, [loadRound]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const phase = getPhase(round, now);
  const timeToLock = round ? Math.max(0, Number(round.lock_time) - now) : 0;
  const timeToEnd = round ? Math.max(0, Number(round.end_time) - now) : 0;
  const countdown = phase === 'open' ? timeToLock : timeToEnd;
  const countdownLabel = phase === 'open' ? 'Betting closes in' : phase === 'locked' ? 'Round ends in' : 'Round ended';

  const stakeNum = parseFloat(stake) || 0;
  const predNum = parseFloat(prediction) || 0;
  const estimatedPayout = stakeNum > 0 ? stakeNum * POOL_MULTIPLIER : 0;
  const sentiment = !prediction || !livePrice ? null
    : predNum > livePrice ? 'bull' : predNum < livePrice ? 'bear' : 'neutral';

  const totalPoolXlm = round ? Number(round.total_pool) / 10_000_000 : 0;
  const settlePrice = round && round.settle_price > 0 ? microUsdToUsd(round.settle_price) : null;

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleConnect = async () => {
    try {
      await connectWalletCtx();
    } catch (e) {
      showToast('error', String(e));
    }
  };

  const handleCreateRound = async () => {
    if (!walletAddress) { showToast('error', 'Connect wallet first'); return; }
    setLoading(true);
    try {
      const durationSecs = parseInt(createDuration) * 60;
      const endTime = Math.floor(Date.now() / 1000) + durationSecs;
      const minStakeXlm = parseFloat(createMinStake) || 1;
      const { signTransaction } = await import('@stellar/freighter-api');
      const newId = await createRound(walletAddress, endTime, minStakeXlm, signTransaction);
      // Record in backend DB
      const lockTime = Math.floor(Date.now() / 1000) + Math.floor(durationSecs / 2);
      await api.rounds.record({
        contractRoundId: parseInt(newId),
        creatorAddress: walletAddress,
        startTime: new Date().toISOString(),
        lockTime: new Date(lockTime * 1000).toISOString(),
        endTime: new Date(endTime * 1000).toISOString(),
        minStakeStroops: String(Math.floor(minStakeXlm * 10_000_000)),
      }).catch(() => {/* non-critical */});
      showToast('success', `Round #${newId} created!`);
      setShowCreate(false);
      await loadRound();
    } catch (e) {
      showToast('error', String(e));
    } finally {
      setLoading(false);
    }
  };

  const handlePlaceBet = async () => {
    if (!walletAddress) { showToast('error', 'Connect wallet first'); return; }
    if (!prediction || stakeNum <= 0) { showToast('error', 'Enter prediction and stake'); return; }
    if (phase !== 'open') { showToast('error', 'Betting is closed'); return; }
    setLoading(true);
    try {
      const { signTransaction } = await import('@stellar/freighter-api');
      const txHash = await placeBet(walletAddress, roundId, predNum, stakeNum, signTransaction);
      // Record in backend DB
      await api.bets.record({
        roundId,
        bettorAddress: walletAddress,
        predictedPriceMicroUsd: String(Math.round(predNum * 1_000_000)),
        stakeAmountStroops: String(Math.floor(stakeNum * 10_000_000)),
        txHash,
      }).catch(() => {/* non-critical */});
      showToast('success', 'Bet placed successfully!');
      setPrediction('');
      setStake('');
      await loadRound();
    } catch (e) {
      showToast('error', String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleClaim = async () => {
    if (!walletAddress) { showToast('error', 'Connect wallet first'); return; }
    setLoading(true);
    try {
      const { signTransaction } = await import('@stellar/freighter-api');
      const txHash = await claimReward(walletAddress, roundId, signTransaction);
      await api.rewards.recordClaim({ address: walletAddress, roundId, txHash }).catch(() => {});
      showToast('success', `Claimed ${myReward.toFixed(2)} XLM!`);
      setMyReward(0);
    } catch (e) {
      showToast('error', String(e));
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={cn(styles.container, styles.containerMounted)}>
      {/* Toast */}
      {toast && (
        <div className={cn(
          'fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-bold shadow-xl',
          toast.type === 'success' ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300' : 'bg-red-500/20 border border-red-500/40 text-red-300'
        )}>
          {toast.type === 'success' ? <CheckCircle size={16} /> : <XCircle size={16} />}
          {toast.msg}
        </div>
      )}

      {/* Breadcrumb */}
      <div className={styles.breadcrumb}>
        <div className={styles.breadcrumbLeft}>
          <span>Home</span>
          <ChevronRight className="w-3 h-3" />
          <span className={styles.activePath}>
            {roundId > 0 ? `Round #${roundId}` : 'No Active Round'}
          </span>
        </div>
        <div className={styles.breadcrumbRight}>
          {/* Phase badge */}
          <div className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border',
            phase === 'open' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
            phase === 'locked' ? 'bg-yellow-500/10 border-yellow-500/30 text-yellow-400' :
            phase === 'settled' ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' :
            phase === 'cancelled' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
            'bg-gray-500/10 border-gray-500/30 text-gray-400'
          )}>
            <span className={cn(
              'w-1.5 h-1.5 rounded-full',
              phase === 'open' ? 'bg-emerald-400 animate-pulse' :
              phase === 'locked' ? 'bg-yellow-400' :
              phase === 'settled' ? 'bg-blue-400' : 'bg-gray-400'
            )} />
            {phase === 'open' ? 'OPEN' : phase === 'locked' ? 'LOCKED' : phase === 'settled' ? 'SETTLED' : phase === 'cancelled' ? 'CANCELLED' : 'ENDED'}
          </div>

          {/* Wallet */}
          {walletAddress ? (
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 border border-white/10 text-xs text-gray-300">
              <Wallet size={12} />
              {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
            </div>
          ) : (
            <button onClick={handleConnect} className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-400 hover:bg-emerald-500/20 transition-colors">
              <Wallet size={12} /> Connect
            </button>
          )}
        </div>
      </div>

      <div className={styles.mainGrid}>
        {/* ── LEFT: Chart ── */}
        <div className={styles.chartColumn}>
          <div className={cn('glass-card', styles.chartCard)}>
            <div className={styles.chartHeader}>
              <div className={styles.chartTitleArea}>
                <h2 className={styles.pairLabel}>XLM / USDT · Binance Live</h2>
                <div className={styles.livePriceBadge}>
                  <div className={styles.priceArea}>
                    <span className={styles.price}>
                      {livePrice ? formatPrice(livePrice) : '--'}
                    </span>
                  </div>
                  <button
                    className={cn(styles.refreshBtn, priceLoading && styles.refreshBtnSpin)}
                    onClick={fetchPrice}
                  >
                    <RefreshCw size={13} />
                  </button>
                </div>
              </div>
              <div className={styles.statsRow}>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>{countdownLabel}</span>
                  <span className={cn(styles.statValue, styles.timer, countdown < 300 && styles.timerUrgent)}>
                    {phase === 'ended' || phase === 'settled' || phase === 'cancelled'
                      ? '—'
                      : formatCountdown(countdown)}
                  </span>
                </div>
                <div className={styles.divider} />
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Pool Size</span>
                  <span className={cn(styles.statValue, styles.pool)}>
                    {totalPoolXlm.toLocaleString(undefined, { maximumFractionDigits: 0 })} XLM
                  </span>
                </div>
                <div className={styles.divider} />
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Participants</span>
                  <span className={styles.statValue}>{participantCount}</span>
                </div>
              </div>
            </div>

            <div className={styles.chartArea}>
              <div className={styles.chartControls}>
                {(['1H', '4H', '1D'] as Interval[]).map(tab => (
                  <button key={tab} onClick={() => setActiveTab(tab)}
                    className={cn(styles.chartTab, activeTab === tab && styles.activeTab)}>
                    {tab}
                  </button>
                ))}
              </div>
              <TradingViewWidget interval={activeTab} height={340} />
            </div>
          </div>

          {/* Settled result */}
          {phase === 'settled' && settlePrice && (
            <div className="glass-card p-4 border border-blue-500/20 bg-blue-500/5">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={16} className="text-blue-400" />
                <span className="text-sm font-bold text-blue-300">Round Settled</span>
              </div>
              <p className="text-sm text-gray-400">
                Final price: <span className="text-white font-bold">{formatPrice(settlePrice)}</span>
              </p>
              {myReward > 0 && (
                <div className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                  <p className="text-sm text-emerald-300 font-bold">
                    🎉 You won {myReward.toFixed(2)} XLM!
                  </p>
                  <button onClick={handleClaim} disabled={loading}
                    className="mt-2 w-full py-2 rounded-lg bg-emerald-500 text-black text-sm font-bold hover:bg-emerald-400 disabled:opacity-50 transition-colors">
                    {loading ? 'Claiming...' : 'Claim Reward'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Cancelled */}
          {phase === 'cancelled' && (
            <div className="glass-card p-4 border border-red-500/20 bg-red-500/5">
              <div className="flex items-center gap-2">
                <XCircle size={16} className="text-red-400" />
                <span className="text-sm font-bold text-red-300">Round Cancelled</span>
                <span className="text-xs text-gray-500">— Less than 2 participants. Stakes refunded.</span>
              </div>
            </div>
          )}

          {/* Participants info */}
          <div className={cn('glass-card', styles.activityCard)}>
            <div className={styles.participantsArea}>
              <div className={styles.avatarGroup}>
                <span className={styles.avatarLabel}>Participants</span>
                <span className={styles.statValue}>{participantCount} / 100</span>
              </div>
              <div className={styles.divider} />
              <div className={styles.avatarGroup}>
                <span className={styles.avatarLabel}>Phase</span>
                <span className={styles.statValue} style={{ textTransform: 'capitalize' }}>{phase}</span>
              </div>
              <div className={styles.divider} />
              <div className={styles.avatarGroup}>
                <span className={styles.avatarLabel}>Min Stake</span>
                <span className={styles.statValue}>
                  {round ? (Number(round.min_stake) / 10_000_000).toFixed(1) : '—'} XLM
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── RIGHT: Prediction + Create ── */}
        <div className={styles.predictionBox}>

          {/* Create Round */}
          <div className="glass-card p-4 mb-4">
            <button
              onClick={() => setShowCreate(!showCreate)}
              className="w-full flex items-center justify-between text-sm font-bold text-gray-300 hover:text-white transition-colors"
            >
              <span className="flex items-center gap-2"><Plus size={14} /> Create New Round</span>
              <ChevronRight size={14} className={cn('transition-transform', showCreate && 'rotate-90')} />
            </button>

            {showCreate && (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1 uppercase">Duration (minutes, min 10)</label>
                  <input
                    type="number" min="10" value={createDuration}
                    onChange={e => setCreateDuration(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1 uppercase">Min Stake (XLM)</label>
                  <input
                    type="number" min="0.1" step="0.1" value={createMinStake}
                    onChange={e => setCreateMinStake(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-emerald-500/50"
                  />
                </div>
                <div className="text-xs text-gray-500 bg-white/5 rounded-lg p-2">
                  <p>• Betting open for first {Math.floor(parseInt(createDuration || '60') / 2)} min</p>
                  <p>• Locked for last {Math.ceil(parseInt(createDuration || '60') / 2)} min</p>
                  <p>• Auto-cancel if &lt; 2 participants</p>
                </div>
                <button
                  onClick={handleCreateRound} disabled={loading || !walletAddress}
                  className="w-full py-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-sm font-bold hover:bg-emerald-500/30 disabled:opacity-40 transition-colors"
                >
                  {loading ? 'Creating...' : 'Create Round'}
                </button>
              </div>
            )}
          </div>

          {/* Predict Card */}
          <div className={cn('glass-card', styles.predictCard)}>
            <div className={styles.predictHeader}>
              <h3 className={styles.predictTitle}>Predict XLM Price</h3>
              {phase === 'open' && (
                <p className={styles.predictSub}>
                  Betting closes in <span className={styles.timerInline}>{formatCountdown(timeToLock)}</span>
                </p>
              )}
              {phase === 'locked' && (
                <p className={cn(styles.predictSub, 'text-yellow-400')}>
                  <Lock size={12} className="inline mr-1" />
                  Betting locked — round ends in {formatCountdown(timeToEnd)}
                </p>
              )}
              {phase === 'ended' && (
                <p className={cn(styles.predictSub, 'text-gray-500')}>
                  <Clock size={12} className="inline mr-1" />
                  Awaiting settlement...
                </p>
              )}
              {livePrice && (
                <div className={styles.currentPriceHint}>
                  Binance: <strong>{formatPrice(livePrice)}</strong>
                </div>
              )}
            </div>

            {phase === 'open' ? (
              <div className={styles.predictForm}>
                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>Price Prediction (USD)</label>
                  <div className={styles.inputWrapper}>
                    <input
                      className={styles.input}
                      placeholder={livePrice ? livePrice.toFixed(4) : '0.1350'}
                      type="number" step="0.0001" min="0"
                      value={prediction}
                      onChange={e => setPrediction(e.target.value)}
                    />
                    <span className={styles.inputSuffix}>USD</span>
                  </div>
                  {sentiment === 'bull' && <div className={styles.hintBull}><TrendingUp size={11} /> Bullish</div>}
                  {sentiment === 'bear' && <div className={styles.hintBear}><TrendingDown size={11} /> Bearish</div>}
                </div>

                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>Stake Amount (XLM)</label>
                  <div className={styles.inputWrapper}>
                    <input
                      className={styles.input}
                      placeholder="10.00" type="number" min="0" step="0.5"
                      value={stake}
                      onChange={e => setStake(e.target.value)}
                    />
                    <span className={styles.inputSuffix}>XLM</span>
                  </div>
                </div>

                <div className={styles.summary}>
                  <div className={styles.summaryRow}>
                    <span className={styles.summaryLabel}>Est. Payout</span>
                    <span className={cn(styles.summaryValue, styles.payout)}>
                      {estimatedPayout > 0 ? `~${estimatedPayout.toFixed(2)} XLM` : '–'}
                    </span>
                  </div>
                  <div className={styles.summaryDivider} />
                  <div className={styles.summaryRow}>
                    <span className={styles.summaryLabel}>Participants</span>
                    <span className={styles.summaryValue}>{participantCount} joined</span>
                  </div>
                </div>

                <button
                  onClick={handlePlaceBet}
                  disabled={loading || !walletAddress || !prediction || stakeNum <= 0}
                  className={cn(styles.submitButton, (loading || !walletAddress || !prediction || stakeNum <= 0) && styles.submitDisabled)}
                >
                  {loading ? 'Submitting...' : !walletAddress ? 'Connect Wallet' : 'Submit Prediction'}
                </button>

                <div className={styles.securityNote}>
                  <Lock className="w-3 h-3" />
                  Secured by Stellar Smart Contracts · Oracle: Binance
                </div>
              </div>
            ) : (
              <div className="p-4 text-center text-gray-500 text-sm">
                {phase === 'locked' && '🔒 Betting is closed. Waiting for round to end.'}
                {phase === 'ended' && '⏳ Round ended. Awaiting oracle settlement.'}
                {phase === 'settled' && settlePrice && `✅ Settled at ${formatPrice(settlePrice)}`}
                {phase === 'cancelled' && '❌ Round cancelled — not enough participants.'}
              </div>
            )}
          </div>

          {/* How it works */}
          <div className={cn('glass-card', styles.infoCard)}>
            <div className={styles.infoTitleArea}>
              <Info className={cn('w-5 h-5', styles.infoIcon)} strokeWidth={3} />
              <h4 className={styles.infoTitle}>How it works</h4>
            </div>
            <ul className={styles.infoList}>
              {[
                'Anyone can create a round (min 10 min duration).',
                'Bet in the first 50% of the round. Locked after that.',
                'If < 2 participants at end → cancelled & refunded.',
                'Oracle fetches Binance price at end_time.',
                'Top 3 closest predictions share 60% / 25% / 15% of pool.',
              ].map((text, i) => (
                <li key={i} className={styles.infoItem}>
                  <span className={styles.infoStep}>0{i + 1}.</span>
                  <p>{text}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
