import { config } from '../config.js';
import { BaseExchange } from './baseExchange.js';

export class ExchangeAConnector extends BaseExchange {
  constructor() {
    super(config.exchanges.exchangeA);
  }

  get name(): string {
    return config.exchanges.exchangeA.name;
  }

  protected override simulationSkew(): number {
    return -5; // Slightly cheaper bids/asks to create spreads.
  }
}

