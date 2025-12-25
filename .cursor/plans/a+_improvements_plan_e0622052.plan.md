---
name: A+ Improvements Plan
overview: "Address the critical gaps identified in the assessment: add historical backfill for Polymarket, improve timestamp accuracy, fix WebSocket subscription leak, and add missing deliverables."
todos:
  - id: backfill
    content: Add historical backfill method to Polymarket indexer (fetch last 300 blocks on startup)
    status: completed
  - id: timestamps
    content: Fix block timestamp handling to always use block time, never fall back to new Date()
    status: pending
  - id: websocket-unsub
    content: Add unsubscribe logic in frontend useWebSocket hook when changing markets
    status: pending
  - id: env-example
    content: Create .env.example file with all required environment variables
    status: pending
  - id: latency-metrics
    content: Add p50/p95/p99 latency tracking and per-exchange breakdown to stats
    status: pending
---

# A+ Improvements Plan

This plan addresses the key gaps to make the project stand out, with focus on **indexing speed** (the #1 evaluation criteria).---

## 1. Historical Backfill for Polymarket (Critical)

The most important fix. Currently `watchContractEvent` only listens to live events. On startup, we'll fetch the last ~1 hour of trades before subscribing to live events.**File:** [`backend/src/indexers/polymarket-indexer.ts`](backend/src/indexers/polymarket-indexer.ts)**Changes:**

- Add `backfillHistoricalTrades()` method using viem's `getContractEvents()` to fetch logs from last ~300 blocks
- Call backfill in `start()` before setting up live subscription
- Process historical trades through the same `handleOrderFilled` logic (with deduplication)
- Log backfill progress: "Backfilling X trades from block Y to Z"
```typescript
// New method to add
private async backfillHistoricalTrades(): Promise<void> {
  const currentBlock = await this.client.getBlockNumber();
  const fromBlock = currentBlock - 300n; // ~1 hour on Polygon (2s blocks)
  
  console.log(`[Polymarket] Backfilling trades from block ${fromBlock} to ${currentBlock}...`);
  
  const logs = await this.client.getContractEvents({
    address: CTF_EXCHANGE_ADDRESS,
    abi: CTF_EXCHANGE_ABI,
    eventName: 'OrderFilled',
    fromBlock,
    toBlock: currentBlock,
  });
  
  // Process each log through existing handler
  for (const log of logs) {
    await this.handleOrderFilled(log);
  }
  
  console.log(`[Polymarket] Backfilled ${logs.length} historical trades`);
}
```


---

## 2. Block Timestamp Accuracy (Important)

Currently falls back to `new Date()` if block fetch fails. This makes latency measurements unreliable.**File:** [`backend/src/indexers/polymarket-indexer.ts`](backend/src/indexers/polymarket-indexer.ts)**Changes:**

- Always await block timestamp fetch (required for accurate latency tracking)
- If block fetch fails after retries, log a warning but still use best-effort timestamp
- For historical backfill, batch fetch block timestamps for efficiency
```typescript
// Improved timestamp handling - make it non-optional
const block = await this.client.getBlock({ blockNumber: log.blockNumber });
trade.timestamp = new Date(Number(block.timestamp) * 1000);
```


---

## 3. WebSocket Subscription Cleanup (Moderate)

Frontend subscribes to new markets without unsubscribing from previous ones, causing subscription leaks.**File:** [`frontend/src/hooks/useWebSocket.ts`](frontend/src/hooks/useWebSocket.ts)**Changes:**

- Track current subscription in a ref
- Send unsubscribe message before subscribing to new market
- Clear lastTrade when changing markets
```typescript
// Before subscribing to new market
if (previousSubscription.current) {
  ws.send(JSON.stringify({
    action: 'unsubscribe',
    exchange: previousSubscription.current.exchange,
    marketId: previousSubscription.current.marketId,
  }));
}
```


---

## 4. Add `.env.example` (Deliverable)

Missing file referenced in README.**New File:** `.env.example`

```bash
# Database
DATABASE_URL=postgres://user:pass@localhost:5432/trades

# Kalshi (via DFlow)
DFLOW_API_KEY=your_dflow_api_key

# Kalshi Direct API (for market titles)
KALSHI_API_KEY_ID=your_kalshi_key_id
KALSHI_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----..."

# Polymarket (via Alchemy)
ALCHEMY_WS_URL=wss://polygon-mainnet.g.alchemy.com/v2/your_alchemy_api_key

# Server
PORT=3000

# CORS
FRONTEND_URL=http://localhost:5173
```

---

## 5. Performance Metrics Enhancement (Polish)

Add indexing latency breakdown by exchange to the `/stats` endpoint and frontend.**File:** [`backend/src/services/performance-tracker.ts`](backend/src/services/performance-tracker.ts)**Changes:**

- Track p50/p95/p99 latencies (not just avg/min/max)
- Add "trades backfilled" counter for Polymarket

**File:** [`frontend/src/components/PerformanceStats.tsx`](frontend/src/components/PerformanceStats.tsx)**Changes:**

- Display per-exchange latency breakdown
- Show backfill status indicator

---

## Architecture After Changes

```mermaid
sequenceDiagram
    participant Startup
    participant Backfill
    participant LiveWS
    participant DB

    Startup->>Backfill: 1. Fetch last 300 blocks
    Backfill->>DB: Insert historical trades
    Backfill->>Startup: Done (X trades)
    Startup->>LiveWS: 2. Subscribe to live events
    LiveWS->>DB: Insert live trades (with dedup)
```

---

## Summary of Changes

| Item | Priority | Files Changed |

|------|----------|---------------|

| Historical backfill | Critical | `polymarket-indexer.ts` |

| Block timestamps | Important | `polymarket-indexer.ts` |

| WebSocket unsub | Moderate | `useWebSocket.ts` |

| `.env.example` | Required | New file |

| Latency metrics | Polish | `performance-tracker.ts`, `PerformanceStats.tsx` |