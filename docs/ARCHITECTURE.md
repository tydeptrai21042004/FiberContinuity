# Architecture

## Goal

FiberContinuity turns an official/native Fiber backup/restore primitive into a browser-facing continuity workflow with explicit safety gates and verifiable recovery evidence.

```text
Application UI
    │
    ▼
FiberContinuity
    │
    ├─ consistent checkpoint
    ├─ authenticated encrypted archive
    ├─ fail-closed preflight
    ├─ native restore / rollback-on-exception
    ├─ restart + stabilization
    └─ before/after verification
    │
    ▼
FiberAdapter
    │
    ▼
Pinned official/native Fiber integration
```

## Adapter boundary

Only the adapter may define runtime-specific recovery behavior. Core code sees:

- a normalized `FiberSnapshot`;
- opaque native backup bytes;
- an optional atomic `createRecoveryCheckpoint()`;
- an optional/required host-specific `assessRestoreTarget()` decision; and
- an optional Fiber-aware `waitForRecoveryStable()` hook.

This keeps undocumented database/storage assumptions out of the continuity engine.

## Archive format v2

A v2 archive has only two top-level fields:

```json
{
  "manifest": {},
  "ciphertext": "base64..."
}
```

The encrypted envelope contains:

```text
schemaVersion
snapshot
nativeBackup (base64)
```

This avoids publishing node IDs, channel IDs, balances, payment IDs, invoice IDs, and network identity in the archive header.

The public manifest contains cryptographic parameters and a non-authenticating SHA-256 ciphertext corruption digest. AES-GCM authenticates the encrypted envelope, while the immutable public header fields used by the decryptor are included as AAD.

## Backup consistency

Preferred path:

```text
adapter.createRecoveryCheckpoint()
       ├─ snapshot
       └─ native bytes
```

Fallback path:

```text
inspect A → export native backup → inspect B
```

If observable state differs between A and B, backup creation aborts instead of packaging an obviously inconsistent snapshot/backup pair.

## Restore state machine

```text
ARCHIVE LOADED
      │
      ▼
STRUCTURE + CORRUPTION CHECK
      │
      ▼
AUTHENTICATED DECRYPT
      │
      ▼
NETWORK IDENTITY ─ mismatch ─────────> BLOCKED
      │
      ▼
VERSION POLICY ─ review/blocked ─────> BLOCKED
      │
      ▼
TARGET SAFETY ─ review/blocked ──────> BLOCKED
      │
      ▼
BEST-EFFORT ROLLBACK CHECKPOINT
      │
      ▼
NATIVE RESTORE
      │ exception
      ├──────────────────────────────> ROLLBACK ATTEMPT
      ▼
RESTART / RECONNECT
      │
      ▼
STABILIZATION / RECONCILIATION WAIT
      │
      ▼
POST-RESTORE SNAPSHOT
      │
      ▼
FIELD-AWARE VERIFICATION
      │
      ├─ hard mismatch ──────────────> UNSAFE
      ├─ warning / unavailable ──────> DEGRADED
      └─ all supported checks pass ─> HEALTHY
```

## Capability-aware verification

Every snapshot declares coverage for channels, payments, and invoices:

- `full`: compare all normalized fields;
- `metadata`: compare only fields the adapter deliberately exposes; or
- `unavailable`: report `UNKNOWN` rather than manufacturing a PASS.

For the deterministic demo all three record families are `full`. The current conservative `FiberJsAdapter` uses channel `metadata` and marks payment/invoice history `unavailable` until a pinned upstream integration exposes those records explicitly.

## Why no backend is required

The reference workflow is local-first. Vercel hosts static assets only. A future cloud-backup provider should receive only client-side encrypted archives and remain an optional storage adapter rather than part of the recovery trust boundary.
