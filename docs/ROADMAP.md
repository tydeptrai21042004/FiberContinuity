# Roadmap

## v0.3 — reviewer-ready hardened reference implementation (current)

- private authenticated archive v2
- AAD-bound public header
- strict runtime archive/base64/record validation and browser-oriented size guardrails
- fail-closed semantic-version policy
- destructive-target protection including stale same-identity state and incomplete-visibility empty targets
- consistent-checkpoint interface plus fallback consistency detection
- rollback checkpoint failures abort before mutation unless backup is explicitly unsupported
- rollback attempt on native restore, restart, or stabilization exceptions
- capability-aware field verification with full-coverage payment/invoice mismatches treated as hard failures
- strict real node/channel identity requirements in `FiberJsAdapter`
- explicit browser WSS bootnode requirement
- Node 24 CI/runtime pins and repository hardening

## v0.4 — pinned official Fiber testnet adapter

Prerequisite: confirm the exact supported native/browser backup and restore entry points for one stable Fiber release.

- pin one stable Fiber/FNN release and commit
- implement reviewed native backup/restore hooks
- implement explicit target-safety proof for the chosen runtime
- add upstream-aware reconnect/reconciliation readiness
- run a real CKB testnet backup → loss → restore cycle
- publish redacted retained evidence

## v0.5 — lifecycle fault lab

- tab close/reopen
- browser profile reset
- safe local-storage/IndexedDB loss simulation appropriate to the pinned runtime
- restore interruption/failure injection
- interrupted payment observation
- peer reconnect/reconciliation timing
- supported release migration tests
- repeated runs across browser engines where the upstream runtime supports them

## v0.6 — independent consumer

Integrate FiberContinuity into one independently maintained Fiber web app/provider to prove that the adapter/workflow removes duplicated lifecycle code outside its own demo.

## Explicitly out of scope

- a new payment protocol
- a new channel-state recovery protocol
- hosted LSP implementation
- liquidity management
- generic wallet extension
- cloud custody
- social recovery
- direct manipulation of undocumented Fiber storage internals
