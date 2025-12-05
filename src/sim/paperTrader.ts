import fs from 'node:fs';
import { OrderBookSnapshot } from '../core/types.js';
import { MarketDataRouter } from '../feeds/marketDataRouter.js';
import { logger } from '../lib/logger.js';

type ReplayFrame = OrderBookSnapshot & { delayMs?: number };

export class PaperTrader {
  constructor(private readonly router: MarketDataRouter) {}

  async replayFromFile(filePath: string, speed = 1): Promise<void> {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const frames = JSON.parse(raw) as ReplayFrame[];

    for (const frame of frames) {
      const waitMs = Math.max(50, (frame.delayMs ?? 200) / speed);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      this.router.publish(frame);
    }

    logger.info('Paper replay finished', {
      frames: frames.length,
      source: filePath
    });
  }
}

