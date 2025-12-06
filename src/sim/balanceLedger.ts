export class BalanceLedger {
  private readonly balances = new Map<string, number>();

  constructor(
    exchanges: string[],
    private readonly initialBalance: number
  ) {
    exchanges.forEach((exchange) => {
      this.balances.set(exchange, initialBalance);
    });
  }

  getBalance(exchange: string): number {
    return this.balances.get(exchange) ?? 0;
  }

  canDebit(exchange: string, amount: number): boolean {
    return this.getBalance(exchange) >= amount;
  }

  applyTrade(
    buyExchange: string,
    sellExchange: string,
    buyNotional: number,
    sellNotional: number
  ): void {
    this.debit(buyExchange, buyNotional);
    this.credit(sellExchange, sellNotional);
  }

  snapshot(): Record<string, number> {
    return Object.fromEntries(this.balances.entries());
  }

  private debit(exchange: string, amount: number): void {
    this.balances.set(exchange, this.getBalance(exchange) - amount);
  }

  private credit(exchange: string, amount: number): void {
    this.balances.set(exchange, this.getBalance(exchange) + amount);
  }

  reset(): void {
    for (const key of this.balances.keys()) {
      this.balances.set(key, this.initialBalance);
    }
  }
}

