import { useState, useEffect } from 'react';
import type { Exchange, Interval } from './types';
import { Chart } from './components/Chart';
import { MarketSelector } from './components/MarketSelector';
import { PerformanceStats } from './components/PerformanceStats';
import { healthCheck } from './services/api';
import './App.css';

function App() {
  const [exchange, setExchange] = useState<Exchange>('kalshi');
  const [marketId, setMarketId] = useState<string>('');
  const [interval, setInterval] = useState<Interval>('1m');
  const [isBackendOnline, setIsBackendOnline] = useState<boolean | null>(null);

  // Check backend health on mount
  useEffect(() => {
    healthCheck().then(setIsBackendOnline);
    
    // Periodic health check
    const intervalId = window.setInterval(() => {
      healthCheck().then(setIsBackendOnline);
    }, 30000);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div className="app">
      {/* Header */}
      <header className="app-header">
        <h1>
          <span className="logo">📈</span>
          Prediction Market Charts
        </h1>
        <div className="header-status">
          <span className={`backend-status ${isBackendOnline ? 'online' : 'offline'}`}>
            {isBackendOnline === null
              ? '⏳ Checking backend...'
              : isBackendOnline
              ? '🟢 Backend online'
              : '🔴 Backend offline'}
          </span>
        </div>
      </header>

      {/* Controls */}
      <div className="controls">
        <MarketSelector
          exchange={exchange}
          marketId={marketId}
          interval={interval}
          onExchangeChange={setExchange}
          onMarketChange={setMarketId}
          onIntervalChange={setInterval}
        />
      </div>

      {/* Performance Stats */}
      {isBackendOnline && <PerformanceStats />}

      {/* Main Content */}
      <main className="main-content">
        {!isBackendOnline ? (
          <div className="placeholder">
            <div className="placeholder-icon">⚠️</div>
            <h2>Backend Not Available</h2>
            <p>
              Unable to connect to the backend service. Please try again later.
            </p>
          </div>
        ) : !marketId ? (
          <div className="placeholder">
            <div className="placeholder-icon">👆</div>
            <h2>Select a Market</h2>
            <p>Choose an exchange and market from the dropdown above to view the chart.</p>
          </div>
        ) : (
          <Chart exchange={exchange} marketId={marketId} interval={interval} />
        )}
      </main>

      {/* Footer */}
      <footer className="app-footer">
        <span>
          Data from{' '}
          <a href="https://kalshi.com" target="_blank" rel="noopener noreferrer">
            Kalshi
          </a>{' '}
          &{' '}
          <a href="https://polymarket.com" target="_blank" rel="noopener noreferrer">
            Polymarket
          </a>
        </span>
      </footer>
    </div>
  );
}

export default App;
