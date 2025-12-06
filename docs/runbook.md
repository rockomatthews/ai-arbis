# AI Arbitrage Bot Runbook

## Prerequisites
- Node.js 20+
- Funded accounts and API keys for Exchange A and Exchange B
- `.env` populated from `.env.example`

## Install & Build
```bash
npm install
npm run build
```

## Live Trading
```bash
npm run dev   # hot reload / development
npm start     # runs compiled JS from dist
```

The bot boots both exchange connectors, streams market data over websockets, emits arbitrage signals, and executes both legs when net spread thresholds are met. Logs are JSON for easy ingestion into ELK or Loki.

### Dry-Run / Simulation
- Set `PAIRS` to every symbol you want to simulate (ensure each exists on both exchanges) and `DRY_RUN=true` plus bankroll/variance knobs (`DRY_RUN_START_BALANCE`, `DRY_RUN_MAX_SLIPPAGE_BPS`, `DRY_RUN_FAILURE_PCT`) in `.env`.
- Start the bot (`node dist/index.js`) and let it run; every trade debits/credits an in-memory balance per exchange and introduces random slippage/failure so PnL can go negative.
- Stop the bot and run `REPORT_INITIAL_BALANCE=2000 npm run report` to summarize trades and ending balances (change the seed value to match your bankroll assumptions).

### Runtime Checks
- `metrics` logs every 10s summarizing signals, fills, failures, and cumulative PnL.
- SQLite ledger stored at `data/trades.sqlite`.
- Circuit breaker pauses execution for 5s after 3 consecutive failures.

## Paper / Backtest Mode
1. Capture order book snapshots (array of `OrderBookSnapshot` objects) into a JSON file.
2. In a script, instantiate `PaperTrader` with the shared `MarketDataRouter` and call `replayFromFile(path, speed)`.
3. Strategy + execution logic consumes the replayed snapshots, letting you tune thresholds without risking capital.

## Safety & Operations
- Keep sufficient balances on both venues; monitor withdrawal queues.
- Update fee schedules and latency assumptions in `src/config.ts` as exchanges change rates.
- Review trade logs daily for anomalies or missed hedges.
- Rotate API keys per exchange policies; store secrets outside source control.
- Confirm with legal counsel that your deployment complies with regional trading regulations, KYC/AML, and market-abuse rules.

