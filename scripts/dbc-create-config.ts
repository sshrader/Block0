/**
 * One-time setup: creates the Block0 bonding-curve config on Meteora.
 * Every coin launched in the app is a pool made from this config, so these numbers set your fees and curve shape.
 *
 *   npm run dbc-config            build it and send it (uses .devnet-keypair.json as the partner wallet)
 *   npm run dbc-config -- --check build and print the settings without sending anything
 *
 * Settings come from .env (all optional). Market caps are in SOL, not dollars.
 *   DBC_INITIAL_MC=30     market cap when a coin starts
 *   DBC_MIGRATION_MC=300  market cap at which the curve is full and the coin moves to a DEX
 *   DBC_FEE_BPS=100       normal trading fee in basis points (100 = 1%). Meteora's minimum is 25. This is the fee after the anti-snipe window.
 *
 * Anti-snipe (Meteora fee scheduler). The fee starts high when the pool opens and decays to DBC_FEE_BPS. The creator's buy in the
 * pool-creation transaction pays the minimum fee (enableFirstSwapWithMinFee), so only other early buyers pay the high fee.
 *   SNIPE_MODE=exponential     'exponential' (drops fastest first) or 'linear'
 *   SNIPE_START_BPS=5000       fee in the first slots (5000 = 50%). Set equal to DBC_FEE_BPS to turn anti-snipe off
 *   SNIPE_PERIODS=30           number of steps the fee drops in
 *   SNIPE_DURATION_SLOTS=150   length of the whole schedule in slots (about 0.4 s each, so 150 is about one minute)
 *   DBC_FEE_CLAIMER=<address>  wallet that can claim your fees (use a hardware wallet or multisig on mainnet). Default: the key-file wallet
 *   DBC_CREATOR_FEE_PCT=0 share of your fees (after Meteora's 20% cut) that goes to the coin's creator, 0-100
 */
