# Block0

A Solana memecoin launchpad on Meteora's Dynamic Bonding Curve (DBC) with Meteora's anti-snipe fee scheduler built in. Inspired by Pump.fun's block-zero fee: snipers pay for being first, the creator's own buy does not.

Started from an earlier launchpad (same wallet flow, launch transaction, trade box and fee tools), with its AI pets removed.

## How the anti-snipe works

Every coin is a DBC pool made from one curve config (`npm run dbc-config`). That config uses Meteora's **fee scheduler**: the trading fee is high when the pool opens and decays to the normal fee.

- **Default schedule:** exponential, 50% in the first slots, falling to 1% over 150 slots (about one minute) in 30 steps. Change it with `SNIPE_*` in `.env` before creating the config. `npm run dbc-config -- --check` prints the fee at 0, 2, 5, 10, 20, 30, 45, 60 and 90 seconds.
- **Dev buy is exempt.** The creator's buy is in the same transaction as pool creation, and `enableFirstSwapWithMinFee` makes that first swap pay the minimum fee. Anyone else buying early, from any wallet, pays the scheduled fee. The server reads the dev buy from the chain and shows it on the coin page.
- **Slot-based timing.** The config uses slot activation, so the schedule counts in slots (about 0.4 s) and not seconds.
- **The coin page shows the live fee** while the window is open (`src/components/TradeBox.tsx`), using the launch slot the server stored.
- **Permanent.** Fees, curve and schedule cannot be edited after the config is created on chain.

How this differs from Pump.fun's block0 fee: the Meteora scheduler charges everyone who trades during the window, not only wallets seen in block zero, and it cannot tell which wallets belong to the dev. The fee stays in the pool as ordinary trading fees (Meteora keeps 20%; the rest goes to the fee claimer and, if set, the creator share). There is no buyback or burn.

Meteora's older **rate limiter** (fee grows with buy size) is deprecated for new configs and is not used. Docs: https://docs.meteora.ag/core-products/dbc/fees/fee-scheduler

> **Status:** the anti-snipe settings have not been run yet, on devnet or anywhere. Create a devnet config, launch a coin with a dev buy, and buy from a second wallet inside the window to confirm the fee falls and the dev buy pays the minimum.

## Run it

Requires Node 20 or newer. Use a separate Phantom account on Devnet, with test SOL from https://faucet.solana.com.

```bash
npm install
cp .env.example .env
npm run dbc-config -- --check   # shows curve and anti-snipe settings, sends nothing
npm run dbc-config              # creates the config on chain; add the lines it prints to .env
npm run dev                     # API on :8787, site on :5173
```

## Trading on a bonding curve (Meteora)

Block0 uses Meteora's Dynamic Bonding Curve program, so there is no curve code of our own to maintain or audit. The flow:

1. **Once:** `npm run dbc-config -- --check` shows the curve settings. `npm run dbc-config` creates the config on chain with the partner wallet (`.devnet-keypair.json`) and prints `DBC_CONFIG` and `VITE_DBC_CONFIG` for `.env`.
2. **Each launch:** one transaction creates the token and its curve pool (`src/lib/dbc.ts`). The server checks that the pool exists, came from your config, and was made by the paying wallet (`server/curve.mjs`).
3. **Trading:** the coin page has a Buy/Sell box (`src/components/TradeBox.tsx`) with a quote, 1% slippage, and a progress bar to graduation.
4. **Graduation:** when the curve fills, Meteora's keeper moves the coin to a DAMM v2 pool. The Trade box then points people to a DEX, and market cap comes from DexScreener in `MARKET_MODE=live`.
5. **Market cap** for curve coins is read from the curve price (market cap in SOL times the SOL price from DexScreener; `SOL_USD_FALLBACK` is used if that lookup fails).

**Block-zero dev buy.** With the curve on, the Launch form has an optional dev buy (in SOL). The creator's buy is built into the same transaction as pool creation (`createPoolWithFirstBuy`), so nobody can buy before the creator. The server reads the tokens the creator holds straight from that transaction and shows "Block-zero dev buy: N tokens (x% of supply)" on the coin page, so it is always disclosed and cannot be faked from the browser. The cap is `VITE_MAX_DEV_BUY_SOL` (default 5). Test it on devnet before using it on mainnet.

