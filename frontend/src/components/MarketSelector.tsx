import { useEffect, useState, useRef } from 'react';
import type { Exchange, Interval, Market } from '../types';
import { fetchMarkets } from '../services/api';

interface MarketSelectorProps {
  exchange: Exchange;
  marketId: string;
  interval: Interval;
  onExchangeChange: (exchange: Exchange) => void;
  onMarketChange: (marketId: string) => void;
  onIntervalChange: (interval: Interval) => void;
}

export function MarketSelector({
  exchange,
  marketId,
  interval,
  onExchangeChange,
  onMarketChange,
  onIntervalChange,
}: MarketSelectorProps) {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Fetch markets when exchange changes
  useEffect(() => {
    setIsLoading(true);
    setSearchQuery('');
    fetchMarkets(exchange)
      .then((data) => {
        setMarkets(data);
        // Auto-select first market if none selected
        if (!marketId && data.length > 0) {
          onMarketChange(data[0].marketId);
        }
        setIsLoading(false);
      })
      .catch((err) => {
        console.error('Failed to fetch markets:', err);
        setIsLoading(false);
      });
  }, [exchange]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Format market ID for display
  const formatMarketId = (id: string): string => {
    // Kalshi IDs are readable, Polymarket IDs are long numbers
    if (id.length > 30) {
      return `${id.slice(0, 8)}...${id.slice(-6)}`;
    }
    return id;
  };

  // Filter markets based on search query
  const filteredMarkets = markets.filter((m) =>
    m.marketId.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Get selected market display name
  const selectedMarket = markets.find((m) => m.marketId === marketId);
  const displayValue = selectedMarket
    ? `${formatMarketId(selectedMarket.marketId)} (${selectedMarket.tradeCount} trades)`
    : '';

  const handleSelectMarket = (id: string) => {
    onMarketChange(id);
    setSearchQuery('');
    setIsDropdownOpen(false);
  };

  const handleInputFocus = () => {
    setIsDropdownOpen(true);
    setSearchQuery('');
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
    setIsDropdownOpen(true);
  };

  return (
    <div className="market-selector">
      {/* Exchange Toggle */}
      <div className="selector-group">
        <label>Exchange</label>
        <div className="toggle-group">
          <button
            className={`toggle-btn ${exchange === 'kalshi' ? 'active' : ''}`}
            onClick={() => {
              onExchangeChange('kalshi');
              onMarketChange('');
            }}
          >
            📊 Kalshi
          </button>
          <button
            className={`toggle-btn ${exchange === 'polymarket' ? 'active' : ''}`}
            onClick={() => {
              onExchangeChange('polymarket');
              onMarketChange('');
            }}
          >
            🔮 Polymarket
          </button>
        </div>
      </div>

      {/* Searchable Market Dropdown */}
      <div className="selector-group">
        <label>Market</label>
        <div className="searchable-dropdown" ref={dropdownRef}>
          <input
            ref={inputRef}
            type="text"
            className="market-search-input"
            placeholder={isLoading ? 'Loading markets...' : 'Search markets...'}
            value={isDropdownOpen ? searchQuery : displayValue}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            disabled={isLoading || markets.length === 0}
          />
          <span className="dropdown-arrow" onClick={() => !isLoading && setIsDropdownOpen(!isDropdownOpen)}>
            {isDropdownOpen ? '▲' : '▼'}
          </span>
          
          {isDropdownOpen && !isLoading && markets.length > 0 && (
            <div className="dropdown-list">
              {filteredMarkets.length === 0 ? (
                <div className="dropdown-item no-results">No markets match "{searchQuery}"</div>
              ) : (
                filteredMarkets.map((m) => (
                  <div
                    key={m.marketId}
                    className={`dropdown-item ${m.marketId === marketId ? 'selected' : ''}`}
                    onClick={() => handleSelectMarket(m.marketId)}
                  >
                    <span className="market-name">{formatMarketId(m.marketId)}</span>
                    <span className="trade-count">{m.tradeCount} trades</span>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Interval Selector */}
      <div className="selector-group">
        <label>Interval</label>
        <div className="toggle-group">
          {(['1s', '1m', '1h'] as Interval[]).map((int) => (
            <button
              key={int}
              className={`toggle-btn ${interval === int ? 'active' : ''}`}
              onClick={() => onIntervalChange(int)}
            >
              {int}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
