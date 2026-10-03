# FiberContinuity

**FiberContinuity** is a web-first reference implementation for safe browser-session backup, restore, migration preflight, and post-restore verification for self-custodial Fiber applications.

The project intentionally does **not** implement its own Fiber channel recovery protocol or rewrite Fiber storage. It sits above official/native Fiber recovery primitives and adds the product layer that a browser application needs:

1. inspect the session before backup;
2. export a native Fiber backup through an explicit adapter hook;
3. encrypt the backup client-side;
4. record recovery metadata and integrity digests;
5. block obviously incompatible restores;
6. invoke the supported native restore path;
7. inspect the recovered Fiber state; and
8. compare before/after state to produce a portable recovery-health report.

## Why this repository is Vercel-friendly

The first version is deliberately a **single Vite + React application**, not a multi-app monorepo. Vercel can deploy it as a static site with no database and no server secrets.

`vercel.json` includes the COOP/COEP headers normally required by multithreaded browser WASM integrations:

- `Cross-Origin-Opener-Policy: same-origin`
- `Cross-Origin-Embedder-Policy: require-corp`
- `Cross-Origin-Resource-Policy: same-origin`

The demo adapter is the default, so reviewers can test the entire backup → state loss → restore → verify loop without handling real keys or funds.

## Structure

```text
fiber-continuity/
├── src/
│   ├── adapters/
│   │   ├── FiberAdapter.ts
│   │   ├── DemoFiberAdapter.ts
│   │   ├── FiberJsAdapter.ts
│   │   └── createFiberJsBrowserNode.ts
│   ├── browser/
│   │   └── files.ts
│   ├── components/
│   ├── core/
│   │   ├── archive.ts
│   │   ├── compatibility.ts
│   │   ├── continuity.ts
│   │   ├── crypto.ts
│   │   ├── types.ts
│   │   └── verify.ts
│   ├── App.tsx
│   └── main.tsx
├── tests/
├── docs/
├── evidence/
├── vercel.json
└── vite.config.ts
```

## Local run

```bash
npm install
npm run dev
```

Open the URL printed by Vite.

## Tests

```bash
npm test
npm run build
```

Node 20.19+ is required.

## Deploy to Vercel

### GitHub import

1. Push this repository to GitHub.
2. Open Vercel → **Add New → Project**.
3. Import the repository.
4. Vercel should detect **Vite**.
5. Build command: `npm run build`.
6. Output directory: `dist`.
7. Deploy.

No environment variables are required for demo mode.

### Vercel CLI

```bash
npm i -g vercel
vercel
vercel --prod
```

## Demo flow

1. Inspect the deterministic Fiber-like session.
2. Enter a recovery password of at least 10 characters.
3. Create an encrypted `.fcr.json` archive.
4. Download the archive if desired.
5. Click **Simulate browser-state loss**.
6. Confirm that channels/payments disappear and the node identity becomes `LOST`.
7. Click **Restore + verify**.
8. FiberContinuity decrypts the archive, runs the adapter restore, re-inspects the session, and emits a recovery report.

## Real Fiber integration

`FiberJsAdapter` accepts an already-started `fiber-js` instance plus explicit native backup/restore hooks:

```ts
const adapter = new FiberJsAdapter({
  fiber,
  version: "0.9.1",
  network: "testnet",
  networkIdentity: "<ckb-genesis-or-deployment-id>",
  recovery: {
    exportBackup: async () => {
      // call the official/native Fiber backup integration supported by your runtime
      return backupBytes;
    },
    restoreBackup: async (bytes) => {
      // call the supported Fiber/FNN restore path
    },
    restartAfterRestore: async () => {
      // restart/reconnect the node if the upstream integration requires it
    }
  }
});
```

This is deliberate: FiberContinuity does not guess undocumented browser storage internals or fabricate a backup RPC.

## Fiber JS development helper

`createEphemeralFiberJsBrowserNode.ts` demonstrates the current official browser bootstrap pattern based on `@nervosnetwork/fiber-js` 0.9.1 and `getDefaultConfig()`.

It uses **ephemeral keys** and is therefore for development/testing only. A production wallet must provide its own reviewed credential/account lifecycle.

## Current upstream policy encoded in v0.1

The compatibility preflight explicitly blocks restoring older 0.9.x data into **Fiber v0.10.0-rc1**, because that prerelease states that upgrades from older versions are not supported yet.

This policy is intentionally conservative. Unknown version pairs are marked for review instead of being silently treated as safe.

## Security boundary

See [`docs/SECURITY.md`](docs/SECURITY.md).

Important properties of the v0.1 design:

- encryption happens in the browser;
- no plaintext backup is sent to a FiberContinuity server;
- the archive includes integrity digests;
- restore checks network identity before mutation;
- version compatibility is checked before mutation;
- post-restore verification is mandatory;
- a native Fiber restore succeeding does not automatically mean continuity is healthy.

## Status

This repository is a **reference/prototype implementation**. The default Vercel demo uses simulated data. Before real funds are used, the live adapter and native recovery hooks must be reviewed against the exact Fiber release and browser/provider environment being supported.
