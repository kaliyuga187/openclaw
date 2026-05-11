---
name: carbium-swap
description: Execute Solana DEX swaps via the Carbium aggregator API. Use when a build needs to quote and submit on-chain swaps (e.g. SOL→USDC) using @solana/web3.js VersionedTransaction signing. Covers the quote-with-tx endpoint, slippage_bps, user_account flow, and confirmation.
metadata:
  {
    "openclaw":
      {
        "emoji": "🌀",
        "homepage": "https://carbium.io",
        "requires": { "env": ["CARBIUM_API_KEY", "CARBIUM_RPC_KEY"] },
      },
  }
---

# Carbium swap

Programmatic Solana DEX swaps through the Carbium aggregator. Carbium returns a prebuilt `VersionedTransaction` in the quote response, so callers only sign and submit — they do not build instructions manually.

## When to use

- A build needs to quote and execute a Solana swap (SOL ↔ USDC, SPL ↔ SPL).
- The caller already holds the user's `Keypair` (server-side wallet) or has a signing callback (browser wallet adapter).
- You want aggregator routing rather than hard-coding a single AMM (Jupiter/Raydium/Orca).

Skip this skill for Polygon/EVM swaps — Carbium is Solana-only.

## Env

| Var               | Purpose                                              |
| ----------------- | ---------------------------------------------------- |
| `CARBIUM_API_KEY` | Auth header for `https://api.carbium.io/v1/*`.       |
| `CARBIUM_RPC_KEY` | Solana RPC endpoint used for `Connection` + submit.  |

## Canonical pattern

```ts
import {
  Connection,
  Keypair,
  VersionedTransaction,
} from "@solana/web3.js";

const SOL_MINT = "So11111111111111111111111111111111111111112";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const connection = new Connection(process.env.CARBIUM_RPC_KEY!, "confirmed");

async function getQuoteWithTx(params: {
  inputMint: string;
  outputMint: string;
  amount: number; // base units of inputMint
  slippageBps: number; // 100 = 1%
  userAccount: string; // pubkey; required to receive a prebuilt `txn`
}) {
  const res = await fetch("https://api.carbium.io/v1/quote-with-tx", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${process.env.CARBIUM_API_KEY}`,
    },
    body: JSON.stringify({
      input_mint: params.inputMint,
      output_mint: params.outputMint,
      amount: params.amount,
      slippage_bps: params.slippageBps,
      user_account: params.userAccount,
    }),
  });
  if (!res.ok) throw new Error(`Carbium quote failed: ${res.status}`);
  return res.json() as Promise<{ txn: string; out_amount: number }>;
}

async function executeSwap(signer: Keypair, quote: { txn: string }) {
  const tx = VersionedTransaction.deserialize(Buffer.from(quote.txn, "base64"));
  tx.sign([signer]);
  const sig = await connection.sendRawTransaction(tx.serialize(), {
    maxRetries: 3,
    skipPreflight: false,
  });
  await connection.confirmTransaction(sig, "confirmed");
  return sig;
}

// Usage: 0.1 SOL → USDC, 1% slippage
const quote = await getQuoteWithTx({
  inputMint: SOL_MINT,
  outputMint: USDC_MINT,
  amount: 100_000_000,
  slippageBps: 100,
  userAccount: signer.publicKey.toBase58(),
});
const sig = await executeSwap(signer, quote);
```

## Notes

- `slippage_bps` is basis points: `100 = 1%`, `50 = 0.5%`. Do not pass percent floats.
- `user_account` is required on `/quote-with-tx`. Without it the response omits the prebuilt `txn` and you'd have to build the instructions yourself.
- `VersionedTransaction.deserialize` (not legacy `Transaction.from`) — Carbium ships v0 transactions with address-lookup tables.
- `maxRetries: 3` is the recommended RPC submit retry; leave `skipPreflight: false` so bad routes fail fast.
- Confirm with commitment `"confirmed"` for UX latency; use `"finalized"` only when downstream state depends on irreversibility (rare).

## Candidate builds

- **Primary:** `MetaLaunch-AI` — already on `@solana/web3.js` with wallet adapters; slot this in when it grows a SOL→USDC user flow.
- **Skip today:** `Polyback` (Polygon/Polymarket, not Solana). Re-evaluate only if it pivots.

## References

- Carbium docs: `https://carbium.io` (full endpoint list, supported mints, rate limits).
- `@solana/web3.js` `VersionedTransaction`: <https://solana-labs.github.io/solana-web3.js/classes/VersionedTransaction.html>
