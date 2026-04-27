'use client';

import React, { useEffect, useRef } from 'react';
import styles from './TradingViewWidget.module.css';

type Interval = '1H' | '4H' | '1D';

const INTERVAL_MAP: Record<Interval, string> = {
  '1H': '60',
  '4H': '240',
  '1D': 'D',
};

interface TradingViewWidgetProps {
  interval: Interval;
  height?: number;
}

export const TradingViewWidget: React.FC<TradingViewWidgetProps> = ({
  interval,
  height = 380,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const scriptRef = useRef<HTMLScriptElement | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear previous widget
    container.innerHTML = '';

    // TradingView requires a fresh script injection each time the widget config changes
    const script = document.createElement('script');
    script.src =
      'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
    script.type = 'text/javascript';
    script.async = true;
    script.innerHTML = JSON.stringify({
      autosize: true,
      symbol: 'BINANCE:XLMUSDT',
      interval: INTERVAL_MAP[interval],
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',           // Candlestick
      locale: 'en',
      toolbar_bg: '#0d1117',
      enable_publishing: false,
      hide_top_toolbar: false,
      hide_legend: false,
      save_image: false,
      backgroundColor: 'rgba(9, 11, 17, 0)',
      gridColor: 'rgba(255, 255, 255, 0.04)',
      hide_volume: false,
      support_host: 'https://www.tradingview.com',
      container_id: 'tv_xlm_chart',
      overrides: {
        'paneProperties.background': '#090b11',
        'paneProperties.backgroundType': 'solid',
        'mainSeriesProperties.candleStyle.upColor': '#10b981',
        'mainSeriesProperties.candleStyle.downColor': '#f43f5e',
        'mainSeriesProperties.candleStyle.borderUpColor': '#10b981',
        'mainSeriesProperties.candleStyle.borderDownColor': '#f43f5e',
        'mainSeriesProperties.candleStyle.wickUpColor': '#10b981',
        'mainSeriesProperties.candleStyle.wickDownColor': '#f43f5e',
      },
    });

    container.appendChild(script);
    scriptRef.current = script;

    return () => {
      if (container) container.innerHTML = '';
    };
  }, [interval]);

  return (
    <div className={styles.wrapper} style={{ height }}>
      <div
        id="tv_xlm_chart"
        ref={containerRef}
        className={styles.tvContainer}
      />
    </div>
  );
};
