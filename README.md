# Prediction Market Trade Indexer

A real-time data indexing and visualization system for prediction market trades from Polymarket (on-chain) and Kalshi (API).

## Features

- Real-time trade indexing from Polymarket (Polygon) and Kalshi
- Pre-aggregated OHLC candlestick data (1s, 1m, 1h intervals)
- REST API for historical candles and trades
- WebSocket for live trade streaming
- React frontend with TradingView Lightweight Charts

## Tech Stack

- **Backend:** TypeScript, Node.js, Express
- **Database:** PostgreSQL
- **Frontend:** React, Vite, TradingView Lightweight Charts
- **Blockchain:** Polygon via Alchemy RPC

## Getting Started

### Prerequisites

- Node.js 18+
- Docker and Docker Compose
- Alchemy account with Polygon API key

### Setup

1. **Clone and install dependencies:**
   ```bash
   # Backend
   cd backend
   npm install

   # Frontend
   cd ../frontend
   npm install
   ```

2. **Configure environment:**
   ```bash
   cp .env.example .env
   ```

3. **Start PostgreSQL:**
   ```bash
   docker-compose up -d
   ```

4. **Run database migrations:**
   ```bash
   cd backend
   npm run migrate
   ```

5. **Start the backend:**
   ```bash
   npm run dev
   ```

6. **Start the frontend (in another terminal):**
   ```bash
   cd frontend
   npm run dev
   ```

## API Endpoints

### GET /candles
Get OHLC candlestick data for a market.

**Query Parameters:**
- `exchange` (required): `polymarket` or `kalshi`
- `marketId` (required): Market identifier
- `interval` (required): `1s`, `1m`, or `1h`
- `start`: Start timestamp (ISO 8601)
- `end`: End timestamp (ISO 8601)
- `limit`: Number of results (default: 100)

### GET /trades
Get latest trades for a market.

**Query Parameters:**
- `exchange` (required): `polymarket` or `kalshi`
- `marketId` (required): Market identifier
- `limit`: Number of results (default: 100)

## WebSocket

Connect to `ws://localhost:3000/ws` for live trade updates.

**Subscribe to a market:**
```json
{ "action": "subscribe", "exchange": "kalshi", "marketId": "MARKET_ID" }
```

**Trade event:**
```json
{ "type": "trade", "data": { "exchange": "kalshi", "marketId": "...", "price": "0.55", ... } }
```

## Frontend

The frontend is available at `http://localhost:5173` after running `npm run dev` in the frontend directory.

**Features:**
- Exchange toggle (Kalshi / Polymarket)
- Market selector dropdown
- Interval selector (1s, 1m, 1h)
- Real-time candlestick chart with TradingView
- Live WebSocket connection for trade updates

## Project Structure

```
├── backend/
│   └── src/
│       ├── api/routes/      # REST API endpoints
│       ├── db/              # Database client and migrations
│       ├── indexers/        # Trade indexers (Kalshi, Polymarket)
│       ├── services/        # Business logic (candle aggregation)
│       ├── types/           # TypeScript interfaces
│       └── websocket/       # WebSocket server
├── frontend/
│   └── src/
│       ├── components/      # React components
│       └── hooks/           # Custom hooks
└── docker-compose.yml
```

## Environment Variables

### Backend (Railway)

```bash
# Database (Neon connection string)
DATABASE_URL=postgres://user:pass@ep-xxx.neon.tech/neondb?sslmode=require

# Kalshi (via DFlow)
DFLOW_API_KEY=your_dflow_api_key

# Kalshi Direct API (for market titles)
KALSHI_API_KEY_ID=your_kalshi_key_id
KALSHI_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----..."

# Polymarket (via Alchemy)
ALCHEMY_WS_URL=wss://polygon-mainnet.g.alchemy.com/v2/your_alchemy_api_key

# Server
PORT=3000

# CORS (set to your Vercel frontend URL)
FRONTEND_URL=https://your-app.vercel.app
```

### Frontend (Vercel)

```bash
VITE_API_URL=https://your-backend.railway.app
VITE_WS_URL=wss://your-backend.railway.app/ws
```

## Production Deployment

### Database (Neon)
1. Create a project at [neon.tech](https://neon.tech)
2. Copy the connection string (includes `?sslmode=require`)
3. Set as `DATABASE_URL` in Railway

### Backend (Railway)
1. Connect GitHub repo to Railway
2. Set environment variables (see above)
3. Deploy - Railway auto-detects Node.js

### Frontend (Vercel)
1. Connect GitHub repo to Vercel
2. Set `VITE_API_URL` and `VITE_WS_URL` environment variables
3. Deploy

## License

MIT
