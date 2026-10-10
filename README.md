> **v0.6 update (10 October 2026):** Whole-node cold IndexedDB transport and an app-owned browser storage lab have been added in response to upstream reviewer guidance. The main backup/recover UI still uses a deterministic demo, not a live Fiber checkpoint service. The real host lifecycle and peer/channel safety remain unverified. See [Cold recovery integration](docs/COLD_RECOVERY_V06.md) and [Validation status](docs/VALIDATION_V06.md).

# FiberContinuity

> **v0.5.0 safety-hardened recovery UI reference** — separate backup/recovery/evidence workflows, explicit archive authentication and target preflight, destructive-action confirmation, real restore-stage progress, and an isolated deterministic demo lab. The deployed reference remains adapter-backed and does not claim production-fund safety without supported upstream recovery hooks.

Reviewer walkthrough: [`docs/FUNDING_REVIEW.md`](docs/FUNDING_REVIEW.md).


**FiberContinuity** is a web-first reference implementation for safe browser-session backup, restore preflight, recovery stabilization, and post-restore verification for self-custodial Fiber applications.

It deliberately does **not** invent a second channel-recovery protocol or manipulate undocumented Fiber database keys. The continuity engine treats the native Fiber backup as opaque and requires a reviewed adapter/native recovery hook for the actual runtime.

## What v0.5.0 improves

The v0.3.1 archive and restore hardening remains in place, while v0.4.0 improves how those guarantees are exposed to users:
The v0.4.0 interface also separates the user jobs that were previously combined on one page:

- **Create backup** — inspect → choose/confirm recovery password → create encrypted archive → save a durable copy;
- **Recover** — load → integrity-check → authenticate → source/target comparison → SAFE preflight → explicit confirmation → restore → verify;
- **Evidence** — post-recovery health, machine-readable reports, and reviewer evidence; and
- **Demo lab** — deterministic failure scenarios isolated from the production-style recovery path.

The restore action stays disabled until the current archive is authenticated and the current target has an explicit SAFE preflight result.

### Follow-up safety patch (2026-10-08)

- Post-restore checks now fail on adapter or Fiber runtime version mismatch, rather than issuing a false `HEALTHY` result.
- Native live operation requires a browser Web Lock where running in a browser; unsupported cross-tab locking blocks the operation before native mutation. Live use still requires a **native host lease** fencing external processes.
- `FiberJsAdapter` may consume explicitly implemented **exhaustive host payment/invoice inspection hooks**, with validated record schemas, duplicate checks and deadlines. Without those hooks coverage remains `unavailable`, and verification stays `DEGRADED`/quarantined.
- The source/target comparison distinguishes expected differences and informational/unknown counts from PASS. The download button no longer claims that the browser wrote a durable saved file.
- UI clears passphrase fields after creating a backup or finishing recovery; re-importing and authenticating the on-disk archive is the recommended way to prove the saved file is recoverable.

**No production live Fiber host implementation is bundled.** The application still runs `DemoFiberAdapter`. A real provider must implement approved atomic native checkpoints, restore, native leases, host-specific safety and peer-reconciliation procedures; no browser RPC polling can substitute for these.



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

## Reliability hardening and important limitations

See [PATCH_NOTES.md](PATCH_NOTES.md) for recovery locks, operation journaling, rollback verification, incomplete-visibility quarantine, new fault-injection tests, and the exact native Fiber integration contracts required for real-funds recovery. This application continues to ship in **deterministic demo mode** only. Recovery after channel state has advanced externally remains unsafe without upstream-supported peer reconciliation. Do not treat a local snapshot match as proof of network/channel safety.

## Reviewer update — v0.7 real Fiber testnet lab

The **Real Fiber testnet** navigation entry uses actual pinned `@nervosnetwork/fiber-js@0.9.1` WASM and an independently discovered, strictly schema-checked IndexedDB database. It can create encrypted zero-channel whole-node backups, run controlled lab-only data-loss/restore/readback checks, restart using an explicitly supplied original Fiber and CKB identities and CKB signing keys, optionally connect WSS testnet peers, and export redacted evidence. The main dashboard remains a deterministic demo; the real panel is deliberately separate and opt-in.

**Important**: stock Fiber JS 0.9.1 still does **not** expose a public atomic checkpoint/flush acknowledgement. Never restore funded channel states with this experimental tool. Real testnet success is only established by executing the browser lab against reachable RPC and WSS endpoints, not by compiling the source. See [v0.7 integration and walkthrough](docs/REAL_FIBER_TESTNET_V07.md).
