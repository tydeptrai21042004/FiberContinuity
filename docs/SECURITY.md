# Security model

FiberContinuity handles recovery material. The code therefore defaults to refusing ambiguous destructive actions rather than interpreting ambiguity as success.

## v0.3.1 invariants

1. Native backup bytes and the pre-recovery snapshot are encrypted together before export.
2. Node/channel/payment/invoice metadata is not present in the public v2 archive header.
3. AES-256-GCM authenticates the private recovery envelope.
4. Security-relevant immutable public header fields are bound with AES-GCM AAD.
5. The public SHA-256 ciphertext digest is treated only as an accidental-corruption check, not an authenticity mechanism.
6. Legacy v1 archives are blocked because their preflight metadata was not cryptographically authenticated.
7. Network mismatch blocks restore before native mutation.
8. `review` and `blocked` compatibility decisions both block restore.
9. A target that may contain unrelated or newer state is not overwritten unless the adapter can explicitly prove the operation safe.
10. Unsupported record visibility produces `UNKNOWN`, not a false verification PASS.
11. Unexpected rollback-checkpoint export failures abort restore before mutation; only an explicit unsupported-capability condition may proceed without rollback.
12. Native restore, restart, or stabilization exceptions trigger a best-effort rollback to the target bytes captured immediately before mutation when such export succeeds.
13. Empty targets with unavailable recovery visibility are not inferred safe from record counts alone.
14. Full-coverage payment/invoice mismatches are hard verification failures.
15. FiberContinuity never directly edits undocumented Fiber database keys/channel-state records.

## Password encryption

The reference archive uses:

- PBKDF2-SHA256;
- 310,000 iterations;
- random 128-bit salt;
- AES-256-GCM;
- random 96-bit IV;
- 128-bit authentication tag; and
- a minimum 12-character recovery password in the reference UI/core.

PBKDF2 is chosen because it is available through browser Web Crypto without adding a heavyweight cryptographic runtime. A production wallet should review the KDF/password policy for its threat model and may prefer platform-backed secrets or a reviewed memory-hard construction.

## Archive metadata

The public manifest necessarily exposes approximate creation time, KDF parameters, salt/IV, format version, and ciphertext length/digest. It does **not** expose the source node ID, network identity, channel IDs, balances, payment history, or invoice history.

Changing AAD-bound public fields without the password causes AES-GCM authentication to fail. Changing salt/IV also makes decryption fail because the correct key/nonce can no longer be reproduced.

## Destructive restore policy

A restore is allowed only when all three gates are safe:

```text
network match
AND compatibility == supported
AND targetSafety == safe
```

A same-node target that differs from the backup can represent newer live state. Core fallback policy therefore marks it `review` instead of treating matching node identity as sufficient authorization to overwrite it. An empty-looking target is also `review` when any recovery record family is unavailable, because emptiness cannot be proven from incomplete visibility.

Live adapters should implement `assessRestoreTarget()` using runtime-specific knowledge such as a dedicated empty recovery profile, stopped node lifecycle, or another reviewed condition.

## Verification boundary

`HEALTHY` means all checks supported by the before/after snapshots passed. If a record family is unavailable, the report is at least `DEGRADED` with `UNKNOWN` checks. This avoids claiming continuity for data the adapter cannot observe.

A health report is still not proof that an upstream channel state is economically safe to publish. Fiber/FNN remains authoritative for channel recovery semantics.

## Threats not solved

FiberContinuity does not protect against:

- malware or a compromised browser/OS;
- a malicious upstream dependency;
- weak/reused recovery passwords;
- users losing both archive and password;
- unsafe behavior inside an upstream native restore hook;
- a host integration lying about version/network/target safety;
- rollback failure after a partially destructive upstream restore;
- operationally stale channel state that upstream Fiber itself considers unsafe; or
- secrets leaked elsewhere by the integrating wallet/provider.

## Production requirement

Before real funds are used: pin the exact Fiber release, verify supported backup/migration semantics with upstream, audit the adapter/native hooks, provide an explicit destructive-target policy, exercise reconnect/reconciliation behavior, and run the fault matrix against the exact browser/provider environment.
