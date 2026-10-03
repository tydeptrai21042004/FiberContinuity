# Security model

FiberContinuity handles recovery material. Treat every design choice as security-sensitive.

## v0.1 invariants

1. Native backup bytes are encrypted before export.
2. The demo does not upload recovery payloads to a server.
3. The plaintext manifest must not contain seed phrases, private keys, passwords, macaroon/biscuit tokens, or wallet secrets.
4. Restore is blocked if network identity does not match.
5. Known-incompatible version paths are blocked before native mutation.
6. Restore completion is followed by post-restore verification.
7. FiberContinuity does not directly manipulate undocumented Fiber database keys or channel-state records.

## Password encryption

The reference archive uses:

- PBKDF2-SHA256;
- 310,000 iterations;
- a random 128-bit salt;
- AES-256-GCM; and
- a random 96-bit IV.

This is appropriate for a prototype/reference implementation, but a production wallet should review its password/KDF policy and may prefer platform-backed key storage, passkeys, hardware-backed secrets, or a memory-hard KDF where available.

## Threats not solved by v0.1

FiberContinuity does not protect against:

- malware or a compromised browser runtime;
- a malicious upstream Fiber package;
- users losing both their recovery archive and password;
- unsafe upstream restore semantics;
- restoring a cryptographically valid but operationally stale channel state when upstream Fiber says that path is unsafe;
- secret leakage caused by an integrating wallet/provider.

## Production requirement

Before real funds are used, pin the exact Fiber release, verify the supported migration path, audit the adapter's native recovery hooks, and run the recovery test matrix against the exact deployed environment.
