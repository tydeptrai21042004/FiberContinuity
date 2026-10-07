# FiberContinuity

> **v0.3.1 reviewer-ready demo** — production-style recovery console, deterministic fail-closed scenario lab, target race protection, and machine-readable evidence export. The deployed demo remains intentionally adapter-backed and does not claim production-fund safety without supported upstream recovery hooks.

Reviewer walkthrough: [`docs/FUNDING_REVIEW.md`](docs/FUNDING_REVIEW.md).


**FiberContinuity** is a web-first reference implementation for safe browser-session backup, restore preflight, recovery stabilization, and post-restore verification for self-custodial Fiber applications.

It deliberately does **not** invent a second channel-recovery protocol or manipulate undocumented Fiber database keys. The continuity engine treats the native Fiber backup as opaque and requires a reviewed adapter/native recovery hook for the actual runtime.

## What v0.3.1 hardens

The v0.3.1 archive and restore flow addresses the main safety gaps in the first prototype:

- the Fiber snapshot and native backup are encrypted **together** inside AES-256-GCM;
- node/channel/payment/invoice metadata is no longer exposed in the public archive header;
- security-relevant public header fields are bound as AES-GCM additional authenticated data (AAD);
- legacy v1 archives are rejected because their preflight metadata was not authenticated;
- unknown/`review` version pairs now fail closed before mutation;
- a different live target, or potentially newer same-identity state, is not overwritten automatically;
- backup creation prefers an adapter-defined atomic checkpoint and otherwise detects observable state changes during export;
- verification compares channel state/peer/balances and payment/invoice status/amount when the adapter can observe them;
- unsupported payment/invoice visibility is reported as **UNKNOWN**, never a false PASS;
- restore waits for an observable stable state before issuing the health report;
- unexpected rollback-checkpoint export failures abort before mutation; only an explicit unsupported-capability signal may continue without rollback;
- native restore/restart/stabilization exceptions trigger a best-effort in-memory rollback checkpoint;
- full-visibility payment/invoice mismatches are hard verification failures;
- `FiberJsAdapter` refuses to manufacture node/channel identifiers when upstream identity fields are missing;
- malformed archive metadata/base64/record shapes are rejected before recovery; and
- browser bootstrap requires explicit secure-WebSocket Fiber bootnodes instead of inheriting TCP defaults.

## Architecture

```text
Web / PWA / extension
        │
        ▼
 FiberContinuity
        │
 ┌──────┼───────────────┐
 │      │               │
Backup  Fail-closed   Verify
 │      │ preflight      │
 └──────┼───────────────┘
        ▼
  FiberAdapter
        │
        ▼
official/native Fiber/FNN recovery integration
```

The adapter boundary is the important rule: **only the adapter knows how the supported Fiber runtime exports/restores native recovery bytes or proves that a restore target is safe**.

## Repository structure

```text
fiber-continuity/
├── .github/workflows/ci.yml
├── src/
│   ├── adapters/
│   │   ├── FiberAdapter.ts
│   │   ├── DemoFiberAdapter.ts
│   │   ├── FiberJsAdapter.ts
│   │   └── createFiberJsBrowserNode.ts
│   ├── browser/files.ts
│   ├── components/
│   ├── core/
│   │   ├── archive.ts
│   │   ├── compatibility.ts
│   │   ├── continuity.ts
│   │   ├── crypto.ts
│   │   ├── encoding.ts
│   │   ├── errors.ts
│   │   ├── types.ts
│   │   └── verify.ts
│   ├── App.tsx
│   └── main.tsx
├── tests/
├── docs/
├── evidence/runs/
├── vercel.json
└── vite.config.ts
```

## Local run

Node **24.x** is required for the current Vercel runtime and CI configuration.

```bash
npm install
npm run check
npm run build
npm run dev
```

`npm run check` runs TypeScript project checking followed by the Vitest suite.

## Demo flow

1. Inspect the deterministic Fiber-like session.
2. Use a recovery password with at least 12 characters.
3. Click **Create private v2 archive**.
4. Optionally download the `.fcr.json` archive.
5. Click **Simulate browser-state loss**.
6. Run **Preflight** and confirm network, compatibility, and target-safety checks pass.
7. Click **Restore + stabilize + verify**.
8. Confirm recovery health and export the evidence JSON if desired.

The static demo does not upload recovery payloads to a FiberContinuity backend.

## v2 archive security boundary

The public `.fcr.json` contains only a small cryptographic header and ciphertext:

```json
{
  "manifest": {
    "format": "fiber-continuity",
    "formatVersion": 2,
    "createdAt": "...",
    "payload": {
      "cipher": "AES-GCM-256",
      "kdf": "PBKDF2-SHA256",
      "iterations": 310000,
      "salt": "...",
      "iv": "...",
      "aadVersion": 1,
      "ciphertextDigest": "..."
    }
  },
  "ciphertext": "..."
}
```

The authenticated plaintext contains both:

```text
FiberSnapshot + opaque native Fiber backup bytes
```

The SHA-256 ciphertext digest is only a fast accidental-corruption check. **Authenticity comes from AES-GCM**, not from the digest.

See [`docs/SECURITY.md`](docs/SECURITY.md) and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Real Fiber integration

[`FiberJsAdapter`](src/adapters/FiberJsAdapter.ts) accepts an already-started `fiber-js` instance plus explicit native backup/restore hooks:

```ts
const adapter = new FiberJsAdapter({
  fiber,
  version: "0.9.1", // actual running version; no silent default
  network: "testnet",
  networkIdentity: "<verified-network-identity>",
  recovery: {
    exportBackup: async () => backupBytes,
    restoreBackup: async (bytes) => {
      // exact supported Fiber/FNN restore path
    },
    restartAfterRestore: async () => {
      // restart/reconnect when required by the pinned upstream integration
    }
  },
  assessRestoreTarget: async (expected, current) => {
    // Host integration must prove that destructive restore is safe when
    // FiberContinuity cannot establish that from observable state alone.
    return { status: "safe", reason: "Reviewed empty recovery profile." };
  },
  waitForRecoveryStable: async (expected, options) => {
    // Optional upstream-aware reconnect/reconciliation readiness loop.
    return recoveredSnapshot;
  }
});
```

FiberContinuity refuses to fabricate an undocumented backup RPC. If payment or invoice history is not available through the pinned integration, those verification checks are explicitly marked `UNKNOWN`.

## Browser Fiber helper

[`createFiberJsBrowserNode.ts`](src/adapters/createFiberJsBrowserNode.ts) is development-only. It uses ephemeral keys and requires explicit `/wss` bootnodes. Production applications should inject their existing reviewed Fiber/provider lifecycle instead.

## Vercel deployment

The demo is a single Vite + React site with no database or server secret. `vercel.json` includes browser-isolation and baseline security headers. See [`docs/VERCEL_DEPLOY.md`](docs/VERCEL_DEPLOY.md).

## Status

This remains a **reference implementation**. The deterministic adapter proves the application safety/state-machine behavior; it does not by itself prove real Fiber/FNN recovery. The next ecosystem milestone should be one pinned Fiber testnet backup → loss → restore → reconnect/reconcile → verify run with retained evidence.
