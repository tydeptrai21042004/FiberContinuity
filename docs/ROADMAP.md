# Roadmap

## v0.2 — hardened reference implementation (current)

- private authenticated archive v2
- AAD-bound public header
- fail-closed version policy
- destructive-target protection including stale same-identity state
- consistent-checkpoint interface plus fallback consistency detection
- capability-aware field verification
- stable-state wait before final report
- best-effort rollback on native restore/restart exceptions
- explicit browser WSS bootnode requirement
- Vercel/CI/repository hardening

## v0.3 — pinned official Fiber testnet adapter

Prerequisite: confirm the exact supported native/browser backup and restore entry points for one stable Fiber release.

- pin one stable Fiber/FNN release and commit
- implement reviewed native backup/restore hooks
- implement explicit target-safety proof for the chosen runtime
- add upstream-aware reconnect/reconciliation readiness
- run a real CKB testnet backup → loss → restore cycle
- publish redacted retained evidence

## v0.4 — lifecycle fault lab

- tab close/reopen
- browser profile reset
- safe local-storage/IndexedDB loss simulation appropriate to the pinned runtime
- restore interruption/failure injection
- interrupted payment observation
- peer reconnect/reconciliation timing
- supported release migration tests
- repeated runs across browser engines where the upstream runtime supports them

## v0.5 — independent consumer

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
