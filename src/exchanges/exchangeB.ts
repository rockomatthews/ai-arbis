import axios from 'axios';
import { config } from '../config.js';
import { OrderBookSnapshot } from '../core/types.js';
import { logger } from '../lib/logger.js';
import { BaseExchange } from './baseExchange.js';

const toOkxInstId = (symbol: string): string =>
  `${symbol.slice(0, -4)}-${symbol.slice(-4)}`;

export class ExchangeBConnector extends BaseExchange {
  private timer?: NodeJS.Timeout;

  constructor() {
    super(config.exchanges.exchangeB);
  }

  get name(): string {
    return config.exchanges.exchangeB.name;
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
        logger.warn('OKX depth poll failed', {
          symbol,
          error: (error as Error).message
        });
      }
    }
  }

  private async fetchDepth(symbol: string): Promise<OrderBookSnapshot> {
    const instId = toOkxInstId(symbol);
    const response = await axios.get(
      `${this.cfg.restBaseUrl}/api/v5/market/books`,
      {
        params: { instId, sz: 10 },
        timeout: 3_000
      }
    );

    const payload = response.data as {
      code: string;
      data: Array<{
        asks: [string, string][];
        bids: [string, string][];
        ts: string;
      }>;
    };

    if (payload.code !== '0' || !payload.data?.length) {
      throw new Error(`OKX error code ${payload.code}`);
    }

    const book = payload.data[0];

    return {
      exchange: this.name,
      symbol,
      bids: book.bids.map(([price, size]) => ({
        price: Number(price),
        size: Number(size)
      })),
      asks: book.asks.map(([price, size]) => ({
        price: Number(price),
        size: Number(size)
      })),
      lastUpdateId: Number(book.ts),
      receivedAt: Date.now()
    };
  }
}

