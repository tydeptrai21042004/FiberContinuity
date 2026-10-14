# FiberContinuity v0.8 — jjyr upstream review implementation

## Scope and supported use case

**Primary use case:** an operator of a *browser-based Fiber WASM testnet profile* loses the local IndexedDB node data and wants to restore a previously saved encrypted **whole-node** backup. The current lab only permits profiles with **zero channels**. The operator provides the original Fiber identity signing secret, original CKB signing secret, exact same RPC/network configuration, profile identifier, archive and password. The system does not recover lost keys and does not restore live funds.

**Other supported demonstrations:** complete IndexedDB round-trip through a dedicated synthetic lab database; safe denial of wrong-network, wrong-node, occupied-target, stale-archive, and interrupted-write scenarios.

**Explicit non-goals:** individual-channel restoration, hot checkpointing, replacing the data of a live node, wallet migration with funded channels, peer safety attestations, backup recovery without original keys, cross-version Fiber schema upgrade, and mainnet fund recovery.

## Reviewer point → implementation

| Upstream feedback | Implementation in this release | Honest remaining limitation |
| --- | --- | --- |
| No public checkpoint API; use IndexedDB | `IndexedDbColdStore` exports all records, object stores, versions and index schemas; authenticates data through the v2 encrypted archive; restores only to empty/absent targets; performs fresh full-database checksum readback. Before encryption, two separate full cold exports must have exactly the same checksum to catch obvious residual writes; this still does not prove an upstream flush barrier. Added preflight rejection of duplicate keys and indexes. | Unsupported IDB clone types, auto-increment stores, size limits or schema changes fail closed. This is intentionally pinned to the v0.9.1 browser worker schema. |
| Stop node and writers | `ManagedFiberTestnetHost` requires a deliberate stop and a cooperating browser Web Lock before cold operations. A failed `stop()` does **not** release the active lock or authorize storage access; if final inspection fails, stop can proceed but backup remains blocked. | `Fiber.stop()` has no publicly documented durable worker-flush barrier. Web Locks cannot fence arbitrary non-cooperating writers. |
| Restore entire node, never one channel | Whole-DB transport and exact schema. Newly-created-only loss simulation is forbidden for profiles adopted from a backup after refresh. Occupied targets cannot be overwritten. | Channel-safe restoration remains disabled, even when a database checksum matches. |
| Reestablishment is not proof of safety | Readback, restart, peer availability and funded-channel safety have separate evidence statuses. Evidence never reports funded-channel health. | There is no authoritative peer/chain commitment safety verification for funded channels. |
| Supported runtime migration | v0.9.1 runtime and actual IndexedDB schema are checked; network identity hashes the pinned configuration; mismatches refuse mutation. | We do NOT attempt migration. Upstream-supported version migration must be performed and tested separately. |
| Practical operator recovery | A saved archive must be re-imported and checked against current records BEFORE deliberate loss. Durable journal records `mutating`, `readback-verified`, `restart-verified`. On interruption, the UI can perform a **read-only** full DB comparison and continue to explicit restart only when all bytes match. | If bytes do not match, no unsafe one-click rollback or quarantine bypass is offered. |

## Verification/authority levels

1. **Encrypted backup authenticated**: AES-GCM authenticates the full source snapshot and database bytes against the archive header. This only proves integrity/authenticity relative to the recovery password; it does not prove the snapshot was current when captured.
2. **Whole IndexedDB content readback matched**: the restored, stopped profile has identical deterministic logical contents to the encrypted source. This is an actual local consistency check, not an upstream durable checkpoint promise.
3. **Zero-channel node restarted**: the same persistent node identity is observed and channel enumeration succeeds with zero results. This is NOT evidence that a funded channel could be safely restored.
4. **Peers/chains/payments/invoices verified**: **not established** by the present lab. No READY/HEALTHY status is manufactured when peers are offline or coverage is unavailable.

## Demonstration to run on a real testnet browser

1. On HTTPS with COOP/COEP, start from a new `fc-testnet-*` profile and two testnet-only saved secret keys. Enter a real CKB testnet HTTPS RPC endpoint.
2. Start pinned Fiber JS v0.9.1, observe its identity and zero channel count, then **explicitly stop** the node.
3. Create the encrypted archive, **download and re-import the same saved file**, and use the same password. The imported archive is checked against the existing complete IDB before any loss simulation.
4. Confirm no funded channels, then simulate loss. Verify the profile is completely absent.
5. Restore the entire profile to the absent target. Check that the journal reaches `readback-verified` with a complete, matching checksum.
6. Restart only using the explicit restart action. Verify node identity and zero-channel enumeration. The journal reaches `restart-verified`; export the redacted evidence.
7. Repeat using another unique profile to test a real browser refresh between steps 5 and 6: import the archive, prepare the offline profile, perform read-only journal recovery, then restart. To simulate `mutating` interruption safely, stop after a successful data write before the journal advances; validate that resumption only performs a comparison (it must never replay writes).
8. Test deny paths: wrong password, wrong Fiber key, altered RPC/config, occupied target, non-matching data, wrong/unsupported storage schema, another tab holding the cooperating lock, damaged journal, and a deliberately stale saved archive.

A real testnet node, RPC and browser are required to generate honest runtime evidence. The repository does not include fabricated screenshots or a false PASS report.

## Recommended upstream integration questions

- Does Fiber WASM expose an awaited full storage flush/worker termination guarantee before DB closure? If not, could one be added?
- Can upstream provide a supported whole-node checkpoint/restart contract, including compatibility/migration metadata for Fiber JS IndexedDB?
- Which channel reestablishment, peer freshness, pending payment and on-chain conditions are **authoritative** for funded-channel safety? What should be explicitly `UNKNOWN` when peers are disconnected?

## Reviewer-facing next milestone

Demonstrate an actual **zero-channel, whole-node testnet backup → delete → restore → restart → inspect**, with raw redacted evidence and repeatable fault injection. Only after upstream supplies a reviewed flush/checkpoint contract and channel safety rules should the no-funded-channel restriction be reconsidered.
