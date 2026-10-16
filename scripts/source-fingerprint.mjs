/**
 * Exact deterministic identity of hosted recovery-critical application sources.
 * Do not hash node_modules or generated artifacts: this must match the CI
 * checkout and the Vercel build with the same tracked inputs.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const entrypoints = ['package.json', 'vite.config.ts', 'public-testnet-config.json', 'index.html'];
const directories = ['src', 'api', 'server', 'scripts'];
function walk(dir) {
  const result = [];
  for (const item of readdirSync(new URL(dir + '/', root), { withFileTypes: true })) {
    const path = dir + '/' + item.name;
    if (item.isDirectory()) result.push(...walk(path));
    else if (item.isFile() && /\.(?:ts|tsx|js|jsx|mjs|json|css|html)$/.test(item.name)) result.push(path);
  }
  return result;
}
export function sourceFingerprint() {
  const hash = createHash('sha256');
  for (const path of [...entrypoints, ...directories.flatMap(walk)].sort()) {
    hash.update(path + '\0');
    hash.update(readFileSync(new URL(path, root)));
    hash.update('\0');
  }
  return hash.digest('hex');
}
