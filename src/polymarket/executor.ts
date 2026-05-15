import type { BotConfig, ExecutionResult, TradeSignal } from "./types.js";
import { assertLiveTradingReady } from "./config.js";

async function loadOptionalModule(name: string): Promise<Record<string, unknown> | undefined> {
  try {
    // Indirect specifier keeps TS from trying to resolve the module type.
    const spec: string = name;
    return (await import(spec)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

/**
 * Trade executor.
 *
 * Dry-run is the default. Live trading is only attempted when cfg.dryRun=false
 * AND cfg.privateKey is set AND the `@polymarket/clob-client` package resolves.
 *
 * We intentionally do NOT hard-depend on @polymarket/clob-client: the package
 * is loaded dynamically so the rest of the monorepo builds without pulling in
 * signing/keccak dependencies.
 */
export class TradeExecutor {
  constructor(private readonly cfg: BotConfig) {}

  async execute(signal: TradeSignal): Promise<ExecutionResult> {
    const sizeUsd = this.cfg.tradeSizeUsd;

    if (this.cfg.dryRun) {
      return {
        ok: true,
        dryRun: true,
        signal,
        sizeUsd,
        orderId: `dry-${signal.tokenId.slice(0, 10)}-${Date.now()}`,
      };
    }

    assertLiveTradingReady(this.cfg);

    // Dynamic imports so neither package needs to be installed for the rest of
    // the monorepo to build. Both are required for live trading.
    const clob = await loadOptionalModule("@polymarket/clob-client");
    if (!clob) {
      return {
        ok: false,
        dryRun: false,
        signal,
        sizeUsd,
        error:
          "Live trading requires '@polymarket/clob-client'. Run `pnpm add @polymarket/clob-client ethers` before disabling dry-run.",
      };
    }
    const ethers = await loadOptionalModule("ethers");
    if (!ethers) {
      return {
        ok: false,
        dryRun: false,
        signal,
        sizeUsd,
        error: "Live trading requires 'ethers' to sign orders.",
      };
    }

    try {
      const WalletCtor = (ethers as { Wallet?: new (key: string) => unknown }).Wallet;
      if (!WalletCtor) {
        return {
          ok: false,
          dryRun: false,
          signal,
          sizeUsd,
          error: "ethers.Wallet is not available; check installed version.",
        };
      }
      const wallet = new WalletCtor(this.cfg.privateKey);

      const { ClobClient, Side, OrderType } = clob as {
        ClobClient: new (
          host: string,
          chainId: number,
          signer: unknown,
          creds: unknown,
          sigType: number,
          funder?: string,
        ) => {
          createOrder(args: {
            tokenID: string;
            price: number;
            side: unknown;
            size: number;
          }): Promise<unknown>;
          postOrder(order: unknown, type: unknown): Promise<unknown>;
        };
        Side: { BUY: unknown; SELL: unknown };
        OrderType: { GTC: unknown };
      };

      const host = this.cfg.clobBaseUrl;
      const chainId = 137; // Polygon
      // Signature type 1 = proxy wallet (Polymarket default); 0 = EOA.
      const client = new ClobClient(host, chainId, wallet, undefined, 1, this.cfg.funder);

      const size = Math.max(1, Math.floor(sizeUsd / Math.max(signal.price, 0.01)));
      const order = await client.createOrder({
        tokenID: signal.tokenId,
        price: Number(signal.price.toFixed(3)),
        side: signal.side === "BUY" ? Side.BUY : Side.SELL,
        size,
      });

      const response = (await client.postOrder(order, OrderType.GTC)) as {
        orderID?: string;
        orderId?: string;
      };
      const orderId = response.orderID ?? response.orderId;
      return {
        ok: Boolean(orderId),
        dryRun: false,
        signal,
        sizeUsd,
        orderId,
        error: orderId ? undefined : JSON.stringify(response).slice(0, 200),
      };
    } catch (err) {
      return {
        ok: false,
        dryRun: false,
        signal,
        sizeUsd,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }
}
