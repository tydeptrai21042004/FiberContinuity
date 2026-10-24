# FiberContinuity: GitHub Actions testnet evidence hardening

## Scope of this source-only patch

This patch intentionally does **not** modify `.github/workflows/ci.yml` or `.github/workflows/hosted-testnet.yml`. The existing hosted-testnet workflow already installs Chromium, invokes `npm run test:hosted-browser`, and publishes `evidence/hosted-browser-evidence.json` with `upload-artifact` on both success and failure.

The package script now runs **two gates in sequence**: the genuine remote browser experiment and an offline check of its recorded results. A failed browser experiment keeps a failed CI exit code; the existing `if: always()` artifact step can still preserve the JSON evidence. There is no fabricated successful testnet result in this patch.

## What is now measured by the browser experiment

The original positive milestones remain mandatory: HTTPS/cross-origin-isolated browser, actual CKB testnet RPC verification, Fiber JS WASM startup, observed zero-channel state, stopped worker, authenticated encrypted archive, round-trip decryption, complete cold readback, isolated destructive loss, whole-database recovery and identity-preserving restart.

Four additional *observed negative* outcomes are now required for a passing **disposable full-cycle** run:

1. `wrongPasswordRejected`: an actually encrypted archive refuses a different password.
2. `tamperedArchiveRejected`: the real ciphertext refuses a byte-changing mutation.
3. `occupiedRestoreRejected`: attempting to import an authenticated archive into the still-populated real Fiber IndexedDB is refused before writing.
4. `interruptedRestartBlocked`: the actual host refuses to start while the persistent journal says `mutating`.

Every negative check starts false and becomes true only after the expected rejection. An unrelated exception is *not* counted as the correct rejection. They are required by the browser runner, hosted evidence API for a full-cycle `passed` classification, and independent artifact verifier.

Non-destructive smoke tests remain separately scoped: they cannot claim that full recovery passed.

## GitHub Actions artifact provenance

The existing artifact now records:

- `provenance.sourceFingerprint`: SHA-256 over the exact local recovery-critical tracked sources, checked against the deployed application's visible source fingerprint *before the test runs*;
- `provenance.gitCommit`, `githubRunId`, `githubRunAttempt`: actual GitHub Actions environment values, not UI input (or `null` if executed outside Actions);
- `provenance.browserRunId`: independently generated browser execution ID;
- `provenance.siteOrigin`, `startedAt`, `completedAt`;
- explicit `verdict`, positive `checks` and `negativeChecks`, and allowlisted failure codes.

GitHub artifacts and CI run logs are usable **first-party test evidence** for the isolated testnet browser run. These are not externally signed attestations of chain state, independent builders' results, final peer/channel safety, or a verified Fiber JS v0.9.1 write-flush acknowledgement.

## No YAML changes: how to apply and verify

Extract this ZIP over the repository root (keep paths such as `src/...`, `api/...`, `scripts/...` in place). Only the files listed in the patch manifest need to be committed. Then:

```sh
npm install --no-audit --no-fund
npm run check
npm run test:hosted-api
npm run build
```

The existing Actions workflow continues to run `npm run test:hosted-browser`. This now executes:

```sh
node scripts/run-hosted-browser.mjs && node scripts/verify-hosted-artifact.mjs evidence/hosted-browser-evidence.json
```

After downloading an artifact for the **same checkout**, run:

```sh
npm run evidence:verify
# or: node scripts/verify-hosted-artifact.mjs path/to/hosted-browser-evidence.json
```

To compare against a specific public GitHub Actions run outside GitHub's environment, set `GITHUB_SHA` and `GITHUB_RUN_ID` to the expected SHA/run before executing the verifier. The verifier checks values but does not fetch or authenticate GitHub's artifact API. Independently open the corresponding GitHub Actions run and check that it succeeded and uploaded the artifact.

If the remote Vercel deployment is out of date, the existing source fingerprint gate fails with `DEPLOYMENT_OUTDATED` instead of silently testing an old build.

## Debt resolution vs external blockers

| ID | After patch | Why |
|---|---|---|
| FC-01 full real recovery | **Executable strengthened acceptance, not yet established passing** | Must run the updated hosted test and inspect its recorded full-cycle results. Existing successful CI history cannot be assumed. |
| FC-02 negative cases | **Four browser controls added** | Wrong password, tampered ciphertext, occupied restore and interrupted restart are now exercised against the actual browser. Additional crash/blocked-IDB/mismatched-version cases remain to be run in isolated integration environments. |
| FC-03 reproducible reviewer evidence | **Structured CI artifact and independent consistency gate added** | Reviewer evidence is actionable after a passing new Action run. It is not a signed independent attestation. |
| Generic `makeRecoveryAdapter` restart | **Still intentionally unsupported** | The low-level generic adapter cannot bypass the explicit stopped-database verification/journal sequence. The real browser lab uses its guarded separate restore path. Do not remove the fail-closed throw without a reviewed unified lifecycle. |
| Fiber JS stop/flush | **Upstream blocker** | Two stable complete reads do not prove that the underlying WASM worker durably flushed all writes. Funded channel recovery stays disabled. |
| Independent application integration | **Open** | Requires a separate app/builder to run the protocol and record results. CI under this project's account cannot substitute. |
| Dependency lockfile | **Open** | A genuine resolved lockfile needs registry access. Generate it by `npm install --package-lock-only` with network access, commit it, and confirm the existing `npm install` workflow checks; do not construct fictional dependency integrity hashes. |

## Security notes

- Never provide user private keys or real funded-channel credentials to the automated test. It uses new disposable secrets and a unique profile.
- Never treat a plain CI green check as evidence of the full recovery unless the full-cycle artifact contains all required `true` results and passes provenance verification.
- Do not edit the existing workflow YAML merely to make a test pass.
- Do not disable database checks, journal quarantine, exclusive locks or source-deployment matching.
