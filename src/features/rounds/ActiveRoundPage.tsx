import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronRight,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  Info,
  Lock,
  ExternalLink,
  Users,
  Target,
  Zap,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { activeRound } from '../../services/mockData';
import { cn, formatCurrency } from '../../lib/utils';

import styles from './ActiveRoundPage.module.css';

// --- Chart Data ---
const chartData = [
  { time: '00:00', price: 0.1310 },
  { time: '01:00', price: 0.1315 },
  { time: '02:00', price: 0.1312 },
  { time: '03:00', price: 0.1320 },
  { time: '04:00', price: 0.1318 },
  { time: '05:00', price: 0.1325 },
  { time: '06:00', price: 0.1322 },
  { time: '07:00', price: 0.1324 },
];

const TOTAL_DURATION_SECS = 4 * 3600 + 22 * 60 + 15;
const AVAILABLE_XLM = 12.5;
const POOL_MULTIPLIER = 4.25;

// --- Sub-components ---

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className={styles.chartTooltip}>
        <p className={styles.chartTooltipLabel}>{label}</p>
        <p className={styles.chartTooltipValue}>${payload[0].value.toFixed(4)}</p>
      </div>
    );
  }
  return null;
};

interface DistBarProps {
  label: string;
  pct: number;
  isPeak: boolean;
  delay: number;
}

const DistBar = ({ label, pct, isPeak, delay }: DistBarProps) => {
  const fillRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = fillRef.current;
    if (!el) return;
    const timeout = setTimeout(() => {
      el.style.width = `${pct}%`;
    }, delay);
    return () => clearTimeout(timeout);
  }, [pct, delay]);

  return (
    <div className={styles.distRow}>
      <span className={styles.distLabel}>{label}</span>
      <div className={styles.distBarTrack}>
        <div
          ref={fillRef}
          className={cn(styles.distBarFill, isPeak && styles.distBarPeak)}
          style={{ width: 0, transition: `width 0.6s ease-out ${delay}ms` }}
        />
      </div>
      <span className={styles.distPct}>{pct}%</span>
    </div>
  );
};

const PredictionDistribution = () => {
  const predictions = [
    { label: '< $0.130', pct: 8 },
    { label: '$0.130–0.132', pct: 14 },
    { label: '$0.132–0.134', pct: 31 },
    { label: '$0.134–0.136', pct: 28 },
    { label: '$0.136–0.138', pct: 12 },
    { label: '> $0.138', pct: 7 },
  ];
  const max = Math.max(...predictions.map((p) => p.pct));

  return (
    <div className={styles.distCard}>
      <div className={styles.distHeader}>
        <Target size={16} className={styles.distIcon} />
        <span className={styles.distTitle}>Prediction Distribution</span>
        <span className={styles.distParticipants}>
          <Users size={12} />
          {activeRound.participants.toLocaleString()} participants
        </span>
      </div>
      <div className={styles.distBars}>
        {predictions.map((p, i) => (
          <DistBar
            key={i}
            label={p.label}
            pct={Math.round((p.pct / max) * 100)}
            isPeak={p.pct === max}
            delay={i * 70}
          />
        ))}
      </div>
    </div>
  );
};

interface ConfidenceFillProps {
  pct: number;
  color: string;
}

const ConfidenceFill = ({ pct, color }: ConfidenceFillProps) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.style.width = `${pct}%`;
    });
  }, [pct]);

  return (
    <div
      ref={ref}
      className={styles.confidenceFill}
      style={{ width: 0, background: color, transition: 'width 0.6s ease-out, background 0.4s' }}
    />
  );
};

// --- Main Page ---

