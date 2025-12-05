import { config } from '../config.js';
import { BaseExchange } from './baseExchange.js';

export class ExchangeBConnector extends BaseExchange {
  constructor() {
    super(config.exchanges.exchangeB);
  }

  get name(): string {
    return config.exchanges.exchangeB.name;
  }

  protected override simulationSkew(): number {
    return 5; // Slightly more expensive to form arb windows.
  }
}

