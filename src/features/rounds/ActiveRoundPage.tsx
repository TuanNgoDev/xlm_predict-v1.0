import React from 'react';
import { 
  ChevronRight, 
  TrendingUp, 
  ArrowUpRight, 
  Info, 
  Lock, 
  ExternalLink 
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { activeRound } from '../../services/mockData';
import { cn, formatCurrency } from '../../lib/utils';

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

import styles from './ActiveRoundPage.module.css';

export const ActiveRoundPage = () => {
  return (
    <div className={styles.container}>
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
          <div className={cn("glass-card", styles.chartCard)}>
            <div className={styles.chartHeader}>
              <div className={styles.chartTitleArea}>
                <h2 className={styles.pairLabel}>XLM/USD Pair</h2>
                <div className={styles.priceArea}>
                  <span className={styles.price}>${activeRound.currentPrice}</span>
                  <span className={styles.change}>
                    <TrendingUp className="w-4 h-4" />
                    +{activeRound.priceChange}%
                  </span>
                </div>
              </div>
              <div className={styles.statsRow}>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Round Timer</span>
                  <span className={cn(styles.statValue, styles.timer)}>{activeRound.timer}</span>
                </div>
                <div className={styles.divider}></div>
                <div className={styles.statItem}>
                  <span className={styles.statLabel}>Pool Size</span>
                  <span className={cn(styles.statValue, styles.pool)}>{activeRound.poolSize.toLocaleString()} XLM</span>
                </div>
              </div>
            </div>

            {/* Price Chart */}
            <div className={styles.chartArea}>
              <div className={styles.gridOverlay}></div>
              
              <div className="w-full h-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#00d1ff" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#00d1ff" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <Area 
                      type="monotone" 
                      dataKey="price" 
                      stroke="#00d1ff" 
                      strokeWidth={3}
                      fillOpacity={1} 
                      fill="url(#colorPrice)" 
                      dot={false}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#1d2026', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px' }}
                      itemStyle={{ color: '#00d1ff' }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              <div className={styles.chartControls}>
                <button className={cn(styles.chartTab, styles.activeTab)}>1H</button>
                <button className={styles.chartTab}>4H</button>
                <button className={styles.chartTab}>1D</button>
              </div>
            </div>
          </div>

          {/* Recent Activity (Horizontal Card) */}
          <div className={cn("glass-card", styles.activityCard)}>
            <div className={styles.participantsArea}>
              <div className={styles.avatarGroup}>
                <span className={styles.avatarLabel}>Participants</span>
                <div className={styles.avatars}>
                  <div className={cn(styles.avatar, styles.avatarMain)}>JD</div>
                  <div className={cn(styles.avatar, styles.avatarSec)}>AK</div>
                  <div className={cn(styles.avatar, styles.avatarTer)}>0x</div>
                  <div className={cn(styles.avatar, styles.avatarMore)}>+12</div>
                </div>
              </div>
              <div className={styles.divider}></div>
              <div className={styles.avatarGroup}>
                <span className={styles.avatarLabel}>Avg Prediction</span>
                <span className={styles.statValue}>${activeRound.avgPrediction}</span>
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
          <div className={cn("glass-card", styles.predictCard)}>
            <div className={styles.predictHeader}>
              <h3 className={styles.predictTitle}>Predict XLM Price</h3>
              <p className={styles.predictSub}>Round closes in 04:22:15</p>
            </div>
            <div className={styles.predictForm}>
              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>Price Prediction (USD)</label>
                <div className={styles.inputWrapper}>
                  <input 
                    className={styles.input}
                    placeholder="0.1350"
                    type="number"
                    step="0.0001"
                  />
                  <span className={styles.inputSuffix}>USD</span>
                </div>
              </div>

              <div className={styles.inputGroup}>
                <label className={styles.inputLabel}>Stake Amount (XLM)</label>
                <div className={styles.inputWrapper}>
                  <input 
                    className={styles.input}
                    placeholder="10.00"
                    type="number"
                  />
                  <span className={styles.inputSuffix}>XLM</span>
                </div>
                <div className={styles.inputFooter}>
                  <span className={styles.available}>Available: 12.5 XLM</span>
                  <button className={styles.maxButton}>Max</button>
                </div>
              </div>

              <div className={styles.summary}>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Estimated Payout</span>
                  <span className={cn(styles.summaryValue, styles.payout)}>~ 42.50 XLM</span>
                </div>
                <div className={styles.summaryRow}>
                  <span className={styles.summaryLabel}>Probability Score</span>
                  <span className={cn(styles.summaryValue, styles.confidence)}>High Confidence</span>
                </div>
              </div>

              <button className={styles.submitButton}>
                Submit Prediction
              </button>

              <div className={styles.securityNote}>
                <Lock className="w-3 h-3" />
                Secured by Stellar Smart Contracts
              </div>
            </div>
          </div>

          {/* Info Widget */}
          <div className={cn("glass-card", styles.infoCard)}>
            <div className={styles.infoTitleArea}>
              <Info className="text-primary-container w-5 h-5" />
              <h4 className={styles.infoTitle}>How it works</h4>
            </div>
            <ul className={styles.infoList}>
              <li className={styles.infoItem}>
                <span className={styles.infoStep}>01.</span>
                <p>Predict the price of XLM at the end of the round.</p>
              </li>
              <li className={styles.infoItem}>
                <span className={styles.infoStep}>02.</span>
                <p>Stake your XLM into the prediction pool.</p>
              </li>
              <li className={styles.infoItem}>
                <span className={styles.infoStep}>03.</span>
                <p>Closest predictions share the pool rewards proportionally.</p>
              </li>
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
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};
