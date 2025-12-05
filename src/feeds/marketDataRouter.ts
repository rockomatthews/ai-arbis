import EventEmitter from 'eventemitter3';
import { OrderBookSnapshot } from '../core/types.js';
import { logger } from '../lib/logger.js';
import { BaseExchange } from '../exchanges/baseExchange.js';

type RouterEvents = {
  snapshot: (snapshot: OrderBookSnapshot) => void;
};

export class MarketDataRouter extends EventEmitter<RouterEvents> {
  private readonly cache = new Map<string, OrderBookSnapshot>();

  registerExchange(connector: BaseExchange): void {
    connector.on('orderBook', (snapshot) => {
      this.publish(snapshot);
    });

    connector.on('error', (error) => {
      logger.error('Exchange feed error', {
        exchange: connector.name,
        error: error.message
      });
    });
  }

  publish(snapshot: OrderBookSnapshot): void {
    const key = this.cacheKey(snapshot.exchange, snapshot.symbol);
    this.cache.set(key, snapshot);
    this.emit('snapshot', snapshot);
  }

  getSnapshot(exchange: string, symbol: string): OrderBookSnapshot | undefined {
    return this.cache.get(this.cacheKey(exchange, symbol));
  }

  private cacheKey(exchange: string, symbol: string): string {
    return `${exchange}::${symbol}`;
  }
}

