import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { Opportunity } from '../core/types.js';

const DATA_DIR = path.resolve('data');
const DB_PATH = path.join(DATA_DIR, 'trades.sqlite');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS trades (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    buy_exchange TEXT NOT NULL,
    sell_exchange TEXT NOT NULL,
    quantity REAL NOT NULL,
    buy_price REAL NOT NULL,
    sell_price REAL NOT NULL,
    net_spread_bps REAL NOT NULL,
    pnl REAL NOT NULL,
    created_at INTEGER NOT NULL
  )
`);

const insertStmt = db.prepare(`
  INSERT OR REPLACE INTO trades (
    id, symbol, buy_exchange, sell_exchange, quantity,
    buy_price, sell_price, net_spread_bps, pnl, created_at
  ) VALUES (
    @id, @symbol, @buyExchange, @sellExchange, @quantity,
    @buyPrice, @sellPrice, @netSpreadBps, @pnl, @createdAt
  )
`);

export const tradeStore = {
  record(opportunity: Opportunity, pnl: number): void {
    insertStmt.run({
      id: opportunity.id,
      symbol: opportunity.symbol,
      buyExchange: opportunity.legBuyExchange,
      sellExchange: opportunity.legSellExchange,
      quantity: opportunity.quantity,
      buyPrice: opportunity.buyPrice,
      sellPrice: opportunity.sellPrice,
      netSpreadBps: opportunity.netSpreadBps,
      pnl,
      createdAt: Date.now()
    });
  }
};

