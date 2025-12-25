import WebSocket from 'ws';
import db from '../db/client';
import { Trade } from '../types';
import { tradeEmitter } from '../events/trade-emitter';

const KALSHI_WS_URL = 'wss://a.prediction-markets-api.dflow.net/api/v1/ws';
const DFLOW_API_KEY = process.env.DFLOW_API_KEY || '';

interface KalshiTradeMessage {
    channel: 'trades';
    type: 'trade';
    market_ticker: string;
    trade_id: string;
    price: number;
    count: number;
    yes_price: number;
    no_price: number;
    yes_price_dollars: string;
    no_price_dollars: string;
    taker_side: 'yes' | 'no';
    created_time: number;
}

class KalshiIndexer {
    private ws: WebSocket | null = null;
    private reconnectTimeout: NodeJS.Timeout | null = null;
    private isRunning = false;

    start() {
        if (this.isRunning) {
            console.log('[Kalshi] Indexer already running');
            return;
        }

        this.isRunning = true;
        this.connect();
    }

    stop() {
        this.isRunning = false;
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        console.log('[Kalshi] Indexer stopped');
    }

    private connect() {
        if (!DFLOW_API_KEY) {
            console.error('[Kalshi] DFLOW_API_KEY not set. Skipping connection.');
            return;
        }

        console.log('[Kalshi] Connecting to WebSocket...');

        this.ws = new WebSocket(KALSHI_WS_URL, {
            headers: {
                'x-api-key': DFLOW_API_KEY,
            },
        });

        this.ws.on('open', () => {
            console.log('[Kalshi] WebSocket connected');
            this.subscribe();
        });

        this.ws.on('message', (data: WebSocket.Data) => {
            try {
                const message = JSON.parse(data.toString());
                this.handleMessage(message);
            } catch (error) {
                console.error('[Kalshi] Failed to parse message:', error);
            }
        });

        this.ws.on('close', () => {
            console.log('[Kalshi] WebSocket disconnected');
            this.scheduleReconnect();
        });

        this.ws.on('error', (error) => {
            console.error('[Kalshi] WebSocket error:', error);
        });
    }

    private subscribe() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        // Subscribe to all trades
        const subscribeMsg = {
            type: 'subscribe',
            channel: 'trades',
            all: true,
        };

        this.ws.send(JSON.stringify(subscribeMsg));
        console.log('[Kalshi] Subscribed to trades channel');
    }

    private handleMessage(message: any) {
        // Skip non-trade messages
        if (message.channel !== 'trades' || message.type !== 'trade') {
            return;
        }

        const tradeMsg = message as KalshiTradeMessage;
        this.processTrade(tradeMsg);
    }

    private async processTrade(msg: KalshiTradeMessage) {
        // Map taker_side to buy/sell
        // "yes" taker means someone bought yes contracts
        // "no" taker means someone bought no contracts (effectively selling yes)
        const side = msg.taker_side === 'yes' ? 'buy' : 'sell';

        // created_time is Unix timestamp - could be seconds or milliseconds
        // If value is less than a reasonable milliseconds threshold, treat as seconds
        const timestampMs = msg.created_time < 10000000000
            ? msg.created_time * 1000
            : msg.created_time;

        const trade: Trade = {
            exchange: 'kalshi',
            marketId: msg.market_ticker,
            price: msg.yes_price_dollars,
            quantity: msg.count.toString(),
            side,
            timestamp: new Date(timestampMs),
            txHash: msg.trade_id, // Using trade_id as unique identifier
        };

        try {
            await this.insertTrade(trade);
            // Log the trade
            console.log(`📊 [Kalshi] Trade: ${trade.side.toUpperCase()} ${trade.quantity} @ $${trade.price} | ${trade.marketId}`);
            // Emit trade for WebSocket broadcasting
            tradeEmitter.emit('trade', trade);
        } catch (error) {
            console.error('[Kalshi] ❌ Failed to insert trade:', error, trade);
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

        console.log('[Kalshi] Scheduling reconnect in 5 seconds...');
        this.reconnectTimeout = setTimeout(() => {
            this.connect();
        }, 5000);
    }
}

export const kalshiIndexer = new KalshiIndexer();

