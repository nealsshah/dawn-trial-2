import { createPublicClient, webSocket, parseAbiItem, formatUnits, Log, decodeEventLog } from 'viem';
import { polygon } from 'viem/chains';
import db from '../db/client';
import { Trade } from '../types';
import { tradeEmitter } from '../events/trade-emitter';
import { performanceTracker } from '../services/performance-tracker';
import path from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

// Polymarket CTF Exchange contract address on Polygon
const CTF_EXCHANGE_ADDRESS = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E' as const;

// USDC token ID (Polymarket uses USDC.e on Polygon)
// The taker sends USDC to buy outcome tokens
const USDC_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'; // USDC.e on Polygon

// OrderFilled event ABI from the CTF Exchange contract
const ORDER_FILLED_EVENT = parseAbiItem(
  'event OrderFilled(bytes32 indexed orderHash, address indexed maker, address indexed taker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled, uint256 fee)'
);

// OrdersMatched event for when two orders match
const ORDERS_MATCHED_EVENT = parseAbiItem(
  'event OrdersMatched(bytes32 indexed takerOrderHash, address indexed takerOrderMaker, uint256 makerAssetId, uint256 takerAssetId, uint256 makerAmountFilled, uint256 takerAmountFilled)'
);

// Full ABI for decoding
const CTF_EXCHANGE_ABI = [
  {
    type: 'event',
    name: 'OrderFilled',
    inputs: [
      { name: 'orderHash', type: 'bytes32', indexed: true },
      { name: 'maker', type: 'address', indexed: true },
      { name: 'taker', type: 'address', indexed: true },
      { name: 'makerAssetId', type: 'uint256', indexed: false },
      { name: 'takerAssetId', type: 'uint256', indexed: false },
      { name: 'makerAmountFilled', type: 'uint256', indexed: false },
      { name: 'takerAmountFilled', type: 'uint256', indexed: false },
      { name: 'fee', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'OrdersMatched',
    inputs: [
      { name: 'takerOrderHash', type: 'bytes32', indexed: true },
      { name: 'takerOrderMaker', type: 'address', indexed: true },
      { name: 'makerAssetId', type: 'uint256', indexed: false },
      { name: 'takerAssetId', type: 'uint256', indexed: false },
      { name: 'makerAmountFilled', type: 'uint256', indexed: false },
      { name: 'takerAmountFilled', type: 'uint256', indexed: false },
    ],
  },
] as const;

interface OrderFilledArgs {
  orderHash: `0x${string}`;
  maker: `0x${string}`;
  taker: `0x${string}`;
  makerAssetId: bigint;
  takerAssetId: bigint;
  makerAmountFilled: bigint;
  takerAmountFilled: bigint;
  fee: bigint;
}

class PolymarketIndexer {
  private client: ReturnType<typeof createPublicClient> | null = null;
  private unwatch: (() => void) | null = null;
  private isRunning = false;
  private processedTxHashes: Set<string> = new Set();

  async start() {
    const alchemyWsUrl = process.env.ALCHEMY_WS_URL;
    if (!alchemyWsUrl) {
      console.error('[Polymarket] ALCHEMY_WS_URL not set. Skipping on-chain indexer.');
      return;
    }

    if (this.isRunning) {
      console.log('[Polymarket] Indexer already running');
      return;
    }

    this.isRunning = true;
    console.log('[Polymarket] Connecting to Polygon via Alchemy WebSocket...');
    console.log(`[Polymarket] Watching CTF Exchange contract: ${CTF_EXCHANGE_ADDRESS}`);

    try {
      this.client = createPublicClient({
        chain: polygon,
        transport: webSocket(alchemyWsUrl, {
          reconnect: {
            attempts: 10,
            delay: 5000,
          },
        }),
      });

      // Subscribe to OrderFilled events on the CTF Exchange
      this.unwatch = this.client.watchContractEvent({
        address: CTF_EXCHANGE_ADDRESS,
        abi: CTF_EXCHANGE_ABI,
        eventName: 'OrderFilled',
        onLogs: (logs) => {
          for (const log of logs) {
            this.handleOrderFilled(log);
          }
        },
        onError: (error) => {
          console.error('[Polymarket] WebSocket error:', error.message);
          this.scheduleReconnect();
        },
      });

      console.log('[Polymarket] ✅ Subscribed to CTF Exchange OrderFilled events');
      console.log('[Polymarket] Listening for live trades on Polygon...');
    } catch (error) {
      console.error('[Polymarket] Failed to connect:', error);
      this.scheduleReconnect();
    }
  }

  stop() {
    this.isRunning = false;
    if (this.unwatch) {
      this.unwatch();
      this.unwatch = null;
    }
    this.client = null;
    console.log('[Polymarket] Indexer stopped');
  }

  private async handleOrderFilled(log: Log<bigint, number, false>) {
    try {
      // Decode the event
      const decoded = decodeEventLog({
        abi: CTF_EXCHANGE_ABI,
        data: log.data,
        topics: log.topics,
      });

      if (decoded.eventName !== 'OrderFilled') return;

      const args = decoded.args as unknown as OrderFilledArgs;
      const txHash = log.transactionHash;
      const logIndex = log.logIndex ?? 0;
      const uniqueId = `${txHash}-${logIndex}`;

      // Skip already processed
      if (this.processedTxHashes.has(uniqueId)) {
        return;
      }
      this.processedTxHashes.add(uniqueId);

      // Keep set size manageable
      if (this.processedTxHashes.size > 10000) {
        const iterator = this.processedTxHashes.values();
        const firstValue = iterator.next().value;
        if (firstValue) {
          this.processedTxHashes.delete(firstValue);
        }
      }

      // Determine which asset is USDC-like (the quote) vs outcome token
      // In Polymarket: larger asset IDs are outcome tokens, 0 or small IDs are USDC
      // Actually in CTF Exchange, makerAssetId and takerAssetId are the ERC1155 token IDs
      // USDC has a special representation - let's check if one of the amounts is much larger

      const makerAmount = args.makerAmountFilled;
      const takerAmount = args.takerAmountFilled;
      const makerAssetId = args.makerAssetId;
      const takerAssetId = args.takerAssetId;

      // The marketId will be one of the asset IDs (the outcome token)
      // Prices in Polymarket are 0-1 (representing probability)
      // If maker is selling outcome tokens for USDC: maker sends outcome, taker sends USDC
      // If maker is buying outcome tokens with USDC: maker sends USDC, taker sends outcome

      // For simplicity, we'll use the outcome token ID as the market ID
      // The larger asset ID is typically the outcome token
      const isOutcomeTokenMaker = makerAssetId > takerAssetId;
      const outcomeTokenId = isOutcomeTokenMaker ? makerAssetId : takerAssetId;
      const usdcAmount = isOutcomeTokenMaker ? takerAmount : makerAmount;
      const outcomeAmount = isOutcomeTokenMaker ? makerAmount : takerAmount;

      // Price = USDC amount / outcome amount (in 6 decimal USDC vs 6 decimal outcome tokens)
      // Both USDC.e and outcome tokens use 6 decimals on Polymarket
      const price = outcomeAmount > 0n
        ? Number(usdcAmount) / Number(outcomeAmount)
        : 0;

      // Side: if maker is selling outcome tokens, this is a SELL; otherwise BUY
      // From taker perspective (who is filling the order):
      // If taker receives outcome tokens (isOutcomeTokenMaker), taker is BUYING
      // If taker sends outcome tokens (!isOutcomeTokenMaker), taker is SELLING
      const side: 'buy' | 'sell' = isOutcomeTokenMaker ? 'buy' : 'sell';

      // Format quantity (6 decimals for outcome tokens)
      const quantity = formatUnits(outcomeAmount, 6);

      const trade: Trade = {
        exchange: 'polymarket',
        marketId: outcomeTokenId.toString(),
        price: price.toFixed(4),
        quantity,
        side,
        timestamp: new Date(), // Will be updated with block timestamp if needed
        txHash: txHash ?? undefined,
      };

      // Try to get block timestamp for more accurate timing
      if (this.client && log.blockNumber) {
        try {
          const block = await this.client.getBlock({ blockNumber: log.blockNumber });
          trade.timestamp = new Date(Number(block.timestamp) * 1000);
        } catch {
          // Use current time if block fetch fails
        }
      }

      const indexedAt = new Date();
      await this.insertTrade(trade);

      // Track performance metrics
      performanceTracker.recordTrade('polymarket', trade.timestamp, indexedAt);

      console.log(`🔮 [Polymarket] Trade: ${trade.side.toUpperCase()} ${parseFloat(trade.quantity).toFixed(2)} @ $${trade.price} | Token: ${trade.marketId.slice(0, 12)}... | tx: ${txHash?.slice(0, 10)}...`);

      tradeEmitter.emit('trade', trade);
    } catch (error) {
      console.error('[Polymarket] Error processing OrderFilled:', error);
    }
  }

  private async insertTrade(trade: Trade) {
    const query = `
      INSERT INTO trades (exchange, market_id, price, quantity, side, timestamp, tx_hash)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (exchange, market_id, timestamp, tx_hash) DO NOTHING
    `;

    await db.query(query, [
      trade.exchange,
      trade.marketId,
      trade.price,
      trade.quantity,
      trade.side,
      trade.timestamp,
      trade.txHash,
    ]);
  }

  private scheduleReconnect() {
    if (!this.isRunning) return;

    console.log('[Polymarket] Scheduling reconnection in 5 seconds...');
    setTimeout(() => {
      if (this.isRunning) {
        this.start();
      }
    }, 5000);
  }
}

export const polymarketIndexer = new PolymarketIndexer();
