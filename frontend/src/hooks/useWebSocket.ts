import { useEffect, useRef, useState, useCallback } from 'react';
import type { Exchange, Trade, WSMessage } from '../types';

// Use environment variable for production, fallback to localhost for development
const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000/ws';

interface UseWebSocketOptions {
  exchange: Exchange;
  marketId: string;
  onTrade?: (trade: Trade) => void;
}

interface UseWebSocketReturn {
  isConnected: boolean;
  lastTrade: Trade | null;
  error: string | null;
}

export function useWebSocket({
  exchange,
  marketId,
  onTrade,
}: UseWebSocketOptions): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastTrade, setLastTrade] = useState<Trade | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // Use refs to avoid stale closures
  const currentSubscription = useRef({ exchange, marketId });
  // Track previous subscription for cleanup
  const previousSubscription = useRef<{ exchange: Exchange; marketId: string } | null>(null);
  const onTradeRef = useRef(onTrade);

  // Keep onTrade ref up to date
  useEffect(() => {
    onTradeRef.current = onTrade;
  }, [onTrade]);

  // Update subscription ref
  useEffect(() => {
    currentSubscription.current = { exchange, marketId };
  }, [exchange, marketId]);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    console.log('[WebSocket] Connecting...');
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[WebSocket] Connected');
      setIsConnected(true);
      setError(null);
      
      // Subscribe to the market
      const { exchange: ex, marketId: mId } = currentSubscription.current;
      if (ex && mId) {
        console.log(`[WebSocket] Subscribing to ${ex}:${mId}`);
        ws.send(JSON.stringify({
          action: 'subscribe',
          exchange: ex,
          marketId: mId,
        }));
      }
    };

    ws.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);
        
        if (message.type === 'trade') {
          console.log('[WebSocket] Trade received:', message.data.price);
          setLastTrade(message.data);
          // Use ref to get latest callback
          onTradeRef.current?.(message.data);
        } else if (message.type === 'error') {
          setError(message.message);
        } else if (message.type === 'subscribed') {
          console.log(`[WebSocket] Subscribed to ${message.exchange}:${message.marketId}`);
        } else if (message.type === 'unsubscribed') {
          console.log(`[WebSocket] Unsubscribed from ${message.exchange}:${message.marketId}`);
        }
      } catch (err) {
        console.error('[WebSocket] Failed to parse message:', err);
      }
    };

    ws.onclose = () => {
      console.log('[WebSocket] Disconnected');
      setIsConnected(false);
      
      // Reconnect after 3 seconds
      setTimeout(() => {
        if (currentSubscription.current.marketId) {
          connect();
        }
      }, 3000);
    };

    ws.onerror = (err) => {
      console.error('[WebSocket] Error:', err);
      setError('WebSocket connection error');
    };
  }, []);

  // Handle subscription changes
  useEffect(() => {
    if (!marketId) {
      // Close connection if no market selected
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      previousSubscription.current = null;
      setLastTrade(null);
      return;
    }

    // If connected, handle subscription change
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      // Unsubscribe from previous market first (if different)
      const prev = previousSubscription.current;
      if (prev && (prev.exchange !== exchange || prev.marketId !== marketId)) {
        console.log(`[WebSocket] Unsubscribing from ${prev.exchange}:${prev.marketId}`);
        wsRef.current.send(JSON.stringify({
          action: 'unsubscribe',
          exchange: prev.exchange,
          marketId: prev.marketId,
        }));
        // Clear stale trade data when switching markets
        setLastTrade(null);
      }

      // Subscribe to new market
      console.log(`[WebSocket] Subscribing to ${exchange}:${marketId}`);
      wsRef.current.send(JSON.stringify({
        action: 'subscribe',
        exchange,
        marketId,
      }));
    } else {
      // Connect and subscribe
      connect();
    }

    // Track this subscription for future cleanup
    previousSubscription.current = { exchange, marketId };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [exchange, marketId, connect]);

  return { isConnected, lastTrade, error };
}
