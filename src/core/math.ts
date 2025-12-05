import { OrderBookLevel } from './types.js';

export const bpsToDecimal = (bps: number): number => bps / 10_000;

export const decimalToBps = (decimal: number): number => decimal * 10_000;

export const topOfBookSpread = (
  bids: OrderBookLevel[],
  asks: OrderBookLevel[]
): number | null => {
  if (!bids.length || !asks.length) {
    return null;
  }
  return bids[0].price - asks[0].price;
};

export const effectivePrice = (
  levels: OrderBookLevel[],
  desiredSize: number
): number | null => {
  let remaining = desiredSize;
  let notional = 0;

  for (const level of levels) {
    const size = Math.min(remaining, level.size);
    notional += size * level.price;
    remaining -= size;

    if (remaining <= 0) {
      break;
    }
  }

  if (remaining > 0) {
    return null;
  }

  return notional / desiredSize;
};

export const netSpreadBps = ({
  buyPrice,
  sellPrice,
  buyFeeBps,
  sellFeeBps,
  slippageBps
}: {
  buyPrice: number;
  sellPrice: number;
  buyFeeBps: number;
  sellFeeBps: number;
  slippageBps: number;
}): number => {
  const gross = (sellPrice - buyPrice) / sellPrice;
  const netDecimal =
    gross - bpsToDecimal(buyFeeBps + sellFeeBps + 2 * slippageBps);

  return decimalToBps(netDecimal);
};