export const ActiveRoundPage = () => {
  const [timeLeft, setTimeLeft] = useState(TOTAL_DURATION_SECS);
  const [activeTab, setActiveTab] = useState<'1H' | '4H' | '1D'>('1H');
  const [prediction, setPrediction] = useState('');
  const [stake, setStake] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const stakeNum = parseFloat(stake) || 0;
  const estimatedPayout = stakeNum > 0 ? stakeNum * POOL_MULTIPLIER : 0;
  const confidence =
    stakeNum === 0
      ? 0
      : stakeNum < 2
      ? 25
      : stakeNum < 5
      ? 55
      : stakeNum < 10
      ? 75
      : 92;
  const confidenceLabel =
    confidence === 0
      ? '–'
      : confidence < 40
      ? 'Low'
      : confidence < 65
      ? 'Medium'
      : confidence < 80
      ? 'High'
      : 'Very High';
  const confidenceColor =
    confidence < 40
      ? '#f43f5e'
      : confidence < 65
      ? '#eab308'
      : '#10b981';

  useEffect(() => {
    if (timeLeft <= 0) return;
    const id = setInterval(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [timeLeft]);

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600).toString().padStart(2, '0');
    const m = Math.floor((secs % 3600) / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${h}:${m}:${s}`;
  };

  const handleMaxStake = () => setStake(AVAILABLE_XLM.toString());

  const handleSubmit = useCallback(() => {
    if (!prediction || !stake || stakeNum <= 0 || stakeNum > AVAILABLE_XLM) return;
    setSubmitted(true);
    setTimeout(() => setSubmitted(false), 2500);
  }, [prediction, stake, stakeNum]);

  const canSubmit =
    prediction !== '' &&
    stakeNum > 0 &&
    stakeNum <= AVAILABLE_XLM &&
    timeLeft > 0;

  const predNum = parseFloat(prediction);
  const sentiment =
    !prediction
      ? null
      : predNum > activeRound.currentPrice
      ? 'bull'
      : predNum < activeRound.currentPrice
      ? 'bear'
      : 'neutral';

  return (
    <div className={cn(styles.container, mounted && styles.containerMounted)}>
      {/* Breadcrumb / Status */}
      <div className={styles.breadcrumb}>
        <div className={styles.breadcrumbLeft}>
          <span>Home</span>
          <ChevronRight className="w-3 h-3" />
          <span className={styles.activePath}>Active Round {activeRound.id}</span>
        </div>
        <div className={styles.breadcrumbRight}>
          <div className={styles.liveBadge}>
            <span className={styles.ping}>
              <span className={styles.pingInner}></span>
              <span className={styles.pingDot}></span>
            </span>
            Live Market
          </div>
        </div>
      </div>

      <div className={styles.mainGrid}>
        {/* LEFT: Chart & Market Data */}
        <div className={styles.chartColumn}>
          {/* Chart Card */}
          <div className={cn('glass-card', styles.chartCard)}>
            <div className={styles.chartHeader}>
              <div className={styles.chartTitleArea}>
                <h2 className={styles.pairLabel}>XLM/USD Pair</h2>
                <div className={styles.priceArea}>
                  <span className={styles.price}>${activeRound.currentPrice}</span>
                  <span className={styles.change}>
                    {activeRound.priceChange >= 0 ? (
                      <ArrowUpRight className="w-4 h-4" />
                    ) : (
                      <TrendingDown className="w-4 h-4" />
                    )}
                    {activeRound.priceChange >= 0 ? '+' : ''}{activeRound.priceChange}%
                  </span>
                </div>
              </div>
              <div className={styles.statsRow}>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Round Timer</span>
                  <span
                    className={cn(
                      styles.statValue,
                      styles.timer,
                      timeLeft < 600 && styles.timerUrgent
                    )}
                  >
                    {formatTime(timeLeft)}
                  </span>
                </div>
                <div className={styles.divider}></div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Pool Size</span>
                  <span className={cn(styles.statValue, styles.pool)}>
                    {activeRound.poolSize.toLocaleString()} XLM
                  </span>
                </div>
              </div>
            </div>

            {/* Price Chart */}
            <div className={styles.chartArea}>
              <div className={styles.gridOverlay}></div>

              <div className={styles.chartControls}>
                {(['1H', '4H', '1D'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={cn(styles.chartTab, activeTab === tab && styles.activeTab)}
                  >
                    {tab}
                  </button>
                ))}
              </div>

              <div className={styles.chartInner}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart
                    data={chartData}
                    margin={{ top: 40, right: 16, left: 4, bottom: 0 }}
                  >
                    <defs>
                      <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00d1ff" stopOpacity={0.25} />
                        <stop offset="95%" stopColor="#00d1ff" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis
                      dataKey="time"
                      tick={{ fill: 'rgba(187,201,207,0.5)', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={['auto', 'auto']}
                      tickFormatter={(v: number) => `$${v.toFixed(3)}`}
                      tick={{ fill: 'rgba(187,201,207,0.5)', fontSize: 10 }}
                      axisLine={false}
                      tickLine={false}
                      width={58}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <ReferenceLine
                      y={activeRound.currentPrice}
                      stroke="rgba(0,209,255,0.3)"
                      strokeDasharray="4 4"
                    />
                    <Area
                      type="monotone"
                      dataKey="price"
                      stroke="#00d1ff"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#colorPrice)"
                      dot={false}
                      activeDot={{ r: 5, fill: '#00d1ff', strokeWidth: 2, stroke: '#0b0e14' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Prediction Distribution */}
          <PredictionDistribution />

          {/* Activity Card */}
          <div className={cn('glass-card', styles.activityCard)}>
            <div className={styles.participantsArea}>
              <div className={styles.avatarGroup}>
                <span className={styles.avatarLabel}>Participants</span>
                <div className={styles.avatars}>
                  {['JD', 'AK', '0x', '+12'].map((init, i) => (
                    <div
                      key={i}
                      className={cn(
                        styles.avatar,
                        i === 0
                          ? styles.avatarMain
                          : i === 1
                          ? styles.avatarSec
                          : i === 2
                          ? styles.avatarTer
                          : styles.avatarMore
                      )}
                    >
                      {init}
                    </div>
                  ))}
                </div>
              </div>
              <div className={styles.divider}></div>
              <div className={styles.avatarGroup}>
                <span className={styles.avatarLabel}>Avg Prediction</span>
                <span className={styles.statValue}>${activeRound.avgPrediction}</span>
              </div>
              <div className={styles.divider}></div>
              <div className={styles.avatarGroup}>
                <span className={styles.avatarLabel}>Total Participants</span>
                <span className={styles.statValue}>{activeRound.participants.toLocaleString()}</span>
              </div>
            </div>
            <button className={styles.detailButton}>
              Detailed Round Data
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* RIGHT: Prediction Box */}
        <div className={styles.predictionBox}>
          {/* Predict Card */}
          <div className={cn('glass-card', styles.predictCard)}>
            <div className={styles.predictHeader}>
              <h3 className={styles.predictTitle}>Predict XLM Price</h3>
              <p className={cn(styles.predictSub, timeLeft < 600 && styles.predictSubUrgent)}>
                Round closes in{' '}
                <span className={styles.timerInline}>{formatTime(timeLeft)}</span>
              </p>
            </div>

            <div className={styles.predictForm}>
              {/* Price Input */}
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>Price Prediction (USD)</label>
                <div className={styles.inputWrapper}>
                  <input
                    className={styles.input}
                    placeholder="0.1350"
                    type="number"
                    step="0.0001"
                    min="0"
                    value={prediction}
                    onChange={(e) => setPrediction(e.target.value)}
                  />
                  <span className={styles.inputSuffix}>USD</span>
                </div>
                {sentiment === 'bull' && (
                  <div className={styles.hintBull}>
                    <TrendingUp size={11} /> Bullish — you predict price rises
                  </div>
                )}
                {sentiment === 'bear' && (
                  <div className={styles.hintBear}>
                    <TrendingDown size={11} /> Bearish — you predict price drops
                  </div>
                )}
                {sentiment === 'neutral' && (
                  <div className={styles.hintNeutral}>Same as current price</div>
                )}
              </div>

              {/* Stake Input */}
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>Stake Amount (XLM)</label>
                <div className={styles.inputWrapper}>
                  <input
                    className={cn(styles.input, stakeNum > AVAILABLE_XLM && styles.inputError)}
                    placeholder="10.00"
                    type="number"
                    min="0"
                    max={AVAILABLE_XLM}
                    step="0.5"
                    value={stake}
                    onChange={(e) => setStake(e.target.value)}
                  />
                  <span className={styles.inputSuffix}>XLM</span>
                </div>
                <div className={styles.inputFooter}>
                  <span className={styles.available}>Available: {AVAILABLE_XLM} XLM</span>
                  <button className={styles.maxButton} onClick={handleMaxStake}>
                    Max Stake
                  </button>
                </div>
                {stakeNum > AVAILABLE_XLM && (
                  <p className={styles.errorMsg}>Exceeds available balance</p>
                )}
              </div>

              {/* Confidence meter */}
              {stakeNum > 0 && (
                <div className={styles.confidenceMeter}>
                  <div className={styles.confidenceHeader}>
                    <span className={styles.confidenceLabel}>
                      <Zap size={12} /> Win Confidence
                    </span>
                    <span className={styles.confidenceValue} style={{ color: confidenceColor }}>
                      {confidenceLabel}
                    </span>
                  </div>
                  <div className={styles.confidenceTrack}>
                    <ConfidenceFill pct={confidence} color={confidenceColor} />
                  </div>
                </div>
              )}

              {/* Summary */}
              <div className={styles.summary}>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Estimated Payout</span>
                  <span className={cn(styles.summaryValue, styles.payout)}>
                    {estimatedPayout > 0 ? `~ ${estimatedPayout.toFixed(2)} XLM` : '–'}
                  </span>
                </div>
                <div className={styles.summaryDivider}></div>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Probability Score</span>
                  <span className={styles.summaryValue} style={{ color: confidenceColor }}>
                    {confidenceLabel === '–' ? 'Pending' : `${confidenceLabel} Confidence`}
                  </span>
                </div>
              </div>

              {/* Submit */}
              <button
                className={cn(
                  styles.submitButton,
                  !canSubmit && styles.submitDisabled,
                  submitted && styles.submitSuccess
                )}
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                {submitted ? '✓ Prediction Submitted!' : 'Submit Prediction'}
              </button>

              <div className={styles.securityNote}>
                <Lock className="w-3 h-3" />
                Secured by Stellar Smart Contracts
              </div>
            </div>
          </div>

          {/* How it works */}
          <div className={cn('glass-card', styles.infoCard)}>
            <div className={styles.infoTitleArea}>
              <Info className={cn('w-5 h-5', styles.infoIcon)} strokeWidth={3} />
              <h4 className={styles.infoTitle}>How it works</h4>
            </div>
            <ul className={styles.infoList}>
              {[
                'Predict the price of XLM at the end of the round.',
                'Stake your XLM into the prediction pool.',
                'Closest predictions share the pool rewards proportionally.',
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

      {/* Live Feed Ticker */}
      <footer className={styles.ticker}>
        <div className={styles.tickerContent}>
          <div className={styles.liveFeedLabelArea}>
            <span className={styles.liveFeedDot}></span>
            <span className={styles.liveFeedLabel}>Live Feed</span>
          </div>
          <div className={styles.marqueeContainer}>
            <div className={styles.marquee}>
              {[1, 2].map((rep) => (
                <React.Fragment key={rep}>
                  <div className={styles.tickerItem}>
                    <span className={styles.tickerUser}>0x...A1</span>
                    <span>just staked <span className={styles.tickerAction}>20 XLM</span></span>
                    <span className={styles.tickerDot}></span>
                  </div>
                  <div className={styles.tickerItem}>
                    <span className={styles.tickerUser}>stellar_pro</span>
                    <span>predicted <span className={styles.tickerAction}>$0.1341</span></span>
                    <span className={styles.tickerDot}></span>
                  </div>
                  <div className={styles.tickerItem}>
                    <span className={styles.tickerUser}>whale_watcher</span>
                    <span>just staked <span className={styles.tickerAction}>1,200 XLM</span></span>
                    <span className={styles.tickerDot}></span>
                  </div>
                  <div className={styles.tickerItem}>
                    <span className={styles.tickerUser}>moon_shot</span>
                    <span>predicted <span className={styles.tickerAction}>$0.1450</span></span>
                    <span className={styles.tickerDot}></span>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
