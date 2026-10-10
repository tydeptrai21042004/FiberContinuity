# FiberContinuity v0.6 — Cold IndexedDB Recovery

## Scope and reviewer alignment

This change responds to jjyr's feedback in CKBuilder issue #41. The recovery primitive is **whole-node database backup and restore**, not individual-channel restoration. A successful database import does **not** mean a channel is safe. This build is a testnet-focused reference integration and is **NOT authorized to restore mainnet funds**.

The public Vercel app still runs `DemoFiberAdapter` for the primary Create Backup / Recover workflow. The separate **IndexedDB lab** performs real browser database transactions on an app-owned **synthetic** database. The lab does **not** access a Fiber node, wallet or other application's origin/storage.

To operate on a genuine Fiber JS testnet database, integrate `createIndexedDbColdHooks()` into the **same origin** and lifecycle that owns the node. This repository does not ship or pretend to provide upstream quiescence or exclusive worker-fencing APIs.

## Implemented improvements

- `src/adapters/IndexedDbColdStore.ts`: complete database-schema/object-store/index/raw key/value transport, bounded export, SHA-256 logical-content checksum, strict binary/structured-clone codec, atomic multi-store write transaction and readback verification.
- The cold store accepts **only absent or empty target profiles**. It never deletes or overwrites occupied databases. It rejects stores using `autoIncrement` because the next key-generator value is not exportable through the IndexedDB API.
- `src/adapters/createIndexedDbColdHooks.ts`: typed host contract for stable identity/configuration, quiescence, stop/fencing, exclusive lease, backup resume and **isolated** post-restore startup.
- `src/core/continuity.ts`: offline target inspection + fresh stopped-target revalidation for cold integrations. Recovery failures quarantine the target without silently rolling older channel state backward. A live integration cannot produce overall `HEALTHY` solely from local record matching.
- `src/components/ColdStorageLab.tsx`: visible browser test of synthetic seed → full backup → loss → restore → full readback with downloadable redacted evidence.

## Integration contract for a real wallet host

Implement `ColdFiberHost` inside the browser origin that owns Fiber's IndexedDB. The host **must** provide all lifecycle guarantees, not only invoke a generic `stop()` method:

1. Pin `@nervosnetwork/fiber-js` to a reviewed version, initially `0.9.1`, and pin the correct database name and schema. Do **not** assume the `databasePrefix` argument is the exact IndexedDB name; inspect the implementation of the pinned build.
2. Persist the **original** Fiber identity and CKB secret key securely using the host wallet's established key management. Import/restoring a database with new random keys is not whole-node recovery. **Do not export keys in evidence.**
3. Acquire a lease that actually fences Fiber's WASM worker, all database writers and other tabs/processes. Browser Web Locks alone only coordinate cooperating clients; they do not stop uncooperative workers.
4. For backup: quiesce new writes, finish pending updates, collect a stable runtime snapshot, stop Fiber, prove all IndexedDB writers are closed, export the database and only then resume using the original persisted identity.
5. For restore: stop/fence all writers, validate target identity and network/configuration, require a **verified absent or empty database**, authenticate and validate the archive, then restore the complete database in a single multi-store write transaction and verify a fresh readback. Do not restore individual channels.
6. When the database is restored, do **not** enable outgoing payments or signing. `startRestoredForIsolatedInspection()` must guarantee isolation; throw and leave the profile quarantined if the host cannot provide isolation. Peer/chain/commitment-state safety requires separate authoritative checks.
7. Configure a host-specific `waitForRecoveryStable` adapter hook for bounded local observation; this is **not** an assertion that peer/channel safety has been proven. Do not clear a quarantined production recovery from the demonstration UI.

### Wiring into `FiberJsAdapter`

The host constructs the adapter when it has initialized a securely managed Fiber identity and reviewed lifecycle methods:

```ts
import { FiberJsAdapter } from "./src/adapters/FiberJsAdapter";
import { createIndexedDbColdHooks } from "./src/adapters/createIndexedDbColdHooks";

const { recovery, assessRestoreTarget } = createIndexedDbColdHooks(host);
const adapter = new FiberJsAdapter({
  // Must delegate to the current restarted Fiber instance, not a stale stopped worker.
  fiber: { invokeCommand: (method, args) => host.currentFiber().invokeCommand(method, args) },
  version: "0.9.1",
  network: "testnet",
  networkIdentity: host.networkIdentity,
  recoveryResourceId: host.databaseName,
  recovery,
  assessRestoreTarget,
  waitForRecoveryStable: host.waitForRecoveryStable
});
```

`host` in this example is **intentionally application supplied** and is not implemented by the stock SDK. There is no invented Fiber RPC called `export_checkpoint` or `restore_channel`. If an upstream guarantee is unavailable, the integration must reject the operation.

## Constraints and explicit fail-closed behavior

- No cross-origin IndexedDB access. Vercel's demo cannot access a wallet's IndexedDB hosted on another origin.
- No hot/live backup. No partial-channel rollback. No existing-node overwrite.
- No assumed Fiber JS `stop()` persistence/flush guarantee.
- No mainnet restoration. No guarantee that a peer will accept an old state.
- No automatic rollback after a possibly executed real recovery mutation.
- IndexedDB keys/values outside the supported structured-clone codec (e.g., Blob, File, cycles, custom classes) are rejected. This requires checking the *actual* Fiber database content before claiming full SDK compatibility.
- For version migrations, only exact-version restores are approved automatically; other combinations are blocked for manual upstream review.
- A local full-database checksum is evidence of local transport integrity only; it is not a payment or commitment-state safety certificate.

## Reproducible validation

After cloning, use `npm install`, `npm run typecheck`, `npm test`, then `npm run build`. Run the IndexedDB lab in Chromium with browser Developer Tools visible, export redacted evidence, and repeat with a second tab holding a database writer to check the conflict behavior in the host integration.

The included `docs/VALIDATION_V06.md` records checks performed on this ZIP and the tests that remain unverified. Before presenting this as a real Fiber testnet integration, attach node logs, schema fingerprints, identity checks, channel reestablishment evidence, crash/fault-injection outputs and an independent upstream safety review.
