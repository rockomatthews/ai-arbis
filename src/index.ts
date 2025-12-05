import { config } from './config.js';
import { ExchangeAConnector } from './exchanges/exchangeA.js';
import { ExchangeBConnector } from './exchanges/exchangeB.js';
import { MarketDataRouter } from './feeds/marketDataRouter.js';
import { CrossExchangeStrategy } from './strategy/crossExchange.js';
import { ExecutionEngine } from './execution/engine.js';
import { logger } from './lib/logger.js';
import { MetricsTracker } from './monitoring/metrics.js';

const router = new MarketDataRouter();
const exchangeA = new ExchangeAConnector();
const exchangeB = new ExchangeBConnector();
const metrics = new MetricsTracker();

router.registerExchange(exchangeA);
router.registerExchange(exchangeB);

const engine = new ExecutionEngine(
  {
    [exchangeA.name]: exchangeA,
    [exchangeB.name]: exchangeB
  },
  config.dryRun
);

const strategy = new CrossExchangeStrategy(router);

async function main(): Promise<void> {
  await Promise.all([
    exchangeA.start(config.pairs),
    exchangeB.start(config.pairs)
  ]);

  engine.start();
  strategy.start();
  metrics.start();

  logger.info('AI Arbitrage bot running', {
    pairs: config.pairs,
    exchanges: [exchangeA.name, exchangeB.name]
  });
}

async function shutdown(): Promise<void> {
  logger.info('Shutting down...');
  metrics.stop();
  await Promise.all([exchangeA.stop(), exchangeB.stop()]);
  process.exit(0);
}

process.on('SIGINT', () => {
  void shutdown();
});
process.on('SIGTERM', () => {
  void shutdown();
});

main().catch((error) => {
  logger.error('Fatal error', { error: error.message });
  process.exit(1);
});

