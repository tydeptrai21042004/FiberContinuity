# Architecture

## Goal

FiberContinuity solves one narrow problem: turn an official/native Fiber backup/restore primitive into a browser-facing **continuity workflow that can be verified**.

```text
Web / PWA / extension
        │
        ▼
 FiberContinuity
        │
 ┌──────┼──────────┐
 │      │          │
Backup Restore   Verify
 │      │          │
 └──────┼──────────┘
        ▼
  FiberAdapter
        │
        ▼
official Fiber/FNN integration
```

## Core rule

**Only the adapter knows how the supported Fiber runtime exposes backup/restore.**

The rest of the code only works with normalized snapshots and opaque native backup bytes.

That keeps upstream RPC/storage changes from leaking throughout the UI and makes it possible to support:

- browser `fiber-js`;
- a remote Fiber provider;
- a browser extension provider; or
- another officially supported Fiber embedding

without rewriting the continuity engine.

## Archive format

The `.fcr.json` reference format has three top-level objects:

```json
{
  "manifest": {},
  "ciphertext": "base64...",
  "snapshot": {}
}
```

The native backup is opaque to FiberContinuity. It is encrypted with AES-GCM using a PBKDF2-SHA256-derived key.

The manifest contains only non-secret metadata required for preflight:

- Fiber version;
- network name and identity;
- public node identity;
- integrity digests; and
- encryption parameters.

## Restore state machine

```text
ARCHIVE LOADED
     │
     ▼
INTEGRITY CHECK
     │
     ▼
NETWORK CHECK ── mismatch ──> BLOCKED
     │
     ▼
VERSION POLICY ─ blocked ───> BLOCKED
     │
     ▼
DECRYPT
     │
     ▼
NATIVE RESTORE
     │
     ▼
RESTART/RECONNECT (adapter-specific)
     │
     ▼
POST-RESTORE SNAPSHOT
     │
     ▼
BEFORE/AFTER VERIFICATION
     │
     ├── hard mismatch ─────> UNSAFE
     ├── soft mismatch ─────> DEGRADED
     └── all checks pass ───> HEALTHY
```

## Why no backend is required

The v0.1 workflow is local-first. A server would increase the security surface without being needed for the core experiment. Vercel hosts only static application assets.

Future cloud-backup integrations should store only client-side encrypted blobs and should be optional adapters, not a requirement for continuity.
