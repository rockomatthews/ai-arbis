import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import dotenv from 'dotenv';
import { config } from '../config.js';

dotenv.config();

const DB_PATH = path.resolve('data', 'trades.sqlite');

if (!fs.existsSync(DB_PATH)) {
  console.error('No trade log found at', DB_PATH);
  process.exit(1);
}

const initialBalance = Number(process.env.REPORT_INITIAL_BALANCE ?? 2_000);

type TradeRow = {
  id: string;
  symbol: string;
  buyExchange: string;
  sellExchange: string;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  netSpreadBps: number;
  pnl: number;
  createdAt: number;
};

const db = new Database(DB_PATH, { readonly: true });
const rows = db
  .prepare(
    `SELECT id, symbol, buy_exchange AS buyExchange, sell_exchange AS sellExchange,
            quantity, buy_price AS buyPrice, sell_price AS sellPrice,
            net_spread_bps AS netSpreadBps, pnl, created_at AS createdAt
     FROM trades
     ORDER BY created_at ASC`
  )
  .all() as TradeRow[];

if (!rows.length) {
  console.info('No trades recorded yet.');
  process.exit(0);
}

const exchangeNames = [
  config.exchanges.exchangeA.name,
  config.exchanges.exchangeB.name
];

const balances = Object.fromEntries(
  exchangeNames.map((name) => [name, initialBalance])
) as Record<string, number>;

const stats = {
  trades: rows.length,
  pnl: 0,
  wins: 0,
  losses: 0,
  grossNotional: 0
};

const updateBalance = (exchange: string, delta: number): void => {
  if (!(exchange in balances)) {
    balances[exchange] = initialBalance;
  }
  balances[exchange] += delta;
};

rows.forEach((trade) => {
  const buyNotional = trade.quantity * trade.buyPrice;
  const sellNotional = trade.quantity * trade.sellPrice;

  updateBalance(trade.buyExchange, -buyNotional);
  updateBalance(trade.sellExchange, sellNotional);

  stats.pnl += trade.pnl;
  stats.grossNotional += buyNotional + sellNotional;

  if (trade.pnl >= 0) {
    stats.wins += 1;
  } else {
    stats.losses += 1;
  }
});

const endingBalances = Object.entries(balances).map(([exchange, balance]) => ({
  exchange,
  starting: initialBalance,
  ending: balance,
  delta: balance - initialBalance
}));

console.log('=== Dry-Run Summary ===');
console.log(`Trades: ${stats.trades}`);
console.log(
  `Wins/Losses: ${stats.wins}/${stats.losses} (${(
    (stats.wins / stats.trades) *
    100
  ).toFixed(1)}% win rate)`
);
console.log(`Net PnL: $${stats.pnl.toFixed(2)}`);
console.log(
  `Avg PnL per trade: $${(stats.pnl / stats.trades).toFixed(2)}, Avg notional per leg: $${(
    stats.grossNotional /
    (stats.trades * 2)
  ).toFixed(2)}`
);
console.log('');
console.log('Exchange Balances (assuming initial $' + initialBalance + ' each):');
endingBalances.forEach((entry) => {
  console.log(
    `- ${entry.exchange}: start $${entry.starting.toFixed(
      2
    )} -> end $${entry.ending.toFixed(2)} (${entry.delta >= 0 ? '+' : ''}${entry.delta.toFixed(
      2
    )})`
  );
});

console.log('\nUse REPORT_INITIAL_BALANCE env var to change the seed balance.');

