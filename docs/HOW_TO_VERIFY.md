# How to verify

This file is intended to make CKBuilder/Spark review reproducible.

## A. Static checks

```bash
npm install
npm run build
npm test
```

Expected:

- TypeScript build succeeds;
- Vite outputs `dist/`;
- compatibility tests pass;
- archive encryption round-trip passes; and
- recovery test returns `HEALTHY`.

## B. Browser demo

```bash
npm run dev
```

1. Confirm the starting demo session has two channels and three payments.
2. Use the default demo password or choose another password with at least 10 characters.
3. Click **Create encrypted archive**.
4. Download the `.fcr.json` file.
5. Click **Simulate browser-state loss**.
6. Confirm Node ID changes to `LOST`, channels become `0`, and payments become `0`.
7. Click **Restore + verify**.
8. Confirm the recovery report is `HEALTHY`.
9. Export the evidence JSON.

## C. Corruption check

1. Download a recovery archive.
2. Change a character in `ciphertext` without updating the manifest digest.
3. Import it.
4. Attempt restore.

Expected: FiberContinuity rejects the archive before native restore.

## D. Wrong password check

Expected: AES-GCM decryption fails and native restore is not called.

## E. Network mismatch check

For an integration test, alter the adapter's network identity after backup.

Expected: preflight blocks restore before mutation.

## F. Version-policy check

The unit test asserts that 0.9.1 → 0.10.0-rc1 is blocked in accordance with the upstream prerelease warning.

## G. Real Fiber acceptance (future milestone)

When official browser/native recovery hooks are integrated, retain for each run:

- Fiber/FNN version and commit;
- browser version;
- network identity;
- public node ID;
- channel IDs before and after;
- payment/invoice identifiers available through the supported API;
- archive digest;
- fault injected;
- recovery duration;
- final health result.

Do not publish secrets or private channel material that upstream guidance treats as sensitive.
