export type ExchangeSide = 'buy' | 'sell';

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBookSnapshot {
  exchange: string;
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  lastUpdateId: number;
  receivedAt: number;
}

export interface BalanceSummary {
  exchange: string;
  asset: string;
  free: number;
  locked: number;
  borrowed?: number;
  timestamp: number;
}

export interface Opportunity {
  id: string;
  symbol: string;
  legBuyExchange: string;
  legSellExchange: string;
  quantity: number;
  buyPrice: number;
  sellPrice: number;
  grossSpreadBps: number;
  netSpreadBps: number;
  expiry: number;
}

export interface ExecutionSignal {
  opportunity: Opportunity;
  maxSlippageBps: number;
  createdAt: number;
}

export interface ExecutionReport {
  opportunityId: string;
  success: boolean;
  message?: string;
  filledSize?: number;
  pnlUsd?: number;
  timestamp: number;
}

export interface OrderRequest {
  symbol: string;
  side: ExchangeSide;
  quantity: number;
  price: number;
  type: 'limit' | 'market';
}

export interface OrderResult {
  orderId: string;
  filledQty: number;
  avgPrice: number;
  status: 'filled' | 'partial' | 'cancelled' | 'rejected';
  timestamp: number;
}

