# Roadmap

## v0.1 — deployable recovery reference

- Vercel-safe static web app
- deterministic demo Fiber adapter
- client-side encrypted recovery archive
- integrity validation
- network identity preflight
- conservative version policy
- post-restore health verification
- reproducible tests and evidence export

## v0.2 — official Fiber testnet adapter

Prerequisite: confirm the exact supported browser/native backup and restore entry points with Fiber maintainers.

- pin one stable Fiber release
- integrate official native backup hook
- integrate official restore/restart flow
- test against CKB Testnet
- publish retained recovery evidence

## v0.3 — browser lifecycle fault lab

- tab close/reopen
- browser profile reset
- IndexedDB loss simulation where safe
- interrupted payment observation
- reconnect/reconciliation timing
- supported Fiber release migration

## v0.4 — independent consumer

Integrate FiberContinuity into one independently maintained Fiber web app/provider. The goal is to prove the project removes duplicated lifecycle/recovery code outside its own demo.

## Explicitly out of scope

- new payment protocol
- new channel-state recovery protocol
- Hosted LSP implementation
- liquidity management
- generic wallet extension
- cloud custody
- social recovery
- CellFlow/EventMesh functionality
