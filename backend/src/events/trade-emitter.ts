import { EventEmitter } from 'events';
import { Trade } from '../types';

class TradeEmitter extends EventEmitter {
  constructor() {
    super();
    // Increase max listeners for many WebSocket clients
    this.setMaxListeners(100);
  }

  emitTrade(trade: Trade) {
    this.emit('trade', trade);
  }
}

export const tradeEmitter = new TradeEmitter();