With `VITE_DBC_CONFIG` empty the app keeps the older plain-token launch (no trading).

### If you see `429 Too many requests`

The free public devnet RPC rate-limits heavily. The app caches and looks up pools directly to stay under it, but a free key from Helius (or similar) is much more reliable. Put the same URL in `VITE_RPC_URL` (browser) and `SOLANA_RPC_URL` (server) in `.env`, then restart.

### Partner tools

- `npm run dbc-fees -- --check` shows trading fees waiting to be claimed; `npm run dbc-fees` claims them.
- `npm run dbc-migrate -- <mint>` graduates a full curve by hand (devnet testing). Meteora also has a manual migrator at migrator.meteora.ag.
- `npm run dbc-inspect -- <mint>` prints what the SDK returns for a pool (debugging).
- `docs/GO_LIVE.md` has the production checklist and the devnet graduation test.


## Metadata storage

- **Local mode (default).** Files go to `server/uploads/`. The flow works, but the image link is `http://localhost…`, so Phantom and explorers cannot load it and the picture will not show.
- **Pinata mode.** Create a free Pinata account, make an API key (JWT), put it in `.env` as `PINATA_JWT`. Images and metadata then go to IPFS and show up everywhere. The upload call is in `server/index.mjs` (`pinFile`). If Pinata changed its API, that function is the only place to edit.

## Files

```
server/index.mjs        API: upload, register (verifies on chain, records the dev buy and launch slot), list
server/curve.mjs        checks a pool came from our config; reads curve price and progress
server/store.mjs        JSON-file storage (swap for a real database later)
src/lib/antisnipe.ts    the anti-snipe fee schedule, shared by the config script and the site
src/lib/dbc.ts          launch transaction (with dev buy), quotes and swaps
src/components/         create form, coin card, trade box, fee schedule table, chart
src/pages/              Explore, Launch, coin page, Admin (fee claims)
scripts/dbc-create-config.ts   creates the curve config, including the fee schedule
scripts/dbc-*.ts        claim fees, graduate, inspect a pool
```

## Known limits (on purpose, for now)

- Metadata is immutable, so a typo in the name is permanent.
- The upload and register endpoints have no accounts or spam protection beyond the basic rate limit.
- JSON-file storage, no database. Rate limits live in memory.
- The site mirrors the fee schedule from `VITE_SNIPE_*` and computes the live fee itself. The chain is the source of truth; keep the two in step.
- Not audited. Do not use on mainnet without a security review and legal advice.

## Switching to testnet

Set `VITE_CLUSTER=testnet` and `SOLANA_RPC_URL=https://api.testnet.solana.com`, and switch Phantom to Solana Testnet. Devnet is the better choice for development: testnet is meant for validator testing and is less stable.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `Buffer is not defined` in the browser | `src/polyfills.ts` must be the first import in `main.tsx` |
| Phantom does not appear in the wallet list | Phantom not installed or locked in this browser profile |
| Transaction is simulated and fails in Phantom | Wrong network: Phantom must be on Devnet, and the site's RPC must match |
| Airdrop fails | The public faucet is rate limited. Use https://faucet.solana.com |
| "Unknown upload" on register | The API restarted between upload and register. Launch again |
| Register says authority not revoked | The transaction did not include the two revoke steps. It should not happen unless the code was edited |

## Market cap chart

Each coin page shows a market cap chart. `MARKET_MODE=demo` (the default) draws made-up numbers that move randomly, which is what you want on devnet. `MARKET_MODE=live` asks DexScreener for the coin's mint address and charts the real market cap. That only works for mainnet coins that trade on a DEX. DexScreener has no free history endpoint, so the server records a point every 30 seconds into `server/data/market.json`. Code: `server/market.mjs`, `src/components/MarketChart.tsx`.

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `Buffer is not defined` in the browser | `src/polyfills.ts` must be the first import in `main.tsx` |
| Phantom does not appear in the wallet list | Phantom not installed or locked in this browser profile |
| Transaction is simulated and fails in Phantom | Wrong network: Phantom must be on Devnet, and the site's RPC must match |
| Airdrop fails | The public faucet is rate limited. Use https://faucet.solana.com |
| "Unknown upload" on register | The API restarted between upload and register. Launch again |

