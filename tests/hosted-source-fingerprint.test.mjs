import test from 'node:test';
import assert from 'node:assert/strict';
import { sourceFingerprint } from '../scripts/source-fingerprint.mjs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

test('source fingerprint is stable and has a SHA-256 digest', () => {
  assert.match(sourceFingerprint(), /^[a-f0-9]{64}$/);
  assert.equal(sourceFingerprint(), sourceFingerprint());
});
test('source fingerprint includes exact hosted-browser export code', () => {
  const code = readFileSync(new URL('../scripts/source-fingerprint.mjs', import.meta.url), 'utf8');
  assert.match(code, /IndexedDbColdStore\.ts/);
  assert.match(code, /RealFiberTestnetLab\.tsx/);
});
