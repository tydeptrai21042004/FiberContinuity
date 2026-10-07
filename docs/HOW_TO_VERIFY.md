# How to verify

## A. Automated checks

```bash
npm install
npm run check
npm run build
npm run test:coverage
```

Expected:

- TypeScript project check succeeds;
- archive v2 round-trip succeeds;
- public archive JSON does not contain demo node/channel identifiers;
- wrong password fails authentication;
- AAD-bound manifest tampering fails authentication;
- ciphertext tampering still fails AES-GCM even if the public SHA-256 digest is recomputed;
- legacy v1 archive restore is rejected;
- same-ID/wrong-channel-state verification becomes `UNSAFE`;
- full-coverage payment/invoice mismatches become `UNSAFE`;
- unavailable record families become `UNKNOWN`/`DEGRADED`;
- unregistered version pairs remain `review` and cannot restore;
- a different live target is blocked; and
- the deterministic loss → restore path ends `HEALTHY`.

## B. Browser demo

```bash
npm run dev
```

1. Confirm the starting demo session shows two channels and three payments.
2. Use the default demo password or another password of at least 12 characters.
3. Click **Create private v2 archive**.
4. Download the `.fcr.json` and inspect it: demo node/channel/payment IDs must not be visible in plaintext.
5. Click **Simulate browser-state loss**.
6. Confirm node ID becomes `LOST` and record counts become zero.
7. Click **Run preflight** and verify all three safety gates pass.
8. Click **Restore + stabilize + verify**.
9. Confirm the final report is `HEALTHY`.
10. Export the evidence JSON if desired.

## C. Tamper tests

### Public header tamper

Change `manifest.createdAt`, keep ciphertext unchanged, and try restore with the correct password.

Expected: AES-GCM authentication fails because the public header is AAD-bound.

### Ciphertext tamper

Change ciphertext. Even if an attacker also recomputes `ciphertextDigest`, restore must still fail AES-GCM authentication.

### Wrong password

Expected: authenticated decryption fails before native restore is invoked.

## D. Fail-closed policy tests

- Change target network identity: restore is blocked.
- Use an unregistered version pair such as `0.9.0 → 0.9.1`: status is `review`, and restore is blocked.
- Present a different node identity with existing records: restore is blocked.
- Present same-identity but different live records without an explicit adapter safety hook: restore requires review instead of overwriting potentially newer state.
- Present an empty same-identity target with any recovery record family marked `unavailable`: restore still requires review because emptiness is not provable.
- Make rollback export fail with an operational error: restore must abort before mutation.
- Make post-restore stabilization fail after a rollback checkpoint is captured: the pre-mutation checkpoint must be restored.

## E. Real Fiber acceptance milestone

For a pinned official integration retain redacted evidence for:

- Fiber/FNN version and commit;
- browser/runtime version;
- network identity;
- scenario/fault injected;
- before/after public state supported by the integration;
- archive SHA-256 corruption digest;
- preflight decisions;
- reconnect/reconciliation duration;
- verification capability coverage; and
- final health result.

Never publish seed material, private keys, recovery passwords, or upstream-private channel material.
