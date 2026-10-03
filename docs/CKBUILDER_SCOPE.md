# CKBuilder / funding scope

## Problem

Fiber's browser runtime can make Fiber available to web applications, and Fiber itself has native backup/restore and migration work. The remaining product question is whether an application can give a user a safe, understandable continuity path when browser-local state is lost or software changes.

## Proposed contribution

FiberContinuity is not a replacement for FNN recovery. It provides:

- a reusable adapter boundary;
- encrypted portable recovery packaging;
- compatibility/network preflight;
- deterministic before/after verification;
- a reviewer-friendly recovery lab; and
- evidence artifacts.

## Why the demo adapter exists

Grant reviewers should be able to exercise the product without trusting a faucet, opening a real channel, or risking funds. The deterministic adapter validates the application state machine first.

The actual ecosystem claim is not proven until an official Fiber testnet recovery path and at least one independent application integration are completed.

## Funding milestone design

A small first milestone should target **evidence**, not feature count:

1. confirm the upstream recovery hook with Fiber maintainers;
2. support one pinned stable Fiber release;
3. complete a real testnet backup/loss/restore cycle;
4. publish retained evidence;
5. have one external Fiber application reproduce the flow.

That keeps the request aligned with the ecosystem's preference for narrowly scoped, verifiable infrastructure work.
