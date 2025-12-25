import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  ColorType,
} from 'lightweight-charts';
import type {
  IChartApi,
  ISeriesApi,
  CandlestickData,
  Time,
} from 'lightweight-charts';
import type { Candle, Trade, Exchange, Interval } from '../types';
import { fetchCandles } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';

interface ChartProps {
  exchange: Exchange;
  marketId: string;
  interval: Interval;
}

// Convert our Candle to TradingView format
function toChartCandle(candle: Candle): CandlestickData<Time> {
  return {
    time: (new Date(candle.openTime).getTime() / 1000) as Time,
    open: parseFloat(candle.open),
    high: parseFloat(candle.high),
    low: parseFloat(candle.low),
    close: parseFloat(candle.close),
  };
}

// Get interval in seconds
function getIntervalSeconds(interval: Interval): number {
  switch (interval) {
    case '1s': return 1;
    case '1m': return 60;
    case '1h': return 3600;
  }
}

export function Chart({ exchange, marketId, interval }: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const candlesRef = useRef<Map<number, CandlestickData<Time>>>(new Map());
  
  // Keep interval in a ref to avoid stale closures
  const intervalRef = useRef(interval);
  useEffect(() => {
    intervalRef.current = interval;
  }, [interval]);

  // Handle live trade updates - use useCallback with stable deps
  const handleTrade = useCallback((trade: Trade) => {
    const series = seriesRef.current;
    if (!series) {
      console.log('[Chart] No series ref, skipping trade update');
      return;
    }

    const currentInterval = intervalRef.current;
    const tradeTime = new Date(trade.timestamp).getTime() / 1000;
    const intervalSec = getIntervalSeconds(currentInterval);
    const candleTime = Math.floor(tradeTime / intervalSec) * intervalSec;
    const price = parseFloat(trade.price);

    console.log(`[Chart] Processing trade: price=${price}, candleTime=${candleTime}, interval=${currentInterval}`);

    const existing = candlesRef.current.get(candleTime);

    if (existing) {
      // Update existing candle
      const updated: CandlestickData<Time> = {
        time: candleTime as Time,
        open: existing.open,
        high: Math.max(existing.high, price),
        low: Math.min(existing.low, price),
        close: price,
      };
      candlesRef.current.set(candleTime, updated);
      series.update(updated);
      console.log(`[Chart] Updated candle: O=${updated.open} H=${updated.high} L=${updated.low} C=${updated.close}`);
    } else {
      // Create new candle
      const newCandle: CandlestickData<Time> = {
        time: candleTime as Time,
        open: price,
        high: price,
        low: price,
        close: price,
      };
      candlesRef.current.set(candleTime, newCandle);
      series.update(newCandle);
      console.log(`[Chart] Created new candle: price=${price}, time=${candleTime}`);
    }
  }, []); // Empty deps - uses refs internally

  const { isConnected, lastTrade } = useWebSocket({
    exchange,
    marketId,
    onTrade: handleTrade,
  });

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0a0a0f' },
        textColor: '#9ca3af',
      },
      grid: {
        vertLines: { color: '#1f2937' },
        horzLines: { color: '#1f2937' },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: '#6366f1',
          width: 1,
          style: 2,
        },
        horzLine: {
          color: '#6366f1',
          width: 1,
          style: 2,
        },
      },
      timeScale: {
        borderColor: '#374151',
        timeVisible: true,
        secondsVisible: interval === '1s',
      },
      rightPriceScale: {
        borderColor: '#374151',
      },
    });

    const series = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderUpColor: '#22c55e',
      borderDownColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // Handle resize
    const handleResize = () => {
      if (containerRef.current) {
        chart.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [interval]);

  // Load candles when market/interval changes
  useEffect(() => {
    if (!marketId || !seriesRef.current) return;

    setIsLoading(true);
    setError(null);
    candlesRef.current.clear();

    fetchCandles(exchange, marketId, interval, 500)
      .then((candles) => {
        if (!seriesRef.current) return;

        // Sort candles by time ascending (oldest first)
        const sortedCandles = candles.sort((a, b) => 
          new Date(a.openTime).getTime() - new Date(b.openTime).getTime()
        );
        
        const chartCandles = sortedCandles.map(toChartCandle);
        
        // Store candles for live updates
        chartCandles.forEach((c) => {
          candlesRef.current.set(c.time as number, c);
        });

        seriesRef.current.setData(chartCandles);
        chartRef.current?.timeScale().fitContent();
        setIsLoading(false);
        
        console.log(`[Chart] Loaded ${chartCandles.length} candles for ${marketId}`);
      })
      .catch((err) => {
        setError(err.message);
        setIsLoading(false);
      });
  }, [exchange, marketId, interval]);

  return (
    <div className="chart-container">
      {/* Status bar */}
      <div className="chart-status">
        <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`} />
        <span className="status-text">
          {isConnected ? 'Live' : 'Connecting...'}
        </span>
        {lastTrade && (
          <span className="last-trade">
            Last: ${parseFloat(lastTrade.price).toFixed(4)} ({lastTrade.side})
          </span>
        )}
      </div>

      {/* Chart */}
      <div ref={containerRef} className="chart" />

      {/* Loading/Error overlay */}
      {isLoading && (
        <div className="chart-overlay">
          <div className="loading-spinner" />
          <span>Loading chart data...</span>
        </div>
      )}
      {error && (
        <div className="chart-overlay error">
          <span>⚠️ {error}</span>
        </div>
      )}
    </div>
  );
}
