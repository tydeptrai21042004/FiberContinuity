# FiberContinuity code-only patch — 2026-10-24

Unzip this archive over the root of the corresponding GitHub repository (inside the `FiberContinuity-main/` folder in this ZIP). Commit the listed changed and new files. **No `.github/workflows` file is included or modified.**

## In-scope changes

- Existing `npm run test:hosted-browser` now validates the real browser experiment AND fails closed when the evidence cannot be verified. GitHub's current workflow will invoke the strengthened script without YAML edits.
- Real browser test now checks four negative outcomes on genuine disposable testnet/node data: wrong password, ciphertext tampering, occupied IndexedDB rejection, and journal-marked interrupted restart rejection.
- The uploaded GitHub artifact receives commit SHA, run ID/attempt, exact checked source fingerprint, a distinct browser run ID and timestamps.
- `api/evidence.mjs` and the verifier refuse a full-cycle *passed* assessment unless all negative controls succeeded. External/funded-channel safety is never claimed.
- Source-free native Node tests are included in the pre-existing `npm run test:hosted-api` command.

## Deploy/verify

```bash
npm install --no-audit --no-fund
npm run test:hosted-api
npm run check
npm run build
# On Actions: existing job executes npm run test:hosted-browser
# For downloaded artifact against same commit:
node scripts/verify-hosted-artifact.mjs evidence/hosted-browser-evidence.json
```

## Limitations

A GitHub Actions artifact is **first-party execution evidence**, not independently signed proof of testnet state. Existing CI outcomes must be rerun after deploying the patched application. Fiber JS 0.9.1 does not establish an atomic worker write-flush barrier; funded-channel recovery is explicitly unsupported. The generic adapter's automatic restart remains intentionally blocked and cannot be promoted to supported without reviewed lifecycle changes. A new dependency lockfile requires registry access; none has been invented. See `docs/TESTNET_EVIDENCE_DEBT_PATCH.md` for the debt matrix.
