import EventEmitter from 'eventemitter3';
import { v4 as uuid } from 'uuid';
import { ExchangeConfig } from '../config.js';
import {
  BalanceSummary,
  OrderBookLevel,
  OrderBookSnapshot,
  OrderRequest,
  OrderResult
} from '../core/types.js';
import { logger } from '../lib/logger.js';

export type ExchangeConnectorEvents = {
  orderBook: (snapshot: OrderBookSnapshot) => void;
  balance: (balance: BalanceSummary) => void;
  error: (error: Error) => void;
};

const DEFAULT_BALANCES: BalanceSummary[] = [
  {
    exchange: 'placeholder',
    asset: 'USDT',
    free: 100_000,
    locked: 0,
    timestamp: Date.now()
  },
  {
    exchange: 'placeholder',
    asset: 'BTC',
    free: 5,
    locked: 0,
    timestamp: Date.now()
  },
  {
    exchange: 'placeholder',
    asset: 'ETH',
    free: 100,
    locked: 0,
    timestamp: Date.now()
  }
];

export abstract class BaseExchange extends EventEmitter<ExchangeConnectorEvents> {
  protected running = false;
  protected pairs: string[] = [];
  protected simTimer?: NodeJS.Timeout;
  private readonly basePrices: Record<string, number> = {};

  protected constructor(protected readonly cfg: ExchangeConfig) {
    super();
  }

  abstract get name(): string;

  async start(pairs: string[]): Promise<void> {
    this.pairs = pairs;
    this.running = true;
    await this.bootstrap();
    this.emitBalances();
    await this.startMarketData();
    logger.info('Exchange started', { exchange: this.name, pairs: this.pairs });
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.stopMarketData();
    await this.teardown();
    logger.info('Exchange stopped', { exchange: this.name });
  }

  protected async bootstrap(): Promise<void> {
    // Hook for real API connections.
  }

  protected async teardown(): Promise<void> {
    // Hook for cleanup.
  }

  protected emitOrderBook(snapshot: OrderBookSnapshot): void {
    this.emit('orderBook', snapshot);
  }

  protected emitBalance(balance: BalanceSummary): void {
    this.emit('balance', balance);
  }

  protected async startMarketData(): Promise<void> {
    this.startSimulatedFeed();
  }

  protected async stopMarketData(): Promise<void> {
    if (this.simTimer) {
      clearInterval(this.simTimer);
      this.simTimer = undefined;
    }
  }

  private emitBalances(): void {
    DEFAULT_BALANCES.forEach((balance) =>
      this.emitBalance({ ...balance, exchange: this.name })
    );
  }

  private startSimulatedFeed(): void {
    const interval = Math.max(this.cfg.targetLatencyMs, 200);

    this.simTimer = setInterval(() => {
      if (!this.running) {
        return;
      }

      for (const symbol of this.pairs) {
        const snapshot = this.generateOrderBook(symbol);
        this.emitOrderBook(snapshot);
      }
    }, interval);
  }

  private generateOrderBook(symbol: string): OrderBookSnapshot {
    const mid = this.sampleMidPrice(symbol);
    const volatility = mid * 0.0005;
    const skew = this.simulationSkew();
    const bid = mid - volatility + skew;
    const ask = mid + volatility + skew;

    const bids: OrderBookLevel[] = [
      { price: Number(bid.toFixed(2)), size: 0.5 + Math.random() },
      { price: Number((bid - 2 * Math.random()).toFixed(2)), size: 0.5 + Math.random() }
    ];

    const asks: OrderBookLevel[] = [
      { price: Number(ask.toFixed(2)), size: 0.5 + Math.random() },
      { price: Number((ask + 2 * Math.random()).toFixed(2)), size: 0.5 + Math.random() }
    ];

    return {
      exchange: this.name,
      symbol,
      bids,
      asks,
      lastUpdateId: Math.floor(Math.random() * 1_000_000),
      receivedAt: Date.now()
    };
  }

  private sampleMidPrice(symbol: string): number {
    if (!this.basePrices[symbol]) {
      const base =
        symbol.startsWith('BTC') ? 60_000 : symbol.startsWith('ETH') ? 3_000 : 1;
      this.basePrices[symbol] = base;
    }

    const noise = 1 + (Math.random() - 0.5) * 0.001;
    this.basePrices[symbol] *= noise;

    return this.basePrices[symbol];
  }

  protected simulationSkew(): number {
    return 0;
  }

  async placeOrder(request: OrderRequest): Promise<OrderResult> {
    logger.debug('Simulated order placement', {
      exchange: this.name,
      request
    });

    return {
      orderId: uuid(),
      filledQty: request.quantity,
      avgPrice: request.price,
      status: 'filled',
      timestamp: Date.now()
    };
  }
}

