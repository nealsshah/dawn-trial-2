import { useState, useEffect, useCallback } from 'react';
import './PerformanceStats.css';

interface QuickStats {
  tradesPerSecond: number;
  avgLatencyMs: number;
  uptimeSeconds: number;
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

  return (
    <div className="performance-stats">
      <div className="quick-stats">
        <div className="stat-pill">
          <span className="stat-label">TPS</span>
          <span className="stat-value">{quickStats?.tradesPerSecond.toFixed(1) ?? '—'}</span>
        </div>
        <div className={`stat-pill ${getLatencyClass(quickStats?.avgLatencyMs ?? 0)}`}>
          <span className="stat-label">Latency</span>
          <span className="stat-value">{quickStats?.avgLatencyMs ?? '—'}ms</span>
        </div>
        <div className="stat-pill">
          <span className="stat-label">API</span>
          <span className="stat-value">{lastApiLatency ?? '—'}ms</span>
        </div>
        <div className="stat-pill">
          <span className="stat-label">Uptime</span>
          <span className="stat-value">{quickStats ? formatUptime(quickStats.uptimeSeconds) : '—'}</span>
        </div>
      </div>
    </div>
  );
}

