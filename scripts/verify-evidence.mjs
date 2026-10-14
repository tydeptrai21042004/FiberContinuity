#!/usr/bin/env node
// No dependencies. Verifies the exact post-export SHA-256 chain algorithm.
// This is local corruption detection, NOT a signature or proof of safe Fiber channels.
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/verify-evidence.mjs fiber-real-testnet-redacted-evidence.json');
  process.exit(2);
}
try {
  const document = JSON.parse(await readFile(file, 'utf8'));
  if (document.schema !== 'fiber-continuity-testnet-evidence-v0.9') throw Error('Wrong evidence schema');
  const chain = document.evidenceChain;
  if (!chain || chain.algorithm !== 'SHA-256' || chain.domain !== 'fiber-continuity-evidence-v1' || !Array.isArray(chain.events)) throw Error('Missing integrity chain');
  let previous = '0'.repeat(64);
  for (const [i, item] of chain.events.entries()) {
    if (item.sequence !== i || item.previousHash !== previous) throw Error(`Broken chain at event ${i}`);
    const expected = createHash('sha256').update(JSON.stringify([chain.domain, i, previous, item.event])).digest('hex');
    if (item.hash !== expected) throw Error(`Invalid hash at event ${i}`);
    previous = expected;
  }
  if (chain.finalHash !== previous) throw Error('Final digest mismatch');
  console.log(`PASS — ${chain.events.length} locally hash-linked events; digest ${previous}`);
  console.log('NOT PROVEN: author authenticity, independent testnet attestation, channel/peer safety.');
  const checks = document.checks || {};
  for (const [name, value] of Object.entries(checks)) console.log(`  ${name}: ${value}`);
} catch (error) {
  console.error('FAIL —', error.message);
  process.exitCode = 1;
}
