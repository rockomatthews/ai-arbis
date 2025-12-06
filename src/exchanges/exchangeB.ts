import WebSocket from 'ws';
import { config } from '../config.js';
import { OrderBookSnapshot } from '../core/types.js';
import { logger } from '../lib/logger.js';
import { BaseExchange } from './baseExchange.js';

const KNOWN_QUOTES = ['USDT', 'USDC', 'USD'];

const toOkxInstId = (symbol: string): string => {
  const quote = KNOWN_QUOTES.find((suffix) => symbol.endsWith(suffix));
  if (!quote) {
    throw new Error(`Unsupported OKX quote asset for symbol ${symbol}`);
  }

  const base = symbol.slice(0, -quote.length);
  return `${base}-${quote}`;
};

type OkxMessage =
  | { event: string; arg?: { instId: string } }
  | {
      arg: { channel: string; instId: string };
      data: Array<{
        asks: [string, string][];
        bids: [string, string][];
        ts: string;
      }>;
    };

export class ExchangeBConnector extends BaseExchange {
  private ws?: WebSocket;
  private reconnectTimer?: NodeJS.Timeout;

  constructor() {
    super(config.exchanges.exchangeB);
  }

  get name(): string {
    return config.exchanges.exchangeB.name;
  }

  protected override async startMarketData(): Promise<void> {
    this.connect();
  }

  protected override async stopMarketData(): Promise<void> {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      this.ws.close();
      this.ws = undefined;
    }
  }

  private connect(): void {
    this.ws = new WebSocket(this.cfg.wsUrl);

    this.ws.on('open', () => {
      logger.info('OKX WS connected');
      this.subscribe();
    });

    this.ws.on('message', (raw) => {
      try {
        this.handleMessage(raw.toString());
      } catch (error) {
        logger.warn('OKX WS parse error', { error: (error as Error).message });
      }
    });

    this.ws.on('error', (error) => {
      logger.error('OKX WS error', { error });
      this.ws?.terminate();
    });

    this.ws.on('close', () => {
      logger.warn('OKX WS closed, scheduling reconnect');
      this.scheduleReconnect();
    });
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, 2_000);
  }

  private subscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const args = this.pairs.map((symbol) => ({
      channel: 'books5',
      instId: toOkxInstId(symbol)
    }));

    this.ws.send(
      JSON.stringify({
        op: 'subscribe',
        args
      })
    );
  }

  private handleMessage(raw: string): void {
    if (raw === 'pong') {
      return;
    }

    const payload = JSON.parse(raw) as OkxMessage;

    if ('event' in payload) {
      if (payload.event === 'ping' && this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ op: 'pong' }));
      }
      return;
    }

    if (!payload?.data?.length) {
      return;
    }

    for (const book of payload.data) {
      const snapshot: OrderBookSnapshot = {
        exchange: this.name,
        symbol: this.findSymbolByInstId(payload.arg.instId),
        bids: book.bids.map(([price, size]) => ({
          price: Number(price),
          size: Number(size)
        })),
        asks: book.asks.map(([price, size]) => ({
          price: Number(price),
          size: Number(size)
        })),
        lastUpdateId: Number(book.ts),
        receivedAt: Date.now()
      };

      this.emitOrderBook(snapshot);
    }
  }

  private findSymbolByInstId(instId: string): string {
    const [base, quote] = instId.split('-');
    const symbol = `${base}${quote}`;
    if (!this.pairs.includes(symbol)) {
      // If not explicitly listed (e.g., due to lowercase), default to instId concatenation.
      return symbol;
    }
    return symbol;
  }
}

