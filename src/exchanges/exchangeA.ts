import WebSocket from 'ws';
import { config } from '../config.js';
import { OrderBookSnapshot } from '../core/types.js';
import { logger } from '../lib/logger.js';
import { BaseExchange } from './baseExchange.js';

type BinanceDepthMessage = {
  stream?: string;
  data: {
    E: number;
    s: string;
    b: [string, string][];
    a: [string, string][];
    u: number;
  };
};

export class ExchangeAConnector extends BaseExchange {
  private ws?: WebSocket;
  private reconnectTimer?: NodeJS.Timeout;

  constructor() {
    super(config.exchanges.exchangeA);
  }

  get name(): string {
    return config.exchanges.exchangeA.name;
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
    if (!this.pairs.length) {
      return;
    }

    const streams = this.pairs
      .map((symbol) => `${symbol.toLowerCase()}@depth20`)
      .join('/');

    const wantsCombined = this.cfg.wsUrl.includes('/stream');
    const needsCombined = this.pairs.length > 1;
    const usingCombined = wantsCombined || needsCombined;

    const parsed = new URL(this.cfg.wsUrl);
    const hostBase = `${parsed.protocol}//${parsed.host}`;
    const singlePath = parsed.pathname.replace(/\/$/, '') || '/ws';
    const combinedPath = '/stream';

    if (needsCombined && !wantsCombined) {
      logger.warn('Switching to BinanceUS combined stream endpoint', {
        from: this.cfg.wsUrl,
        to: `${hostBase}${combinedPath}`
      });
    }

    const singleBase = `${hostBase}${singlePath}`;
    const combinedBase = `${hostBase}${combinedPath}`;
    const url = usingCombined
      ? `${combinedBase}?streams=${streams}`
      : `${singleBase}/${this.pairs[0].toLowerCase()}@depth20`;

    logger.info('BinanceUS WS opening', { url, usingCombined, streams });
    this.ws = new WebSocket(url);

    this.ws.on('open', () => {
      logger.info('BinanceUS WS connected', { url, streams });
      if (!usingCombined) {
        this.subscribe();
      }
    });

    this.ws.on('message', (raw) => {
      try {
        this.handleMessage(raw.toString());
      } catch (error) {
        logger.warn('BinanceUS WS parse error', {
          error: (error as Error).message
        });
      }
    });

    this.ws.on('error', (error) => {
      logger.error('BinanceUS WS error', { error: error.message });
      this.ws?.terminate();
    });

    this.ws.on('close', (code, reason) => {
      logger.warn('BinanceUS WS closed, scheduling reconnect', {
        code,
        reason: reason.toString()
      });
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

  private handleMessage(raw: string): void {
    const payload = JSON.parse(raw) as BinanceDepthMessage;
    if (!payload?.data?.s) {
      return;
    }

    const snapshot: OrderBookSnapshot = {
      exchange: this.name,
      symbol: payload.data.s,
      bids: payload.data.b.map(([price, size]) => ({
        price: Number(price),
        size: Number(size)
      })),
      asks: payload.data.a.map(([price, size]) => ({
        price: Number(price),
        size: Number(size)
      })),
      lastUpdateId: payload.data.u,
      receivedAt: Date.now()
    };

    this.emitOrderBook(snapshot);
  }

  private subscribe(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }

    const params = this.pairs.map((symbol) => `${symbol.toLowerCase()}@depth20`);

    this.ws.send(
      JSON.stringify({
        method: 'SUBSCRIBE',
        params,
        id: Date.now()
      })
    );

    logger.info('BinanceUS WS subscribed', { params });
  }
}