import 'dotenv/config';
import { Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { connect, feeClaimerFor, loadPartner, requireMainnetConfirm } from './common';
import { checkSnipeParams, pct, readSnipeParams, schedulePoints } from '../src/lib/antisnipe';
import { NATIVE_MINT } from '@solana/spl-token';
import {
  ActivationType,
  BaseFeeMode,
  CollectFeeMode,
  DammV2DynamicFeeMode,
  DynamicBondingCurveClient,
  MigratedCollectFeeMode,
  MigrationFeeOption,
  MigrationOption,
  TokenAuthorityOption,
  TokenDecimal,
  TokenType,
  buildCurveWithMarketCap,
} from '@meteora-ag/dynamic-bonding-curve-sdk';

const checkOnly = process.argv.includes('--check');
const num = (name: string, fallback: number) => (process.env[name] ? Number(process.env[name]) : fallback);

const initialMC = num('DBC_INITIAL_MC', 30);
const migrationMC = num('DBC_MIGRATION_MC', 300);
const feeBps = num('DBC_FEE_BPS', 100);
const creatorFeePct = num('DBC_CREATOR_FEE_PCT', 0);

// The anti-snipe schedule ends at the normal fee, so DBC_FEE_BPS is the final fee.
const snipe = { ...readSnipeParams((n) => process.env[n]), endBps: feeBps };
checkSnipeParams(snipe);
const snipeOn = snipe.startBps > snipe.endBps;

if (!(initialMC > 0) || !(migrationMC > initialMC)) throw new Error('DBC_MIGRATION_MC must be larger than DBC_INITIAL_MC.');
if (feeBps < 25) throw new Error('DBC_FEE_BPS must be at least 25 (Meteora minimum).');

const curve = buildCurveWithMarketCap({
  token: {
    tokenType: TokenType.SPLToken,
    tokenBaseDecimal: TokenDecimal.SIX,
    tokenQuoteDecimal: TokenDecimal.NINE, // SOL
    tokenAuthorityOption: TokenAuthorityOption.Immutable,
    totalTokenSupply: 1_000_000_000,
    leftover: 0,
  },
  fee: {
    baseFeeParams: {
      baseFeeMode: !snipeOn ? BaseFeeMode.FeeSchedulerLinear : snipe.mode === 'linear' ? BaseFeeMode.FeeSchedulerLinear : BaseFeeMode.FeeSchedulerExponential,
      feeSchedulerParam: snipeOn
        ? { startingFeeBps: snipe.startBps, endingFeeBps: snipe.endBps, numberOfPeriod: snipe.periods, totalDuration: snipe.durationSlots }
        : { startingFeeBps: feeBps, endingFeeBps: feeBps, numberOfPeriod: 0, totalDuration: 0 },
    },
    dynamicFeeEnabled: true,
    collectFeeMode: CollectFeeMode.QuoteToken,
    creatorTradingFeePercentage: creatorFeePct,
    poolCreationFee: 0,
    enableFirstSwapWithMinFee: true,
  },
  migration: {
    migrationOption: MigrationOption.MET_DAMM_V2,
    migrationFeeOption: MigrationFeeOption.Customizable,
    migrationFee: { feePercentage: 0, creatorFeePercentage: 0 },
    migratedPoolFee: {
      collectFeeMode: MigratedCollectFeeMode.QuoteToken,
      dynamicFee: DammV2DynamicFeeMode.Enabled,
      poolFeeBps: 100,
    },
  },
  // All graduated liquidity is locked for good, so nobody (including you) can pull it from the DEX pool.
  liquidityDistribution: {
    partnerLiquidityPercentage: 0,
    partnerPermanentLockedLiquidityPercentage: 100,
    creatorLiquidityPercentage: 0,
    creatorPermanentLockedLiquidityPercentage: 0,
  },
  lockedVesting: {
    totalLockedVestingAmount: 0,
    numberOfVestingPeriod: 0,
    cliffUnlockAmount: 0,
    totalVestingDuration: 0,
    cliffDurationFromMigrationTime: 0,
  },
  // Slots, not timestamps: the fee schedule then counts in slots (about 0.4 s), fine enough for a block-zero style decay.
  activationType: ActivationType.Slot,
  initialMarketCap: initialMC,
  migrationMarketCap: migrationMC,
});

console.log('\nCurve settings');
console.log(`  starts at      ${initialMC} SOL market cap`);
console.log(`  graduates at   ${migrationMC} SOL market cap`);
console.log(`  trading fee    ${(feeBps / 100).toFixed(2)}% (Meteora keeps 20% of it, ${creatorFeePct}% of the rest goes to creators)`);
if (snipeOn) {
  console.log(`  anti-snipe     ${snipe.mode}, ${pct(snipe.startBps)} falling to ${pct(snipe.endBps)} over ${snipe.durationSlots} slots (about ${Math.round(snipe.durationSlots * 0.4)} s) in ${snipe.periods} steps`);
  console.log('                 the creator\'s buy in the launch transaction pays the minimum fee');
  console.log('                 fee by time:  ' + schedulePoints(snipe).map((p) => `${p.seconds}s ${pct(Math.round(p.bps))}`).join('  '));
} else {
  console.log('  anti-snipe     off (flat fee)');
}
// How much SOL buyers must put in before the curve is full and the coin graduates.
const fillLamports = (curve as { migrationQuoteThreshold?: { toString(): string } }).migrationQuoteThreshold;
if (fillLamports) console.log(`  to fill it     about ${(Number(fillLamports.toString()) / LAMPORTS_PER_SOL).toFixed(2)} SOL of buys (plus fees)`);
console.log('  supply         1,000,000,000 (6 decimals), plain SPL token, metadata locked');
console.log('  after graduating: liquidity moves to a DAMM v2 pool and is locked permanently');

if (checkOnly) {
  console.log('\n--check: nothing was sent.');
  process.exit(0);
}

const partner = loadPartner();
const { connection, mainnet } = await connect();
if (mainnet) {
  console.log('\nMAINNET: these numbers are permanent. Fees, curve and graduation size cannot be edited after this.');
}

const balance = await connection.getBalance(partner.publicKey);
console.log(`\nPartner wallet ${partner.publicKey.toBase58()}  (${(balance / LAMPORTS_PER_SOL).toFixed(3)} SOL)`);
if (balance < 0.05 * LAMPORTS_PER_SOL) throw new Error('Fund this wallet with at least 0.05 SOL first (devnet: faucet.solana.com).');

const claimer = feeClaimerFor(partner);
console.log(`Deployer wallet (pays for this, no special rights): ${partner.publicKey.toBase58()}`);
console.log(`Fee claimer (the ONLY wallet that can ever claim fees, set forever): ${claimer.toBase58()}`);
if (mainnet && claimer.equals(partner.publicKey)) {
  console.log('\nWARNING: the fee claimer is the same key-file wallet that sits on this machine. Set DBC_FEE_CLAIMER to a hardware wallet or multisig address unless you accept that risk.');
}
requireMainnetConfirm(mainnet, 'Creating the config'); // after the claimer is shown, so you see who gets the fees first
const config = Keypair.generate();
const client = new DynamicBondingCurveClient(connection, 'confirmed');
const tx = await client.partner.createConfig({
  config: config.publicKey,
  feeClaimer: claimer,
  leftoverReceiver: claimer,
  payer: partner.publicKey,
  quoteMint: NATIVE_MINT,
  ...curve,
});
const latest = await connection.getLatestBlockhash('confirmed');
tx.feePayer = partner.publicKey;
tx.recentBlockhash = latest.blockhash;
tx.sign(partner, config);
const sig = await connection.sendRawTransaction(tx.serialize());
await connection.confirmTransaction({ signature: sig, ...latest }, 'confirmed');

console.log(`\nConfig created. Transaction: ${sig}`);
console.log('\nAdd these two lines to .env, then restart `npm run dev`:\n');
console.log(`DBC_CONFIG=${config.publicKey.toBase58()}`);
console.log(`VITE_DBC_CONFIG=${config.publicKey.toBase58()}`);
console.log('\nAnd these, so the site shows the same fee schedule that is now on chain:\n');
console.log(`VITE_SNIPE_MODE=${snipe.mode}\nVITE_SNIPE_START_BPS=${snipe.startBps}\nVITE_SNIPE_END_BPS=${snipe.endBps}\nVITE_SNIPE_PERIODS=${snipe.periods}\nVITE_SNIPE_DURATION_SLOTS=${snipe.durationSlots}`);
console.log(`\nFees can only be claimed by ${claimer.toBase58()}. If that is a wallet you control in Phantom/Ledger, open https://<your site>/#/admin with it connected to claim.`);
