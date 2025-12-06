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
import { BalanceLedger } from '../sim/balanceLedger.js';

type ConnectorMap = Record<string, BaseExchange>;
type DryRunOptions = {
  initialBalance: number;
  maxSlippageBps: number;
  failureChancePct: number;
};

export class ExecutionEngine {
  private consecutiveFailures = 0;
  private pausedUntil = 0;
  private readonly ledger?: BalanceLedger;
  private readonly dryRunOptions?: DryRunOptions;

  constructor(
    private readonly connectors: ConnectorMap,
    private readonly dryRun: boolean,
    options?: DryRunOptions
  ) {
    this.dryRunOptions = options;
    if (this.dryRun) {
      this.ledger = new BalanceLedger(
        Object.keys(connectors),
        options?.initialBalance ?? 0
      );
    }
  }

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

    const extraSlippageBps = this.dryRun
      ? Math.random() * (this.dryRunOptions?.maxSlippageBps ?? 0)
      : 0;
    const extraSlippageDecimal = bpsToDecimal(extraSlippageBps);

    const buyFillPrice = buyOrder.price * (1 + extraSlippageDecimal);
    const sellFillPrice = sellOrder.price * (1 - extraSlippageDecimal);

    const buyNotional = buyOrder.quantity * buyFillPrice;
    const sellNotional = sellOrder.quantity * sellFillPrice;

    if (this.dryRun && this.ledger) {
      if (!this.ledger.canDebit(opportunity.legBuyExchange, buyNotional)) {
        logger.warn('Dry run skipped: insufficient balance', {
          exchange: opportunity.legBuyExchange,
          required: buyNotional.toFixed(2),
          available: this.ledger.getBalance(
            opportunity.legBuyExchange
          ).toFixed(2)
        });
        this.emitReport({
          opportunityId: opportunity.id,
          success: false,
          message: 'Insufficient dry-run balance',
          timestamp: Date.now()
        });
        return;
      }
    }

    if (this.dryRun) {
      const failureChance = this.dryRunOptions?.failureChancePct ?? 0;
      if (failureChance > 0 && Math.random() * 100 < failureChance) {
        logger.warn('Dry run simulated failure', {
          opportunityId: opportunity.id
        });
        this.emitReport({
          opportunityId: opportunity.id,
          success: false,
          message: 'Dry run failure simulation',
          timestamp: Date.now()
        });
        return;
      }

      const simulatedPnl = sellNotional - buyNotional;
      logger.info('Dry run execution', {
        opportunityId: opportunity.id,
        buyOrder,
        sellOrder,
        pnlUsd: simulatedPnl.toFixed(2),
        extraSlippageBps: extraSlippageBps.toFixed(2)
      });
      tradeStore.record(opportunity, simulatedPnl);
      this.ledger?.applyTrade(
        opportunity.legBuyExchange,
        opportunity.legSellExchange,
        buyNotional,
        sellNotional
      );
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

