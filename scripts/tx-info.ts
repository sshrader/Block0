/**
 * Explains a swap: who paid, how much SOL went in, how many tokens came out, and (if you give the launch
 * transaction too) how many seconds after launch it landed. Use it to check the anti-snipe fee.
 *   npm run tx-info -- <swap signature>
 *   npm run tx-info -- <swap signature> <launch signature>
 * Uses SOLANA_RPC_URL from .env (devnet by default).
 */
import 'dotenv/config';
import { Connection, LAMPORTS_PER_SOL, clusterApiUrl } from '@solana/web3.js';
import { SLOT_SECONDS, feeBpsAt, pct, readSnipeParams } from '../src/lib/antisnipe';

const [swapSig, launchSig] = process.argv.slice(2);
if (!swapSig) throw new Error('Usage: npm run tx-info -- <swap signature> [<launch signature>]');
const connection = new Connection(process.env.SOLANA_RPC_URL || clusterApiUrl('devnet'), 'confirmed');

const get = (sig: string) => connection.getParsedTransaction(sig, { commitment: 'confirmed', maxSupportedTransactionVersion: 0 });
const [tx, launch] = await Promise.all([get(swapSig), launchSig ? get(launchSig) : Promise.resolve(null)]);
if (!tx || !tx.meta) throw new Error('Swap transaction not found on this network. Check SOLANA_RPC_URL.');
if (tx.meta.err) console.log('NOTE: this transaction failed:', JSON.stringify(tx.meta.err));

const keys = tx.transaction.message.accountKeys;
const payer = keys[0].pubkey.toBase58();
const lamportsDelta = (tx.meta.postBalances[0] - tx.meta.preBalances[0] + tx.meta.fee) / LAMPORTS_PER_SOL; // before the network fee
const pre = tx.meta.preTokenBalances ?? [];
const post = tx.meta.postTokenBalances ?? [];
const mints = new Set(post.filter((b) => b.owner === payer).map((b) => b.mint));
const tokenRows = [...mints].map((mint) => {
  const a = Number(pre.find((b) => b.owner === payer && b.mint === mint)?.uiTokenAmount.uiAmount ?? 0);
  const b = Number(post.find((x) => x.owner === payer && x.mint === mint)?.uiTokenAmount.uiAmount ?? 0);
  return { mint, change: b - a };
});

console.log(`\nSwap ${swapSig}`);
console.log(`  wallet            ${payer}`);
console.log(`  slot              ${tx.slot}${tx.blockTime ? `  (${new Date(tx.blockTime * 1000).toISOString()})` : ''}`);
console.log(`  wallet SOL change ${lamportsDelta.toFixed(6)} SOL (before the ~0.000005 network fee; wrapped-SOL moves can hide part of it)`);
for (const r of tokenRows) console.log(`  token change      ${r.change.toLocaleString('en-US', { maximumFractionDigits: 3 })}  of ${r.mint}`);

if (launch) {
  const slots = tx.slot - launch.slot;
  const snipe = readSnipeParams((n) => process.env[`VITE_${n}`] ?? process.env[n]);
  console.log(`\nLanded ${slots} slots (~${(slots * SLOT_SECONDS).toFixed(1)} s) after the launch transaction.`);
  console.log(`Expected anti-snipe fee at that moment: about ${pct(Math.round(feeBpsAt(snipe, slots)))}  (schedule: ${pct(snipe.startBps)} down to ${pct(snipe.endBps)} over ${snipe.durationSlots} slots)`);
  console.log('If the dev buy was in the launch transaction itself, it pays the minimum fee instead.');
} else {
  console.log('\nAdd the launch signature as a second argument to see how many seconds after launch this trade landed.');
}
