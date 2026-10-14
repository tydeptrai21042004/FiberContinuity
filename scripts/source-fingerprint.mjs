/** Deterministic source identity for the deployed browser and the CI checkout.
 * Uses the same ordered files on both sides; no credentials or environment values.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const tracked = ["package.json", "vite.config.ts", "src/adapters/IndexedDbColdStore.ts", "src/adapters/ManagedFiberTestnetHost.ts", "src/adapters/Fiber091StorageContract.ts", "src/components/RealFiberTestnetLab.tsx", "src/core/hostedFailureCategory.ts"];
export function sourceFingerprint() {
  const hash = createHash('sha256');
  for (const path of tracked) {
    hash.update(path + '\0');
    hash.update(readFileSync(new URL('../' + path, import.meta.url)));
    hash.update('\0');
  }
  return hash.digest('hex');
}
