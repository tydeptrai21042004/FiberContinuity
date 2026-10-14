# FiberContinuity v0.8.0 — implementation of upstream issue #41 feedback

- Restrict recovery to complete IndexedDB node state, not individual channel records.
- Preserve the previous opt-in WASM Fiber testnet v0.9.1 **zero-channel** real-node experiment and its exact schema pinning.
- Require two consecutive complete cold database exports to agree before encryption; instability fails closed (this is not a true flush barrier).
- Add a durable, redacted journal: `mutating` → `readback-verified` → `restart-verified`. On an interrupted operation, only permit read-only comparison before restarting; never silently replay a write or erase quarantine.
- Stop() now always attempts worker termination if pre-stop inspection fails, but never releases a profile lock or permits cold operations if shutdown fails.
- Before simulation of local loss, require a saved archive to be re-imported, authenticated, identity-matched, and byte-for-byte consistent (whole-db checksum) with the stopped live source.
- Deliberate deletion is permitted only for a **newly created and directly inspected** lab-owned profile; never an archive-adopted/foreign profile.
- Reject duplicated primary keys and duplicate object-store index names prior to restore mutation.
- Prevent normal node startup while an unresolved restore journal exists. Respect legacy v0.7 markers and fail closed.
- Expose clearly separated local readback, node restart, peer and funded-channel safety statuses and export redacted evidence.
- Add fault/validation tests and detailed reviewer walkthrough / remaining upstream questions.

## Still unsupported

This is not crash-consistent or funded-channel-safe recovery. `fiber.stop()` does not document an awaited durable flush guarantee, browser Web Locks cannot constrain non-cooperating writers, and peer reconnection does not attest the safety of outdated commitments. Source-compatible runtime migration is not implemented. A genuine run against a real testnet node is required for any real runtime evidence claim.
