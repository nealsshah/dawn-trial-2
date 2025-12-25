import { useState, useEffect, useCallback } from 'react';
import './PerformanceStats.css';

interface ExchangeQuickStats {
  tps: number;
  avgLatencyMs: number;
  p50: number;
  p95: number;
}

interface QuickStats {
  tradesPerSecond: number;
  avgLatencyMs: number;
  latencyPercentiles: {
    p50: number;
    p95: number;
    p99: number;
  };
  uptimeSeconds: number;
  exchanges: {
    kalshi: ExchangeQuickStats;
    polymarket: ExchangeQuickStats;
  };
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

function formatUptime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  } else if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

function getLatencyClass(latencyMs: number): string {
  if (latencyMs < 500) return 'latency-excellent';
  if (latencyMs < 2000) return 'latency-good';
  if (latencyMs < 5000) return 'latency-fair';
  return 'latency-poor';
}

// Simple tooltip wrapper component
function Tooltip({ children, text }: { children: React.ReactNode; text: string }) {
  return (
    <div className="tooltip-wrapper">
      {children}
      <span className="tooltip-text">{text}</span>
    </div>
  );
}

export function PerformanceStats() {
  const [quickStats, setQuickStats] = useState<QuickStats | null>(null);
  const [lastApiLatency, setLastApiLatency] = useState<number | null>(null);

  const fetchQuickStats = useCallback(async () => {
    try {
      const start = performance.now();
      const response = await fetch(`${API_BASE_URL}/stats/quick`);
      const latency = Math.round(performance.now() - start);
      setLastApiLatency(latency);
      
      if (response.ok) {
        const data: QuickStats = await response.json();
        setQuickStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch quick stats:', error);
    }
  }, []);

  // Quick stats polling (every 2 seconds)
  useEffect(() => {
    fetchQuickStats();
    const interval = setInterval(fetchQuickStats, 2000);
    return () => clearInterval(interval);
  }, [fetchQuickStats]);

  const kalshi = quickStats?.exchanges?.kalshi;
  const polymarket = quickStats?.exchanges?.polymarket;

  return (
    <div className="performance-stats">
      {/* Overall Stats */}
      <div className="quick-stats">
        <Tooltip text="Trades per second indexed in the last 60 seconds">
          <div className="stat-pill">
            <span className="stat-label">TPS</span>
            <span className="stat-value">{quickStats?.tradesPerSecond.toFixed(1) ?? '—'}</span>
          </div>
        </Tooltip>
        <Tooltip text="Median latency (50th percentile) between trade occurrence and indexing">
          <div className={`stat-pill ${getLatencyClass(quickStats?.latencyPercentiles?.p50 ?? 0)}`}>
            <span className="stat-label">p50</span>
            <span className="stat-value">{quickStats?.latencyPercentiles?.p50 ?? '—'}ms</span>
          </div>
        </Tooltip>
        <Tooltip text="95th percentile latency — 95% of trades are indexed faster than this">
          <div className={`stat-pill ${getLatencyClass(quickStats?.latencyPercentiles?.p95 ?? 0)}`}>
            <span className="stat-label">p95</span>
            <span className="stat-value">{quickStats?.latencyPercentiles?.p95 ?? '—'}ms</span>
          </div>
        </Tooltip>
        <Tooltip text="Round-trip time to fetch stats from the backend API">
          <div className="stat-pill">
            <span className="stat-label">API</span>
            <span className="stat-value">{lastApiLatency ?? '—'}ms</span>
          </div>
        </Tooltip>
        <Tooltip text="Time since the backend server started">
          <div className="stat-pill">
            <span className="stat-label">Uptime</span>
            <span className="stat-value">{quickStats ? formatUptime(quickStats.uptimeSeconds) : '—'}</span>
          </div>
        </Tooltip>
      </div>

      {/* Per-Exchange Breakdown */}
      <div className="exchange-stats">
        <Tooltip text="Kalshi trades via DFlow WebSocket API">
          <div className="exchange-stat">
            <span className="exchange-name">Kalshi</span>
            <span className="exchange-tps">{kalshi?.tps.toFixed(1) ?? '0'}/s</span>
            <span className={`exchange-latency ${getLatencyClass(kalshi?.p50 ?? 0)}`}>
              p50: {kalshi?.p50 ?? '—'}ms
            </span>
          </div>
        </Tooltip>
        <Tooltip text="Polymarket trades from Polygon blockchain via Alchemy">
          <div className="exchange-stat">
            <span className="exchange-name">Polymarket</span>
            <span className="exchange-tps">{polymarket?.tps.toFixed(1) ?? '0'}/s</span>
            <span className={`exchange-latency ${getLatencyClass(polymarket?.p50 ?? 0)}`}>
              p50: {polymarket?.p50 ?? '—'}ms
            </span>
          </div>
        </Tooltip>
      </div>
    </div>
  );
}

