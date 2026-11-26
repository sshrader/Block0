/**
 * DEVNET TEST WALLETS ONLY. Prints a key file's secret key in the base58 form Phantom's "Import private key" accepts,
 * so you can use the devnet deployer/fee-claimer wallet on the site's /#/admin page.
 *   npm run key-base58 -- d:/keys/block0-devnet-deployer.json
 * Never do this with a wallet that holds real money. For mainnet, use a hardware wallet or multisig instead.
 */
import fs from 'node:fs';
import path from 'node:path';

const file = process.argv[2] || process.env.PARTNER_KEYPAIR;
if (!file) throw new Error('Usage: npm run key-base58 -- <path to the devnet key file>');
const bytes = Uint8Array.from(JSON.parse(fs.readFileSync(path.resolve(file), 'utf8')));
if (bytes.length !== 64) throw new Error('That does not look like a Solana key file (expected 64 numbers).');

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
let n = 0n;
for (const b of bytes) n = n * 256n + BigInt(b);
let out = '';
while (n > 0n) {
  out = ALPHABET[Number(n % 58n)] + out;
  n /= 58n;
}
for (const b of bytes) {
  if (b !== 0) break;
  out = '1' + out;
}
console.log('\nSecret key (base58). Treat it like a password, devnet test wallet only:\n');
console.log(out);
