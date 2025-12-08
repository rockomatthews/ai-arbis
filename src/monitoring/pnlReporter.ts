import fs from 'fs/promises';
import path from 'path';
import { ExecutionReport, MetricsSnapshot } from '../core/types.js';
import { eventBus } from '../lib/eventBus.js';
import { logger } from '../lib/logger.js';

const LOG_DIR = path.resolve('logs');
const METRICS_FILE = path.join(LOG_DIR, 'dryrun-pnl.csv');
const FILLS_FILE = path.join(LOG_DIR, 'dryrun-fills.csv');
const SUMMARY_FILE = path.join(LOG_DIR, 'dryrun-summary.csv');
const SUMMARY_INTERVAL_MS = 12 * 60 * 60 * 1000; // twice a day

export class PnlReporter {
  private metricsListener?: (snapshot: MetricsSnapshot) => void;
  private executionListener?: (report: ExecutionReport) => void;
  private dailyTimer?: NodeJS.Timeout;
  private lastSnapshot?: MetricsSnapshot;
  private lastSummary?: MetricsSnapshot;
  private startedAt = Date.now();

  async start(): Promise<void> {
    await this.ensureFiles();

    this.metricsListener = (snapshot) => {
      this.lastSnapshot = snapshot;
      void this.appendMetrics(snapshot);
    };

    this.executionListener = (report) => {
      void this.appendFill(report);
    };

    eventBus.on('metrics', this.metricsListener);
    eventBus.on('execution', this.executionListener);

    this.dailyTimer = setInterval(() => {
      void this.writeDailySummary();
    }, SUMMARY_INTERVAL_MS);
  }

  stop(): void {
    if (this.metricsListener) {
      eventBus.off('metrics', this.metricsListener);
    }
    if (this.executionListener) {
      eventBus.off('execution', this.executionListener);
    }
    if (this.dailyTimer) {
      clearInterval(this.dailyTimer);
      this.dailyTimer = undefined;
    }
  }

  private async ensureFiles(): Promise<void> {
    await fs.mkdir(LOG_DIR, { recursive: true });
    await this.ensureHeader(
      METRICS_FILE,
      'timestamp_iso,signals,executions,failures,pnl\n'
    );
    await this.ensureHeader(
      FILLS_FILE,
      'timestamp_iso,success,opportunityId,symbol,buyExchange,sellExchange,quantity,buyPrice,sellPrice,netSpreadBps,pnlUsd,filledSize,message\n'
    );
    await this.ensureHeader(
      SUMMARY_FILE,
      'timestamp_iso,signals,executions,failures,pnl,signals_delta,executions_delta,failures_delta,pnl_delta\n'
    );
  }

  private async ensureHeader(file: string, header: string): Promise<void> {
    try {
      await fs.access(file);
    } catch {
      await fs.writeFile(file, header, 'utf8');
    }
  }

  private async appendMetrics(snapshot: MetricsSnapshot): Promise<void> {
    const line = `${new Date(snapshot.timestamp).toISOString()},${snapshot.signals},${snapshot.executions},${snapshot.failures},${snapshot.pnl}\n`;
    await fs.appendFile(METRICS_FILE, line, 'utf8');
  }

  private async appendFill(report: ExecutionReport): Promise<void> {
    const line = [
      new Date(report.timestamp).toISOString(),
      report.success,
      report.opportunityId ?? '',
      report.symbol ?? '',
      report.buyExchange ?? '',
      report.sellExchange ?? '',
      report.quantity ?? '',
      report.buyPrice ?? '',
      report.sellPrice ?? '',
      report.netSpreadBps ?? '',
      report.pnlUsd ?? '',
      report.filledSize ?? '',
      (report.message ?? '').replace(/,/g, ';')
    ].join(',') + '\n';

    await fs.appendFile(FILLS_FILE, line, 'utf8');
  }

  private async writeDailySummary(): Promise<void> {
    if (!this.lastSnapshot) {
      return;
    }

    const prev = this.lastSummary;
    const curr = this.lastSnapshot;

    const deltas = {
      signals: prev ? curr.signals - prev.signals : curr.signals,
      executions: prev ? curr.executions - prev.executions : curr.executions,
      failures: prev ? curr.failures - prev.failures : curr.failures,
      pnl: prev ? curr.pnl - prev.pnl : curr.pnl
    };

    this.lastSummary = curr;

    logger.info('Dry-run summary', {
      startedAt: new Date(this.startedAt).toISOString(),
      timestamp: new Date(curr.timestamp).toISOString(),
      totals: curr,
      deltas
    });

    const line = [
      new Date(curr.timestamp).toISOString(),
      curr.signals,
      curr.executions,
      curr.failures,
      curr.pnl,
      deltas.signals,
      deltas.executions,
      deltas.failures,
      deltas.pnl
    ].join(',') + '\n';

    await fs.appendFile(SUMMARY_FILE, line, 'utf8');
  }
}

