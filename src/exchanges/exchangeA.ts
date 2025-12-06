import axios from 'axios';
import { config } from '../config.js';
import { OrderBookSnapshot } from '../core/types.js';
import { logger } from '../lib/logger.js';
import { BaseExchange } from './baseExchange.js';

export class ExchangeAConnector extends BaseExchange {
  private timer?: NodeJS.Timeout;

  constructor() {
    super(config.exchanges.exchangeA);
  }

  get name(): string {
    return config.exchanges.exchangeA.name;
  }

  protected override async startMarketData(): Promise<void> {
    await this.pollAll();
    const interval = Math.max(this.cfg.targetLatencyMs, 500);
    this.timer = setInterval(() => {
      void this.pollAll();
    }, interval);
  }

  protected override async stopMarketData(): Promise<void> {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private async pollAll(): Promise<void> {
    for (const symbol of this.pairs) {
      try {
        const snapshot = await this.fetchDepth(symbol);
        this.emitOrderBook(snapshot);
      } catch (error) {
        logger.warn('BinanceUS depth poll failed', {
          symbol,
          error: (error as Error).message
        });
      }
    }
  }

  private async fetchDepth(symbol: string): Promise<OrderBookSnapshot> {
    const response = await axios.get(
      `${this.cfg.restBaseUrl}/api/v3/depth`,
      {
        params: { symbol, limit: 10 },
        timeout: 3_000
      }
    );

    const data = response.data as {
      lastUpdateId: number;
      bids: [string, string][];
      asks: [string, string][];
    };

    return {
      exchange: this.name,
      symbol,
      bids: data.bids.map(([price, size]) => ({
        price: Number(price),
        size: Number(size)
      })),
      asks: data.asks.map(([price, size]) => ({
        price: Number(price),
        size: Number(size)
      })),
      lastUpdateId: data.lastUpdateId,
      receivedAt: Date.now()
    };
  }
}

