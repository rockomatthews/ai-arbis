# AI Arbitrage Bot

## Environment Variables
Create a `.env` file (never commit with secrets) and populate the following keys. Replace the sample values with your real API credentials and fee data.

```env
NODE_ENV=development
PAIRS=BTCUSDT,ETHUSDT,SOLUSDT
SLIPPAGE_BPS=3              # realistic slippage buffer per leg (set to 0 only when testing)
MIN_NET_SPREAD_BPS=8        # minimum net spread after fees/slippage (raise once testing is done)
MAX_CONCURRENT_SIGNALS=3
DRY_RUN=true                 # set false when you want to hit live APIs
DRY_RUN_START_BALANCE=2000   # dry-run bankroll per exchange
DRY_RUN_MAX_SLIPPAGE_BPS=15  # random extra slippage applied in dry-run
DRY_RUN_FAILURE_PCT=5        # % chance a dry-run trade fails

# Exchange A: Binance.US
EXCHANGE_A_NAME=BinanceUS
EXCHANGE_A_REST_URL=https://api.binance.us
EXCHANGE_A_WS_URL=wss://stream.binance.us:9443/ws
EXCHANGE_A_API_KEY=your_binance_us_key
EXCHANGE_A_API_SECRET=your_binance_us_secret
EXCHANGE_A_PASSPHRASE=
EXCHANGE_A_MAKER_FEE_BPS=10          # adjust to your tier (0.10% = 10 bps)
EXCHANGE_A_TAKER_FEE_BPS=10
EXCHANGE_A_MIN_NOTIONAL=10
EXCHANGE_A_MAX_POSITION=100000
EXCHANGE_A_LATENCY_MS=250

# Exchange B: OKX
EXCHANGE_B_NAME=OKX
EXCHANGE_B_REST_URL=https://www.okx.com
EXCHANGE_B_WS_URL=wss://ws.okx.com:8443/ws/v5/public
EXCHANGE_B_API_KEY=your_okx_key
EXCHANGE_B_API_SECRET=your_okx_secret
EXCHANGE_B_PASSPHRASE=your_okx_passphrase
EXCHANGE_B_MAKER_FEE_BPS=8           # example VIP tier, update per account
EXCHANGE_B_TAKER_FEE_BPS=10
EXCHANGE_B_MIN_NOTIONAL=10
EXCHANGE_B_MAX_POSITION=100000
EXCHANGE_B_LATENCY_MS=220
```

Notes:
- Maker/taker bps should reflect your actual fee tier; 1 bp = 0.01%.
- When you finish debugging with `SLIPPAGE_BPS=0`/`MIN_NET_SPREAD_BPS=0`, reset them to realistic numbers (e.g., 2–4 bps slippage, ≥6–10 bps net spread) so the bot only fires on spreads that survive fees.
- `MIN_NOTIONAL` must satisfy each venue’s minimum order size; OKX/Binance.US publish per-market tables.
- `MAX_POSITION` caps total notional per leg; tune based on capital and risk limits.
- `LATENCY_MS` is used by the simulator; set to your typical round-trip latency for future tuning.
- Run `REPORT_INITIAL_BALANCE=2000 npm run report` after stopping the bot to see dry-run balances/PnL (defaults to $2k per exchange).
- Market data is streamed via Binance.US combined depth websockets (`@depth20@100ms`) and OKX `books5` websockets. Keep your `PAIRS` list confined to symbols supported on *both* exchanges (e.g., `BTCUSDT,ETHUSDT,SOLUSDT`). Update `EXCHANGE_*_WS_URL` only if you need to point at regional endpoints.

## Adding More Pairs or Venues
- Extend the `PAIRS` env var with comma-separated symbols; the bot automatically subscribes to live depth feeds for each.
- If you want to experiment with other exchange combinations (e.g., OKX perps vs Binance spot), clone the existing connector classes under `src/exchanges/` and wire them into `src/index.ts`.
- For high-frequency spreads, prefer websockets (already enabled) over REST polling; if you add new venues, use their streaming depth APIs when possible.

# ai-arbis
