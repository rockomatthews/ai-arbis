import { eventBus } from '../lib/eventBus.js';
import { logger } from '../lib/logger.js';

interface Counters {
  signals: number;
  executions: number;
  failures: number;
  pnl: number;
}

export class MetricsTracker {
  private readonly counters: Counters = {
    signals: 0,
    executions: 0,
    failures: 0,
    pnl: 0
  };

  private timer?: NodeJS.Timeout;

  start(): void {
    eventBus.on('signal', () => {
      this.counters.signals += 1;
    });

    eventBus.on('execution', (report) => {
      if (report.success) {
        this.counters.executions += 1;
        this.counters.pnl += report.pnlUsd ?? 0;
      } else {
        this.counters.failures += 1;
      }
    });

    this.timer = setInterval(() => this.flush(), 10_000);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private flush(): void {
    logger.info('Metrics snapshot', { ...this.counters });
  }
}

