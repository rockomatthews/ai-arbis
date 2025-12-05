import { bpsToDecimal } from '../core/math.js';
import {
  ExecutionReport,
  ExecutionSignal,
  OrderRequest
} from '../core/types.js';
import { BaseExchange } from '../exchanges/baseExchange.js';
import { eventBus } from '../lib/eventBus.js';
import { logger } from '../lib/logger.js';
import { tradeStore } from './tradeStore.js';

type ConnectorMap = Record<string, BaseExchange>;

export class ExecutionEngine {
  private consecutiveFailures = 0;
  private pausedUntil = 0;

  constructor(
    private readonly connectors: ConnectorMap,
    private readonly dryRun: boolean
  ) {}

  start(): void {
    eventBus.on('signal', (signal) => {
      if (this.isPaused()) {
        logger.warn('Execution paused, skipping signal', {
          opportunityId: signal.opportunity.id
        });
        return;
      }

      this.execute(signal).catch((error) => this.handleFailure(signal, error));
    });
  }

  private isPaused(): boolean {
    return Date.now() < this.pausedUntil;
  }

  private async execute(signal: ExecutionSignal): Promise<void> {
    const { opportunity } = signal;

    if (opportunity.expiry < Date.now()) {
      this.emitReport({
        opportunityId: opportunity.id,
        success: false,
        message: 'Signal expired',
        timestamp: Date.now()
      });
      return;
    }

    const buyConnector = this.connectors[opportunity.legBuyExchange];
    const sellConnector = this.connectors[opportunity.legSellExchange];

    if (!buyConnector || !sellConnector) {
      throw new Error('Missing exchange connector');
    }

    const slippageDecimal = bpsToDecimal(signal.maxSlippageBps);
    const buyOrder: OrderRequest = {
      symbol: opportunity.symbol,
      side: 'buy',
      quantity: opportunity.quantity,
      price: opportunity.buyPrice * (1 + slippageDecimal),
      type: 'limit'
    };

    const sellOrder: OrderRequest = {
      symbol: opportunity.symbol,
      side: 'sell',
      quantity: opportunity.quantity,
      price: opportunity.sellPrice * (1 - slippageDecimal),
      type: 'limit'
    };

    if (this.dryRun) {
      const simulatedPnl =
        (sellOrder.price - buyOrder.price) * sellOrder.quantity;
      logger.info('Dry run execution', {
        opportunityId: opportunity.id,
        buyOrder,
        sellOrder,
        pnlUsd: simulatedPnl.toFixed(2)
      });
      tradeStore.record(opportunity, simulatedPnl);
      this.emitReport({
        opportunityId: opportunity.id,
        success: true,
        filledSize: opportunity.quantity,
        pnlUsd: simulatedPnl,
        message: 'Dry run',
        timestamp: Date.now()
      });
      return;
    }

    const [buyResult, sellResult] = await Promise.all([
      buyConnector.placeOrder(buyOrder),
      sellConnector.placeOrder(sellOrder)
    ]);

    if (buyResult.status !== 'filled' || sellResult.status !== 'filled') {
      throw new Error('Orders not fully filled');
    }

    const pnl =
      (sellResult.avgPrice - buyResult.avgPrice) * sellResult.filledQty;

    tradeStore.record(opportunity, pnl);
    this.consecutiveFailures = 0;

    this.emitReport({
      opportunityId: opportunity.id,
      success: true,
      filledSize: sellResult.filledQty,
      pnlUsd: pnl,
      timestamp: Date.now()
    });

    logger.info('Executed arbitrage trade', {
      opportunityId: opportunity.id,
      pnlUsd: pnl.toFixed(2)
    });
  }

  private handleFailure(signal: ExecutionSignal, error: Error): void {
    this.consecutiveFailures += 1;

    if (this.consecutiveFailures >= 3) {
      this.pausedUntil = Date.now() + 5_000;
      logger.warn('Circuit breaker triggered', {
        pausedUntil: this.pausedUntil
      });
      this.consecutiveFailures = 0;
    }

    logger.error('Execution failure', {
      opportunityId: signal.opportunity.id,
      error: error.message
    });

    this.emitReport({
      opportunityId: signal.opportunity.id,
      success: false,
      message: error.message,
      timestamp: Date.now()
    });
  }

  private emitReport(report: ExecutionReport): void {
    eventBus.emit('execution', report);
  }
}

