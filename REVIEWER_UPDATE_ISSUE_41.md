# Proposed response to @jjyr (CKBuilder issue #41)

Thanks @jjyr for reviewing the demo and for the specific Fiber JS guidance. This helps narrow FiberContinuity to a realistic and testable use case.

The intended use case is **whole-node cold recovery for a self-custodial browser Fiber application after local IndexedDB state is lost or the user moves to a clean browser profile**. I do **not** currently need single-channel restoration; I agree it should remain out of scope. The UI and adapter boundary will continue to enforce complete-node restore rather than suggesting partial channel recovery is supported.

I'm implementing the flow you described against **pinned `@nervosnetwork/fiber-js` 0.9.1 on CKB Testnet**:

1. Start an isolated, disposable browser Fiber node, inspect its identity and channel state, and stop the node.
2. Fence cooperating tabs and require a stopped profile; export the **entire IndexedDB database**, including store schema and all records, twice and require matching checksums.
3. Encrypt the backup locally, then verify archive decryption and database identity before any destructive operation.
4. Restore only into an absent or verified-empty disposable profile, perform an exact cold readback, restart Fiber with the original keys/configuration, and inspect the recovered identity and zero-channel state.
5. Preserve fail-closed results for mismatched versions/networks, occupied targets, uncertain channel state, and incomplete checks.

**Current evidence, not a success claim:** GitHub's browser run has verified a real Fiber WASM Testnet startup, zero channels, and worker shutdown. It has **not yet passed** the complete export/restore/restart cycle. The most recent failure is at IndexedDB name validation before export (`COLD_STORE_HOST_NAME`); I have corrected the overly restrictive database-name check and added regression coverage. I will post a successful end-to-end evidence artifact only after the hosted run passes.

The test is deliberately **unfunded and zero-channel only**. A locally authenticated backup and successful restart must not be described as proof that funded channels are safe, particularly when peers are unavailable or have advanced beyond the checkpoint.

One upstream detail would help: **Does `await fiber.stop()` in Fiber JS v0.9.1 guarantee that all IndexedDB worker transactions have completed, or is there an additional acknowledgement/flush barrier I should wait for before export?** If there is no documented barrier, I will keep this as an experimental best-effort cold checkpoint, not a funded-channel recovery capability.

Thanks again — I'll keep issue #41 updated with the reproducible Testnet results and unresolved limitations.

---

# Implementation and review status (internal; not part of the comment)

| Milestone | Status | Evidence rule |
| --- | --- | --- |
| Demonstrate deterministic simulation and unsafe scenario blocking | Implemented in reference demo | Unit/scenario tests |
| Start real Fiber JS v0.9.1 WASM and verify Testnet | Observed in past GitHub browser evidence | Real-node CI flags |
| Stop an isolated zero-channel node | Observed in past GitHub browser evidence | Real-node CI flags |
| Cold whole-IDB export and authenticated archive | **Not yet proven in hosted browser** | `encryptedColdBackup=true` and `archiveRoundtrip=true` |
| Cold restore to a clean target with exact readback | **Not yet proven** | `wholeProfileRestored=true` |
| Same-key/configuration restart and zero-channel inspection | **Not yet proven** | `zeroChannelRestartVerified=true` |
| Funded-channel recovery | **Explicitly unsupported** | `fundedChannelRecoveryVerified=false` |

Before claiming the complete disposable milestone, require a successful `npm run check && npm run build && npm run test:hosted-api` and `npm run test:hosted-browser` on a matching deployed source fingerprint. Attach the redacted GitHub Actions evidence file. A passing zero-channel test **does not prove channel safety**.

## Applying this patch

The change in `src/adapters/IndexedDbColdStore.ts` replaces a filesystem-character whitelist with a bounded printable-ASCII IndexedDB-name check. It does **not** modify the destructive restore gate, profile ownership gate, the Fiber 0.9.1 schema contract, archive cryptography, or the requirement for two identical stopped-state snapshots.
