import { v4 as uuid } from 'uuid';
import { config, ExchangeConfig } from '../config.js';
import { netSpreadBps, effectivePrice } from '../core/math.js';
import {
  Opportunity,
  ExecutionSignal,
  OrderBookSnapshot
} from '../core/types.js';
import { eventBus } from '../lib/eventBus.js';
import { logger } from '../lib/logger.js';
import { MarketDataRouter } from '../feeds/marketDataRouter.js';

const SIGNAL_TTL_MS = 2_000;
const MISSING_BOOK_LOG_INTERVAL_MS = 5_000;

export class CrossExchangeStrategy {
  private readonly coolDown = new Map<string, number>();
  private readonly activeSignals = new Set<string>();
  private readonly missingBookLog = new Map<string, number>();

  constructor(private readonly router: MarketDataRouter) {}

  start(): void {
    this.router.on('snapshot', (snapshot) => {
      this.evaluate(snapshot.symbol);
    });

    eventBus.on('execution', (report) => {
      this.activeSignals.delete(report.opportunityId);
    });

    logger.info('Cross exchange strategy ready');
  }

  private evaluate(symbol: string): void {
    const cfgA = config.exchanges.exchangeA;
    const cfgB = config.exchanges.exchangeB;
    const bookA = this.router.getSnapshot(cfgA.name, symbol);
    const bookB = this.router.getSnapshot(cfgB.name, symbol);

    if (!bookA || !bookB) {
      this.logBookAvailability(symbol, cfgA.name, cfgB.name, !!bookA, !!bookB);
      return;
    }

    this.checkDirection(symbol, bookA, bookB, cfgA, cfgB);
    this.checkDirection(symbol, bookB, bookA, cfgB, cfgA);
  }

  private checkDirection(
    symbol: string,
    buyBook: OrderBookSnapshot,
    sellBook: OrderBookSnapshot,
    buyCfg: ExchangeConfig,
    sellCfg: ExchangeConfig
  ): void {
    if (!buyBook.asks.length || !sellBook.bids.length) {
      logger.debug('Order book missing depth', {
        symbol,
        direction: `${buyCfg.name}->${sellCfg.name}`,
        buyDepth: buyBook.asks.length,
        sellDepth: sellBook.bids.length
      });
      return;
    }

    const bestAsk = buyBook.asks[0];
    const bestBid = sellBook.bids[0];
    const indicativePrice = (bestAsk.price + bestBid.price) / 2;
    const minNotional = Math.max(buyCfg.minNotional, sellCfg.minNotional);
    const maxNotional = Math.min(
      buyCfg.maxPositionNotional,
      sellCfg.maxPositionNotional
    );

    const minQty = minNotional / indicativePrice;
    const maxQty = maxNotional / indicativePrice;
    const depthQty = Math.min(bestAsk.size, bestBid.size);
    const quantity = Math.min(depthQty, maxQty);

    if (quantity <= 0 || quantity < minQty) {
      logger.debug('Insufficient executable size', {
        symbol,
        direction: `${buyCfg.name}->${sellCfg.name}`,
        quantity: quantity.toFixed(6),
        minQty: minQty.toFixed(6)
      });
      return;
    }

    const buyPrice = effectivePrice(buyBook.asks, quantity);
    const sellPrice = effectivePrice(sellBook.bids, quantity);

    if (!buyPrice || !sellPrice) {
      logger.debug('Unable to compute effective price', {
        symbol,
        direction: `${buyCfg.name}->${sellCfg.name}`,
        quantity: quantity.toFixed(6)
      });
      return;
    }

    const netBpsValue = netSpreadBps({
      buyPrice,
      sellPrice,
      buyFeeBps: buyCfg.takerFeeBps,
      sellFeeBps: sellCfg.takerFeeBps,
      slippageBps: config.slippageBps
    });

    logger.info('Spread snapshot', {
      symbol,
      buyExchange: buyCfg.name,
      sellExchange: sellCfg.name,
      buyPrice: buyPrice.toFixed(2),
      sellPrice: sellPrice.toFixed(2),
      netBpsValue: netBpsValue.toFixed(3)
    });

    if (netBpsValue > -1) {
      logger.info('Near signal window', {
        symbol,
        direction: `${buyCfg.name}->${sellCfg.name}`,
        netBpsValue: netBpsValue.toFixed(3),
        minNetSpreadBps: config.minNetSpreadBps.toFixed(3),
        buyPrice: buyPrice.toFixed(4),
        sellPrice: sellPrice.toFixed(4)
      });
    }

    if (netBpsValue < config.minNetSpreadBps) {
      logger.info('No signal - below threshold', {
        symbol,
        direction: `${buyCfg.name}->${sellCfg.name}`,
        netBpsValue: netBpsValue.toFixed(3),
        minNetSpreadBps: config.minNetSpreadBps.toFixed(3)
      });
      return;
    }

    if (this.activeSignals.size >= config.maxConcurrentSignals) {
      logger.info('No signal - max concurrent reached', {
        symbol,
        activeSignals: this.activeSignals.size,
        maxConcurrentSignals: config.maxConcurrentSignals
      });
      return;
    }

    const key = `${symbol}:${buyCfg.name}->${sellCfg.name}`;
    const readyAt = this.coolDown.get(key);
    if (readyAt && readyAt > Date.now()) {
      logger.info('No signal - cooling down', {
        symbol,
        direction: `${buyCfg.name}->${sellCfg.name}`,
        readyAt
      });
      return;
    }

    const opportunity: Opportunity = {
      id: uuid(),
      symbol,
      legBuyExchange: buyCfg.name,
      legSellExchange: sellCfg.name,
      quantity,
      buyPrice,
      sellPrice,
      grossSpreadBps: netBpsValue + config.slippageBps * 2,
      netSpreadBps: netBpsValue,
      expiry: Date.now() + SIGNAL_TTL_MS
    };

    const signal: ExecutionSignal = {
      opportunity,
      maxSlippageBps: config.slippageBps,
      createdAt: Date.now()
    };

    this.activeSignals.add(opportunity.id);
    this.coolDown.set(key, Date.now() + SIGNAL_TTL_MS);
    eventBus.emit('signal', signal);

    logger.info('Emitted execution signal', {
      opportunityId: opportunity.id,
      symbol,
      netSpreadBps: netBpsValue.toFixed(2),
      direction: `${buyCfg.name}->${sellCfg.name}`
    });
  }

  private logBookAvailability(
    symbol: string,
    exchangeAName: string,
    exchangeBName: string,
    hasExchangeA: boolean,
    hasExchangeB: boolean
  ): void {
    const key = `${symbol}:${Number(hasExchangeA)}:${Number(hasExchangeB)}`;
    const now = Date.now();
    const lastLogAt = this.missingBookLog.get(key) ?? 0;

    if (now - lastLogAt < MISSING_BOOK_LOG_INTERVAL_MS) {
      return;
    }

    this.missingBookLog.set(key, now);
    logger.info('Awaiting counterpart order book', {
      symbol,
      availability: {
        [exchangeAName]: hasExchangeA,
        [exchangeBName]: hasExchangeB
      }
    });
  }
}

