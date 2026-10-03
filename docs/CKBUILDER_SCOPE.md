# CKBuilder / funding scope

## Problem

Native backup/restore primitives alone do not give a browser user a safe continuity workflow. The application still has to answer: Was the archive authentic? Is this the correct network/version? Is the target safe to overwrite? Did the restored node stabilize? Which state was actually verified?

## Contribution

FiberContinuity provides a small application/infrastructure layer around supported Fiber recovery primitives:

- reusable adapter boundary;
- private authenticated portable archive;
- fail-closed compatibility/network preflight;
- destructive-target protection;
- recovery stabilization hook;
- capability-aware before/after verification;
- deterministic reviewer lab; and
- portable evidence output.

It does **not** replace FNN recovery or claim that application-level checks supersede Fiber's channel-safety semantics.

## Why the demo adapter exists

Reviewers can exercise the safety/state-machine behavior without a faucet, real keys, channels, or funds. That proves the wrapper logic, not the real upstream recovery claim.

## Strong next funding milestone

A narrow milestone should optimize for reproducible evidence rather than feature count:

1. confirm one exact upstream recovery hook with Fiber maintainers;
2. pin one stable Fiber release/commit;
3. implement an explicit target-safety policy for that runtime;
4. complete a real testnet backup → local-state loss → restore → reconnect/reconcile → verify cycle;
5. retain redacted machine-readable evidence; and
6. have one independent Fiber application reproduce the integration.

That produces a falsifiable ecosystem deliverable while keeping the project small.
