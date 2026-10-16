> **v1.0.0 hosted automation:** The project can now monitor the user-supplied public CKB testnet address daily through Vercel Cron and run a disposable zero-channel Fiber WASM backup → simulated loss → restore → restart test through GitHub Actions. These are not proofs of funded-channel recovery or an end-to-end destructive restore. See [hosted setup](docs/HOSTED_AUTOMATION_V10.md) and [release notes](RELEASE_NOTES_V10.md).

# FiberContinuity v0.9.0 — whole-node recovery safeguards

**Latest reviewer changes:** the real testnet lab verifies the actual CKB chain and browser readiness before startup, checks downloaded archives under the same lock as simulated deletion, supports an absent-only interrupted restore retry, and exports integrity-linked redacted evidence. See [testnet setup](docs/TESTNET_SETUP_V09.md) and [v0.9 release notes](RELEASE_NOTES_V09.md). Funded-channel restoration is NOT supported.

**Scope:** opt-in Fiber JS v0.9.1 WASM **testnet, zero-channel** cold backup and restore experiments; production-style UI remains a deterministic demo. A complete IndexedDB readback and successful restart **do not establish funded-channel safety**. No mainnet funds, live channels or individual-channel restores are supported. See [Implementation of upstream reviewer feedback](docs/UPSTREAM_REVIEW_IMPLEMENTATION_V08.md) and [v0.8 validation](docs/VALIDATION_V08.md).

The reviewer identified a supported direction: stop Fiber and all writers, back up or restore **the whole IndexedDB node state**, then allow Fiber's ordinary restart/reestablishment checks without mistaking them for conclusive channel-safety attestation. The current application cannot guarantee an upstream worker-flush barrier and therefore **does not** offer funded-channel recovery. This release adds a persistent mutation/readback/restart journal, non-mutating interruption resumption, saved-archive verification before deliberate testnet-profile deletion, and separate evidence statuses.

---

> **v0.6 update (10 October 2026):** Whole-node cold IndexedDB transport and an app-owned browser storage lab have been added in response to upstream reviewer guidance. The main backup/recover UI still uses a deterministic demo, not a live Fiber checkpoint service. The real host lifecycle and peer/channel safety remain unverified. See [Cold recovery integration](docs/COLD_RECOVERY_V06.md) and [Validation status](docs/VALIDATION_V06.md).

## Original project overview

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

Node **22–24** is supported by the declared `engines` range; use a compatible Node version for Vercel and CI.

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

### CKBuilder #41: real-node evidence boundary

The reviewed recovery target is a **complete, stopped Fiber JS v0.9.1 IndexedDB
profile**. As advised by Fiber maintainers, partial channel restoration is not
supported. The real-browser lab is limited to a disposable, explicitly unfunded
Testnet profile with zero observed channels. Full database export and cold restore
remain experimental; `Fiber.stop()` does not establish a documented durable flush
barrier, and the app must not be used for funded-channel recovery.

For the reviewer-facing progress statement, actual hosted test acceptance criteria,
and the response to the upstream guidance, see
[`REVIEWER_UPDATE_ISSUE_41.md`](REVIEWER_UPDATE_ISSUE_41.md).


## CKBuilder #41: scope of real Testnet cold recovery

The practical use case is a self-custodial browser application that must restore its **entire Fiber JS node IndexedDB database** after the local browser profile is lost. This is **not** a feature for restoring one channel or rolling back an active payment channel.

The maintainer recommended stopping the Fiber node and all database writers before exporting the complete IndexedDB contents, and restoring those contents into an offline, otherwise empty target before starting Fiber again. FiberContinuity currently implements this only as a **controlled, newly created, zero-channel Testnet experiment**. A record-by-record, two-pass export is not proof of complete write flush. In `@nervosnetwork/fiber-js@0.9.1`, `await fiber.stop()` does **not** guarantee completed IndexedDB worker writes; upstream PR [#1699](https://github.com/nervosnetwork/fiber/pull/1699) addresses the underlying problem. Do not describe this experimental build as safely restoring funded nodes.

**Operator walkthrough:** start a new dedicated zero-channel Testnet node; inspect it; stop it explicitly; export and download the password-encrypted complete database archive; retain the original two Testnet keys and profile identifier outside browser storage; import the saved archive; recover into an absent/empty target while the node is stopped; verify full record readback; restart explicitly and inspect the original node identity and zero-channel state. Browser refresh can use *Prepare offline recovery*; it does not start an empty node to discover its database.

A successful CI evidence JSON proves only the stated disposable zero-channel test stages. It **does not prove** upstream flush, channel-peer reconciliation, payment/invoice completeness or production-funds safety. Browser Web Locks fence cooperating same-origin tabs; they cannot assert control of uncooperative external processes. Runtime upgrades and migration of existing databases remain blocked unless deliberately supported and acceptance-tested. See [`docs/REVIEWER_41_ACCEPTANCE.md`](docs/REVIEWER_41_ACCEPTANCE.md).
