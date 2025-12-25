-- Initial schema for trades and candles

-- trades table
CREATE TABLE IF NOT EXISTS trades (
    id SERIAL PRIMARY KEY,
    exchange VARCHAR(20) NOT NULL,
    market_id VARCHAR(255) NOT NULL,
    price DECIMAL(20, 10) NOT NULL,
    quantity DECIMAL(20, 10) NOT NULL,
    side VARCHAR(10) NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    tx_hash VARCHAR(66),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(exchange, market_id, timestamp, tx_hash)
);

-- candles table (pre-aggregated OHLC data)
CREATE TABLE IF NOT EXISTS candles (
    id SERIAL PRIMARY KEY,
    exchange VARCHAR(20) NOT NULL,
    market_id VARCHAR(255) NOT NULL,
    interval VARCHAR(5) NOT NULL,
    open_time TIMESTAMPTZ NOT NULL,
    open DECIMAL(20, 10) NOT NULL,
    high DECIMAL(20, 10) NOT NULL,
    low DECIMAL(20, 10) NOT NULL,
    close DECIMAL(20, 10) NOT NULL,
    volume DECIMAL(20, 10) NOT NULL,
    UNIQUE(exchange, market_id, interval, open_time)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_trades_lookup ON trades(exchange, market_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_trades_side ON trades(exchange, market_id, side, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_candles_lookup ON candles(exchange, market_id, interval, open_time DESC);

