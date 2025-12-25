import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import { tradeEmitter } from '../events/trade-emitter';
import { Trade } from '../types';

interface SubscribeMessage {
  action: 'subscribe' | 'unsubscribe';
  exchange: 'polymarket' | 'kalshi';
  marketId: string;
}

interface TradeMessage {
  type: 'trade';
  data: Trade;
}

interface ErrorMessage {
  type: 'error';
  message: string;
}

interface SubscribedMessage {
  type: 'subscribed' | 'unsubscribed';
  exchange: string;
  marketId: string;
}

// Generate subscription key from exchange and marketId
function getSubscriptionKey(exchange: string, marketId: string): string {
  return `${exchange}:${marketId}`;
}

/**
 * WebSocket server for streaming live trades to clients
 */
class TradeWebSocketServer {
  private wss: WebSocketServer | null = null;
  
  // Map of subscription key -> Set of WebSocket clients
  private subscriptions: Map<string, Set<WebSocket>> = new Map();
  
  // Map of WebSocket -> Set of subscription keys (for cleanup on disconnect)
  private clientSubscriptions: Map<WebSocket, Set<string>> = new Map();

  /**
   * Initialize the WebSocket server on the HTTP server
   */
  initialize(server: Server) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    
    console.log('[WebSocket] Server initialized on /ws');

    this.wss.on('connection', (ws: WebSocket) => {
      console.log('[WebSocket] Client connected');
      this.clientSubscriptions.set(ws, new Set());

      ws.on('message', (data) => {
        this.handleMessage(ws, data.toString());
      });

      ws.on('close', () => {
        this.handleDisconnect(ws);
      });

      ws.on('error', (error) => {
        console.error('[WebSocket] Client error:', error.message);
      });

      // Send welcome message
      this.send(ws, { type: 'connected', message: 'Connected to trade stream' });
    });

    // Listen for trades from indexers and broadcast to subscribers
    tradeEmitter.on('trade', (trade: Trade) => {
      this.broadcastTrade(trade);
    });

    console.log('[WebSocket] ✅ Listening for trade events to broadcast');
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(ws: WebSocket, message: string) {
    try {
      const parsed = JSON.parse(message) as SubscribeMessage;

      if (!parsed.action || !parsed.exchange || !parsed.marketId) {
        this.send(ws, {
          type: 'error',
          message: 'Invalid message format. Required: { action, exchange, marketId }',
        });
        return;
      }

      if (parsed.action === 'subscribe') {
        this.subscribe(ws, parsed.exchange, parsed.marketId);
      } else if (parsed.action === 'unsubscribe') {
        this.unsubscribe(ws, parsed.exchange, parsed.marketId);
      } else {
        this.send(ws, {
          type: 'error',
          message: 'Invalid action. Must be "subscribe" or "unsubscribe"',
        });
      }
    } catch (error) {
      this.send(ws, {
        type: 'error',
        message: 'Invalid JSON message',
      });
    }
  }

  /**
   * Subscribe a client to a market
   */
  private subscribe(ws: WebSocket, exchange: string, marketId: string) {
    const key = getSubscriptionKey(exchange, marketId);

    // Add to subscriptions map
    if (!this.subscriptions.has(key)) {
      this.subscriptions.set(key, new Set());
    }
    this.subscriptions.get(key)!.add(ws);

    // Track client's subscriptions
    this.clientSubscriptions.get(ws)?.add(key);

    console.log(`[WebSocket] Client subscribed to ${key}`);

    this.send(ws, {
      type: 'subscribed',
      exchange,
      marketId,
    });
  }

  /**
   * Unsubscribe a client from a market
   */
  private unsubscribe(ws: WebSocket, exchange: string, marketId: string) {
    const key = getSubscriptionKey(exchange, marketId);

    // Remove from subscriptions map
    this.subscriptions.get(key)?.delete(ws);
    if (this.subscriptions.get(key)?.size === 0) {
      this.subscriptions.delete(key);
    }

    // Remove from client's subscriptions
    this.clientSubscriptions.get(ws)?.delete(key);

    console.log(`[WebSocket] Client unsubscribed from ${key}`);

    this.send(ws, {
      type: 'unsubscribed',
      exchange,
      marketId,
    });
  }

  /**
   * Handle client disconnect - clean up all subscriptions
   */
  private handleDisconnect(ws: WebSocket) {
    const clientSubs = this.clientSubscriptions.get(ws);
    
    if (clientSubs) {
      for (const key of clientSubs) {
        this.subscriptions.get(key)?.delete(ws);
        if (this.subscriptions.get(key)?.size === 0) {
          this.subscriptions.delete(key);
        }
      }
    }

    this.clientSubscriptions.delete(ws);
    console.log('[WebSocket] Client disconnected');
  }

  /**
   * Broadcast a trade to all subscribed clients
   */
  private broadcastTrade(trade: Trade) {
    const key = getSubscriptionKey(trade.exchange, trade.marketId);
    const subscribers = this.subscriptions.get(key);

    if (!subscribers || subscribers.size === 0) {
      // Uncomment below to debug subscription mismatches
      // console.log(`[WebSocket] No subscribers for ${key}`);
      return; // No subscribers for this market
    }
    
    console.log(`[WebSocket] Broadcasting trade to ${subscribers.size} subscriber(s) for ${key}`);


    const message: TradeMessage = {
      type: 'trade',
      data: {
        exchange: trade.exchange,
        marketId: trade.marketId,
        price: trade.price,
        quantity: trade.quantity,
        side: trade.side,
        timestamp: trade.timestamp,
        txHash: trade.txHash,
      },
    };

    const messageStr = JSON.stringify(message);

    for (const ws of subscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(messageStr);
      }
    }
  }

  /**
   * Send a message to a specific client
   */
  private send(ws: WebSocket, message: object) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Get current subscription stats
   */
  getStats() {
    return {
      totalSubscriptions: this.subscriptions.size,
      connectedClients: this.clientSubscriptions.size,
      subscriptionDetails: Array.from(this.subscriptions.entries()).map(([key, clients]) => ({
        market: key,
        clientCount: clients.size,
      })),
    };
  }
}

export const tradeWebSocketServer = new TradeWebSocketServer();

