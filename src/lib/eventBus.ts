import EventEmitter from 'eventemitter3';
import {
  BalanceSummary,
  ExecutionReport,
  ExecutionSignal,
  MetricsSnapshot,
  OrderBookSnapshot
} from '../core/types.js';

export type EventBusEvents = {
  orderBook: (snapshot: OrderBookSnapshot) => void;
  balance: (balance: BalanceSummary) => void;
  signal: (signal: ExecutionSignal) => void;
  execution: (report: ExecutionReport) => void;
  metrics: (snapshot: MetricsSnapshot) => void;
};

export class EventBus extends EventEmitter<EventBusEvents> {}

export const eventBus = new EventBus();

