import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const exchangeSchema = z.object({
  name: z.string(),
  restBaseUrl: z.string().url(),
  wsUrl: z.string().url(),
  apiKey: z.string().optional().default(''),
  apiSecret: z.string().optional().default(''),
  passphrase: z.string().optional(),
  makerFeeBps: z.number().nonnegative(),
  takerFeeBps: z.number().nonnegative(),
  minNotional: z.number().positive(),
  maxPositionNotional: z.number().positive(),
  targetLatencyMs: z.number().nonnegative()
});

const configSchema = z.object({
  env: z.enum(['development', 'production', 'test']).default('development'),
  pairs: z.array(z.string()),
  slippageBps: z.number().nonnegative(),
  minNetSpreadBps: z.number().nonnegative(),
  maxConcurrentSignals: z.number().int().positive(),
  dryRun: z.boolean().default(false),
  dryRunStartBalance: z.number().nonnegative().default(2_000),
  dryRunMaxSlippageBps: z.number().nonnegative().default(10),
  dryRunFailureChancePct: z.number().min(0).max(100).default(5),
  exchanges: z.object({
    exchangeA: exchangeSchema,
    exchangeB: exchangeSchema
  })
});

const rawConfig = {
  env: (process.env.NODE_ENV as 'development' | 'production' | 'test') ?? 'development',
  pairs: (process.env.PAIRS ?? 'BTCUSDT,ETHUSDT').split(',').map((p) => p.trim()),
  slippageBps: Number(process.env.SLIPPAGE_BPS ?? 5),
  minNetSpreadBps: Number(process.env.MIN_NET_SPREAD_BPS ?? 15),
  maxConcurrentSignals: Number(process.env.MAX_CONCURRENT_SIGNALS ?? 3),
  dryRun: String(process.env.DRY_RUN ?? 'false').toLowerCase() === 'true',
  dryRunStartBalance: Number(process.env.DRY_RUN_START_BALANCE ?? 2_000),
  dryRunMaxSlippageBps: Number(process.env.DRY_RUN_MAX_SLIPPAGE_BPS ?? 10),
  dryRunFailureChancePct: Number(process.env.DRY_RUN_FAILURE_PCT ?? 5),
  exchanges: {
    exchangeA: {
      name: process.env.EXCHANGE_A_NAME ?? 'ExchangeA',
      restBaseUrl: process.env.EXCHANGE_A_REST_URL ?? 'https://api.exchangea.example',
      wsUrl: process.env.EXCHANGE_A_WS_URL ?? 'wss://stream.exchangea.example/market',
      apiKey: process.env.EXCHANGE_A_API_KEY,
      apiSecret: process.env.EXCHANGE_A_API_SECRET,
      passphrase: process.env.EXCHANGE_A_PASSPHRASE,
      makerFeeBps: Number(process.env.EXCHANGE_A_MAKER_FEE_BPS ?? 4),
      takerFeeBps: Number(process.env.EXCHANGE_A_TAKER_FEE_BPS ?? 6),
      minNotional: Number(process.env.EXCHANGE_A_MIN_NOTIONAL ?? 10),
      maxPositionNotional: Number(process.env.EXCHANGE_A_MAX_POSITION ?? 100_000),
      targetLatencyMs: Number(process.env.EXCHANGE_A_LATENCY_MS ?? 200)
    },
    exchangeB: {
      name: process.env.EXCHANGE_B_NAME ?? 'ExchangeB',
      restBaseUrl: process.env.EXCHANGE_B_REST_URL ?? 'https://api.exchangeb.example',
      wsUrl: process.env.EXCHANGE_B_WS_URL ?? 'wss://stream.exchangeb.example/market',
      apiKey: process.env.EXCHANGE_B_API_KEY,
      apiSecret: process.env.EXCHANGE_B_API_SECRET,
      passphrase: process.env.EXCHANGE_B_PASSPHRASE,
      makerFeeBps: Number(process.env.EXCHANGE_B_MAKER_FEE_BPS ?? 5),
      takerFeeBps: Number(process.env.EXCHANGE_B_TAKER_FEE_BPS ?? 7),
      minNotional: Number(process.env.EXCHANGE_B_MIN_NOTIONAL ?? 10),
      maxPositionNotional: Number(process.env.EXCHANGE_B_MAX_POSITION ?? 100_000),
      targetLatencyMs: Number(process.env.EXCHANGE_B_LATENCY_MS ?? 220)
    }
  }
};

const parsed = configSchema.safeParse(rawConfig);

if (!parsed.success) {
  console.error('Invalid configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Configuration validation failed');
}

export type AppConfig = z.infer<typeof configSchema>;
export type ExchangeConfig = AppConfig['exchanges']['exchangeA'];
export const config: AppConfig = parsed.data;

