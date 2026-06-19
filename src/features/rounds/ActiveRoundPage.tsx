'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronRight, TrendingUp, TrendingDown,
  Info, Lock, Wallet,
  CheckCircle, XCircle, Clock,
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { TradingViewWidget } from './TradingViewWidget';
import { microUsdToUsd, formatPrice } from '../../services/oracle';
import {
  getRound, getCurrentRound, getParticipantCount, getReward,
  createRound, placeBet, claimReward, RoundData,
} from '../../services/contract';
import { useWallet } from '../../lib/walletContext';
import { useToast } from '../../lib/useToast';
import { api } from '../../services/api';
import styles from './ActiveRoundPage.module.css';

type Phase = 'open' | 'waiting' | 'locked' | 'ended' | 'settled' | 'cancelled';

const POOL_MULTIPLIER = 4.25;

function getPhase(round: RoundData | null, now: number, participantCount: number): Phase {
  if (!round) return 'open';
  const lockTime = Number(round.lock_time);
  const endTime = Number(round.end_time);
  if (round.status === 'Settled') return 'settled';
  if (round.status === 'Cancelled') return 'cancelled';
  if (now >= endTime) return 'ended';
  if (now >= lockTime) {
    // After lock_time: if < 3 participants → waiting (will be cancelled), else locked
    return participantCount < 3 ? 'waiting' : 'locked';
  }
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
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [priceLoading, setPriceLoading] = useState(false);
  const { address: walletAddress, setModalOpen, signTx, refreshBalance } = useWallet();
  const { showToast, ToastUI } = useToast();

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
  const [loadingStep, setLoadingStep] = useState(''); // 2-step progress for create round

  // Create round form
  const [createDuration, setCreateDuration] = useState('60'); // minutes
  const MIN_STAKE = 100;

  // Live feed bets
  const [liveBets, setLiveBets] = useState<import('../../services/api').ApiBet[]>([]);

  // ── Live price via Binance WebSocket ─────────────────────────────────────
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      ws = new WebSocket('wss://stream.binance.com:9443/ws/xlmusdt@miniTicker');

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string) as { c: string };
          const price = parseFloat(data.c);
          if (!isNaN(price) && price > 0) {
            setLivePrice(price);
            setPriceLoading(false);
          }
        } catch { /* ignore parse errors */ }
      };

      ws.onerror = () => {
        setPriceLoading(false);
      };

      ws.onclose = () => {
        // Reconnect after 3s if closed unexpectedly
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onopen = () => {
        setPriceLoading(false);
      };
    };

    setPriceLoading(true);
    connect();

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null; // prevent reconnect on intentional close
        ws.close();
      }
    };
  }, []);

  // ── Clock ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Load wallet — handled by WalletProvider context ──────────────────────

  // ── Load current round ────────────────────────────────────────────────────
  const loadRound = useCallback(async () => {
    try {
      // Try backend DB first (faster, no RPC needed)
      let id = 0;
      try {
        const current = await api.rounds.getCurrent();
        id = current.contractRoundId;
        setRoundId(id);
        // Map API response to RoundData shape
        setRound({
          id: current.contractRoundId,
          creator: current.creatorAddress,
          start_time: BigInt(Math.floor(new Date(current.startTime).getTime() / 1000)),
          lock_time: BigInt(Math.floor(new Date(current.lockTime).getTime() / 1000)),
          end_time: BigInt(Math.floor(new Date(current.endTime).getTime() / 1000)),
          min_stake: BigInt(Math.round(current.minStakeXlm * 10_000_000)),
          total_pool: BigInt(Math.round(current.totalPoolXlm * 10_000_000)),
          status: current.status as 'Open' | 'Settled' | 'Cancelled',
          settle_price: current.settlePrice
            ? BigInt(Math.round(current.settlePrice * 1_000_000))
            : 0n,
        });
        setParticipantCount(current.participantCount);
      } catch {
        // Fallback to contract RPC
        try {
          id = await getCurrentRound();
          setRoundId(id);
          if (id > 0) {
            const r = await getRound(id);
            console.log('📋 Round from contract:', { id, status: r.status, lock_time: Number(r.lock_time), end_time: Number(r.end_time), now: Math.floor(Date.now()/1000) });
            setRound(r);
            const cnt = await getParticipantCount(id);
            setParticipantCount(cnt);
          }
        } catch (rpcError) {
          console.error('loadRound fallback RPC failed:', rpcError);
        }
      }

      if (id > 0 && walletAddress) {
        try {
          console.log('🔍 Checking reward for:', { roundId: id, address: walletAddress });
          const reward = await getReward(id, walletAddress);
          console.log('💰 Reward from contract:', reward.toString(), 'stroops =', Number(reward) / 10_000_000, 'XLM');
          setMyReward(Number(reward) / 10_000_000);
        } catch (rewardError) {
          console.error('loadRound reward RPC failed:', rewardError);
        }
      }

      // Load live bets feed
      if (id > 0) {
        api.bets.getByRound(id).then(setLiveBets).catch(() => {
          // backend offline — keep existing data
        });
      } else {
        setLiveBets([]);
      }
    } catch (e) {
      console.error('loadRound:', e);
    }
  }, [walletAddress]);

  useEffect(() => {
    loadRound();
    const id = setInterval(loadRound, 5_000);
    return () => clearInterval(id);
  }, [loadRound]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const phase = getPhase(round, now, participantCount);
  const timeToLock = round ? Math.max(0, Number(round.lock_time) - now) : 0;
  const timeToEnd = round ? Math.max(0, Number(round.end_time) - now) : 0;
  const countdown = phase === 'open' ? timeToLock : phase === 'locked' ? timeToEnd : 0;
  const countdownLabel = phase === 'open' ? 'Betting closes in' : phase === 'locked' ? 'Round ends in' : phase === 'waiting' ? 'Cancelling...' : 'Round ended';

  const stakeNum = parseFloat(stake) || 0;
  const predNum = parseFloat(prediction) || 0;
  const estimatedPayout = stakeNum > 0 ? stakeNum * POOL_MULTIPLIER : 0;
  const sentiment = !prediction || !livePrice ? null
    : predNum > livePrice ? 'bull' : predNum < livePrice ? 'bear' : 'neutral';

  const totalPoolXlm = round ? Number(round.total_pool) / 10_000_000 : 0;
  const settlePrice = round && round.settle_price > 0 ? microUsdToUsd(round.settle_price) : null;

  // Check if current wallet already placed a bet this round
  const alreadyBet = !!walletAddress && liveBets.some(
    b => b.bettorAddress.toLowerCase() === walletAddress.toLowerCase()
  );

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleConnect = async () => {
    setModalOpen(true);
  };

  const handleCreateRound = async () => {
    if (!walletAddress) { setModalOpen(true); return; }
    if (!prediction || stakeNum <= 0) { showToast('error', 'Enter prediction and stake'); return; }
    if (stakeNum < MIN_STAKE) { showToast('error', `Minimum stake is ${MIN_STAKE} XLM`); return; }
    const durationMins = parseInt(createDuration) || 60;
    if (durationMins < 5) { showToast('error', 'Duration must be at least 5 minutes'); return; }
    if (durationMins > 4320) { showToast('error', 'Duration cannot exceed 3 days'); return; }
    setLoading(true);
    try {
      const durationSecs = durationMins * 60;
      const endTime = Math.floor(Date.now() / 1000) + durationSecs;

      // Step 1: create round (min stake hardcoded to 100 XLM)
      setLoadingStep('Step 1/2: Creating round — sign in wallet…');
      const newId = await createRound(walletAddress, endTime, MIN_STAKE, signTx);
      const newRoundId = parseInt(newId);

      // Record round in backend DB
      const lockTime = Math.floor(Date.now() / 1000) + Math.floor(durationSecs / 2);
      await api.rounds.record({
        contractRoundId: newRoundId,
        creatorAddress: walletAddress,
        startTime: new Date().toISOString(),
        lockTime: new Date(lockTime * 1000).toISOString(),
        endTime: new Date(endTime * 1000).toISOString(),
        minStakeStroops: String(Math.floor(MIN_STAKE * 10_000_000)),
      }).catch((e) => console.warn('rounds.record failed:', e));

      // Step 2: place bet in the same round
      setLoadingStep('Step 2/2: Placing bet — sign in wallet…');
      const txHash = await placeBet(walletAddress, newRoundId, predNum, stakeNum, signTx);

      // Optimistic update live feed immediately
      setLiveBets(prev => [...prev, {
        roundId: newRoundId,
        bettorAddress: walletAddress,
        predictedPriceUsd: predNum,
        stakeAmountXlm: stakeNum,
        rank: null,
        rewardXlm: 0,
        claimed: false,
        txHash,
        createdAt: new Date().toISOString(),
      }]);

      await api.bets.record({
        roundId: newRoundId,
        bettorAddress: walletAddress,
        predictedPriceMicroUsd: String(Math.round(predNum * 1_000_000)),
        stakeAmountStroops: String(Math.floor(stakeNum * 10_000_000)),
        txHash,
      }).catch((e) => console.warn('bets.record failed:', e));

      showToast('success', `Round #${newRoundId} created & bet placed!`);
      setPrediction('');
      setStake('');
      refreshBalance();
      await loadRound();
    } catch (e) {
      showToast('error', String(e));
    } finally {
      setLoading(false);
      setLoadingStep('');
    }
  };

  const handlePlaceBet = async () => {
    if (!walletAddress) { setModalOpen(true); return; }
    if (!prediction || stakeNum <= 0) { showToast('error', 'Enter prediction and stake'); return; }
    if (stakeNum < MIN_STAKE) { showToast('error', `Minimum stake is ${MIN_STAKE} XLM`); return; }
    if (phase !== 'open') { showToast('error', 'Betting is closed'); return; }
    if (!roundId || roundId === 0) { showToast('error', 'No active round found'); return; }
    setLoading(true);
    try {
      const txHash = await placeBet(walletAddress, roundId, predNum, stakeNum, signTx);

      // Optimistic update live feed immediately
      setLiveBets(prev => [...prev, {
        roundId,
        bettorAddress: walletAddress,
        predictedPriceUsd: predNum,
        stakeAmountXlm: stakeNum,
        rank: null,
        rewardXlm: 0,
        claimed: false,
        txHash,
        createdAt: new Date().toISOString(),
      }]);

      // Record in backend DB
      await api.bets.record({
        roundId,
        bettorAddress: walletAddress,
        predictedPriceMicroUsd: String(Math.round(predNum * 1_000_000)),
        stakeAmountStroops: String(Math.floor(stakeNum * 10_000_000)),
        txHash,
      }).catch((e) => console.warn('bets.record failed:', e));
      showToast('success', 'Bet placed successfully!');
      setPrediction('');
      setStake('');
      refreshBalance();
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
      const txHash = await claimReward(walletAddress, roundId, signTx);
      await api.rewards.recordClaim({ address: walletAddress, roundId, txHash }).catch(() => {});
      showToast('success', `Claimed ${myReward.toFixed(2)} XLM!`);
      setMyReward(0);
      refreshBalance();
    } catch (e) {
      showToast('error', String(e));
    } finally {
      setLoading(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className={cn(styles.container, styles.containerMounted)}>
      {ToastUI}

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
          {roundId > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '4px 12px', borderRadius: '9999px',
              fontSize: '10px', fontWeight: 800, letterSpacing: '0.12em',
              border: '1px solid',
              background: phase === 'locked' ? 'rgba(234,179,8,0.1)'
                : phase === 'waiting' ? 'rgba(249,115,22,0.1)'
                : phase === 'settled' ? 'rgba(59,130,246,0.1)'
                : phase === 'cancelled' ? 'rgba(239,68,68,0.1)'
                : phase === 'ended' ? 'rgba(107,114,128,0.1)'
                : 'rgba(16,185,129,0.1)',
              borderColor: phase === 'locked' ? 'rgba(234,179,8,0.3)'
                : phase === 'waiting' ? 'rgba(249,115,22,0.3)'
                : phase === 'settled' ? 'rgba(59,130,246,0.3)'
                : phase === 'cancelled' ? 'rgba(239,68,68,0.3)'
                : phase === 'ended' ? 'rgba(107,114,128,0.3)'
                : 'rgba(52,211,153,0.3)',
              color: phase === 'locked' ? '#fbbf24'
                : phase === 'waiting' ? '#fb923c'
                : phase === 'settled' ? '#60a5fa'
                : phase === 'cancelled' ? '#f87171'
                : phase === 'ended' ? '#9ca3af'
                : '#34d399',
            }}>
              <span style={{
                width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0,
                background: phase === 'locked' ? '#fbbf24'
                  : phase === 'waiting' ? '#fb923c'
                  : phase === 'settled' ? '#60a5fa'
                  : phase === 'cancelled' || phase === 'ended' ? '#9ca3af'
                  : '#34d399',
              }} />
              {phase === 'locked' ? 'LOCKED' : phase === 'waiting' ? 'WAITING' : phase === 'settled' ? 'SETTLED' : phase === 'cancelled' ? 'CANCELLED' : phase === 'ended' ? 'ENDED' : 'LIVE'}
            </div>
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
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                </div>
              </div>
              <div className={styles.statsRow}>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>{countdownLabel}</span>
                  <span className={cn(styles.statValue, styles.timer, countdown < 300 && countdown > 0 && styles.timerUrgent)}>
                    {phase === 'ended' || phase === 'settled' || phase === 'cancelled' || phase === 'waiting'
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
              <TradingViewWidget interval="5" height={340} />
            </div>
          </div>

          {/* Settled result */}
          {phase === 'settled' && settlePrice && (
            <div className={styles.statusPanel} style={{ borderColor: 'rgba(59,130,246,0.2)', background: 'rgba(59,130,246,0.05)' }}>
              <div className={styles.statusPanelRow}>
                <CheckCircle size={15} style={{ color: '#60a5fa', flexShrink: 0 }} />
                <span className={styles.statusPanelTitle} style={{ color: '#93c5fd' }}>Round Settled</span>
              </div>
              <p className={styles.statusPanelText}>
                Final price: <strong style={{ color: '#fff' }}>{formatPrice(settlePrice)}</strong>
              </p>
              {myReward > 0 && (
                <div className={styles.statusPanelWin}>
                  <p className={styles.statusPanelWinText}>🎉 You won {myReward.toFixed(2)} XLM!</p>
                  <button onClick={handleClaim} disabled={loading} className={cn(styles.submitButton, loading && styles.submitDisabled)} style={{ marginTop: '10px' }}>
                    {loading ? 'Claiming...' : 'Claim Reward'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Cancelled */}
          {phase === 'cancelled' && (
            <div className={styles.statusPanel} style={{ borderColor: 'rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.05)' }}>
              <div className={styles.statusPanelRow}>
                <XCircle size={15} style={{ color: '#f87171', flexShrink: 0 }} />
                <span className={styles.statusPanelTitle} style={{ color: '#fca5a5' }}>Round Cancelled</span>
                <span className={styles.statusPanelNote}>— Less than 3 participants. Stakes refunded.</span>
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

          {/* Live Feed — left column, always visible */}
          <div className={cn('glass-card', styles.liveFeedCard)}>
            <div className={styles.liveFeedHeader}>
              <span className={styles.liveFeedPing}>
                <span className={styles.pingInner} />
                <span className={styles.pingDot} />
              </span>
              <h4 className={styles.liveFeedTitle}>Live Feed</h4>
              <span className={styles.liveFeedCount}>{liveBets.length} bet{liveBets.length !== 1 ? 's' : ''}</span>
            </div>
            {liveBets.length === 0 ? (
              <div className={styles.liveFeedEmpty}>
                <span className={styles.liveFeedEmptyIcon}>🎯</span>
                <p className={styles.liveFeedEmptyText}>No bets yet this round</p>
                <p className={styles.liveFeedEmptySubtext}>Be the first to predict!</p>
              </div>
            ) : (
              <div className={styles.liveFeedTableWrap}>
                <table className={styles.liveFeedTable}>
                  <thead>
                    <tr className={styles.liveFeedThead}>
                      <th className={styles.liveFeedTh}>#</th>
                      <th className={styles.liveFeedTh}>Wallet</th>
                      <th className={cn(styles.liveFeedTh, styles.liveFeedThRight)}>Predicted</th>
                      <th className={cn(styles.liveFeedTh, styles.liveFeedThRight)}>Stake</th>
                      <th className={cn(styles.liveFeedTh, styles.liveFeedThRight)}>Time (UTC+7)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {liveBets.map((bet, i) => {
                      const d = new Date(bet.createdAt);
                      const utc7 = new Date(d.getTime() + 7 * 60 * 60 * 1000);
                      const pad = (n: number) => String(n).padStart(2, '0');
                      const timeStr = `${pad(utc7.getUTCHours())}:${pad(utc7.getUTCMinutes())}:${pad(utc7.getUTCSeconds())}`;
                      return (
                        <tr key={i} className={styles.liveFeedRow}>
                          <td className={styles.liveFeedTdIdx}>{i + 1}</td>
                          <td className={styles.liveFeedTdWallet}>
                            {bet.bettorAddress.slice(0, 6)}...{bet.bettorAddress.slice(-4)}
                          </td>
                          <td className={styles.liveFeedTdPrice}>${bet.predictedPriceUsd.toFixed(4)}</td>
                          <td className={styles.liveFeedTdStake}>{bet.stakeAmountXlm.toFixed(0)} XLM</td>
                          <td className={styles.liveFeedTdTime}>{timeStr}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>


        {/* ── RIGHT: Prediction Panel ── */}
        <div className={styles.predictionBox}>

          {/* CASE 1: No active round → first person creates + bets */}
          {!roundId ? (
            <div className={cn('glass-card', styles.predictCard)}>
              <div className={styles.predictHeader}>
                <h3 className={styles.predictTitle}>Start a New Round</h3>
                <p className={styles.predictSub}>No active round. Be the first — set the end time and place your prediction.</p>
                {livePrice && (
                  <div className={styles.currentPriceHint}>
                    Binance: <strong>{formatPrice(livePrice)}</strong>
                  </div>
                )}
              </div>

              <div className={styles.predictForm}>
                {/* End time */}
                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>Round Duration (minutes, min 5)</label>
                  <div className={styles.inputWrapper}>
                    <input
                      type="number" min="5" max="4320" value={createDuration}
                      onChange={e => setCreateDuration(e.target.value)}
                      className={styles.input}
                      placeholder="60"
                    />
                    <span className={styles.inputSuffix}>min</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    Betting open for first {Math.floor(parseInt(createDuration || '60') / 2)} min · max 3 days
                  </p>
                </div>

                {/* Price prediction */}
                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>Your Price Prediction (USD)</label>
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

                {/* Stake */}
                <div className={styles.inputGroup}>
                  <label className={styles.inputLabel}>Your Stake (XLM) <span className="text-yellow-400 text-xs">(MIN 100 XLM)</span></label>
                  <div className={styles.inputWrapper}>
                    <input
                      className={styles.input}
                      placeholder="100" type="number" min="100" step="1"
                      value={stake}
                      onChange={e => {
                        setStake(e.target.value);
                        const v = parseFloat(e.target.value);
                        if (v > 0 && v < MIN_STAKE) showToast('error', `Minimum stake is ${MIN_STAKE} XLM`);
                      }}
                    />
                    <span className={styles.inputSuffix}>XLM</span>
                  </div>
                </div>

                <button
                  onClick={handleCreateRound}
                  disabled={loading || !walletAddress || !prediction || stakeNum < MIN_STAKE}
                  className={cn(styles.submitButton, (loading || !walletAddress || !prediction || stakeNum < MIN_STAKE) && styles.submitDisabled)}
                >
                  {loading ? (loadingStep || 'Creating...') : !walletAddress ? 'Connect Wallet' : 'Create Round & Predict'}
                </button>

                <div className={styles.securityNote}>
                  <Lock className="w-3 h-3" />
                  Secured by Stellar Smart Contracts · Oracle: Binance
                </div>
              </div>
            </div>

          ) : phase === 'open' ? (
            /* CASE 2: Active round, betting open → place bet */
            <div className={cn('glass-card', styles.predictCard)}>
              <div className={styles.predictHeader}>
                <h3 className={styles.predictTitle}>Predict XLM Price</h3>
                <p className={styles.predictSub}>
                  Betting closes in <span className={styles.timerInline}>{formatCountdown(timeToLock)}</span>
                </p>
                {livePrice && (
                  <div className={styles.currentPriceHint}>
                    Binance: <strong>{formatPrice(livePrice)}</strong>
                  </div>
                )}
              </div>

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
                  <label className={styles.inputLabel}>Stake Amount (XLM) <span className="text-yellow-400 text-xs">(MIN 100 XLM)</span></label>
                  <div className={styles.inputWrapper}>
                    <input
                      className={styles.input}
                      placeholder="100" type="number" min="100" step="1"
                      value={stake}
                      onChange={e => {
                        setStake(e.target.value);
                        const v = parseFloat(e.target.value);
                        if (v > 0 && v < MIN_STAKE) showToast('error', `Minimum stake is ${MIN_STAKE} XLM`);
                      }}
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
                  disabled={loading || !walletAddress || !prediction || stakeNum < MIN_STAKE || alreadyBet}
                  className={cn(styles.submitButton, (loading || !walletAddress || !prediction || stakeNum < MIN_STAKE || alreadyBet) && styles.submitDisabled)}
                >
                  {loading ? 'Submitting...' : !walletAddress ? 'Connect Wallet' : alreadyBet ? '✅ Already Predicted' : 'Submit Prediction'}
                </button>

                <div className={styles.securityNote}>
                  <Lock className="w-3 h-3" />
                  Secured by Stellar Smart Contracts · Oracle: Binance
                </div>
              </div>
            </div>

          ) : (
            /* CASE 3: Round locked / ended / settled / cancelled */
            <div className={cn('glass-card', styles.predictCard)}>
              <div className={styles.phasePanel}>
                {phase === 'locked' && (
                  <>
                    <p className={styles.phasePanelTitle} style={{ color: '#fbbf24' }}>🔒 Betting Locked</p>
                    <p className={styles.phasePanelText}>Round ends in <span style={{ color: '#fff', fontFamily: 'var(--font-mono)' }}>{formatCountdown(timeToEnd)}</span></p>
                  </>
                )}
                {phase === 'waiting' && (
                  <>
                    <p className={styles.phasePanelTitle} style={{ color: '#fb923c' }}>⏳ Waiting for Participants</p>
                    <p className={styles.phasePanelText}>Only {participantCount}/3 joined. Round is being cancelled — stakes will be refunded to your wallet automatically.</p>
                  </>
                )}
                {phase === 'ended' && <p className={styles.phasePanelText}>⏳ Round ended. Awaiting oracle settlement...</p>}
                {phase === 'settled' && settlePrice && (
                  <>
                    <p className={styles.phasePanelTitle} style={{ color: '#60a5fa' }}>✅ Round Settled</p>
                    <p className={styles.phasePanelText}>Final price: <strong style={{ color: '#fff' }}>{formatPrice(settlePrice)}</strong></p>
                    {myReward > 0 && (
                      <div className={styles.statusPanelWin}>
                        <p className={styles.statusPanelWinText}>🎉 You won {myReward.toFixed(2)} XLM!</p>
                        <button onClick={handleClaim} disabled={loading}
                          className={cn(styles.submitButton, loading && styles.submitDisabled)} style={{ marginTop: '10px' }}>
                          {loading ? 'Claiming...' : 'Claim Reward'}
                        </button>
                      </div>
                    )}
                  </>
                )}
                {phase === 'cancelled' && (
                  <>
                    <p className={styles.phasePanelTitle} style={{ color: '#f87171' }}>❌ Round Cancelled</p>
                    <p className={styles.phasePanelText}>Less than 3 participants. Stakes refunded.</p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* How it works */}
          <div className={cn('glass-card', styles.infoCard)}>
            <div className={styles.infoTitleArea}>
              <Info style={{ width: '18px', height: '18px' }} className={styles.infoIcon} strokeWidth={3} />
              <h4 className={styles.infoTitle}>How it works</h4>
            </div>
            <ul className={styles.infoList}>
              {[
                'First person sets the round duration (min 5 min, max 3 days).',
                'Each wallet can only place ONE bet per round.',
                'Bet in the first 50% of the round. Locked after that.',
                'Need at least 3 participants — otherwise cancelled & refunded.',
                'Oracle fetches Binance price at end_time.',
                '1st place: stake back + 65% of losers pool. 2nd place: stake back + 35%. Others lose stake.',
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
