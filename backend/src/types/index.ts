// Core type definitions for the trade indexer

export type Exchange = 'polymarket' | 'kalshi';
export type Side = 'buy' | 'sell';
export type Interval = '1s' | '1m' | '1h';

export interface Trade {
  id?: number;
  exchange: Exchange;
  marketId: string;
  price: string;        // Use string for decimals to avoid precision loss
  quantity: string;
  side: Side;
  timestamp: Date;
  txHash?: string;      // Only for on-chain trades (Polymarket)
  createdAt?: Date;
}

export interface Candle {
  id?: number;
  exchange: Exchange;
  marketId: string;
  interval: Interval;
  openTime: Date;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

// API request types
export interface GetCandlesParams {
  exchange: Exchange;
  marketId: string;
  interval: Interval;
  start?: string;
  end?: string;
  limit?: number;
}

export interface GetTradesParams {
  exchange: Exchange;
  marketId: string;
  limit?: number;
  side?: Side;
}

// WebSocket message types
export interface WSSubscribeMessage {
  action: 'subscribe' | 'unsubscribe';
  exchange: Exchange;
  marketId: string;
}

export interface WSTradeMessage {
  type: 'trade';
  data: Trade;
}

// API response types
export interface APIResponse<T> {
  data: T;
}

export interface APIErrorResponse {
  error: string;
}

