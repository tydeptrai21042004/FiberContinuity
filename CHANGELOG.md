# Changelog

## 0.3.0 — Reviewer-ready recovery console

- Reworked the demo UI into an operational recovery dashboard with workflow state, security guarantees, richer session inspection, archive metadata, evidence export, and responsive layout.
- Added a guided one-click backup → loss → preflight → restore → verify demonstration.
- Added a deterministic safety scenario lab for browser state loss, stale same-identity state, foreign live nodes, and network mismatch.
- Added machine-readable reviewer evidence bundles without passwords or decrypted native backup bytes.
- Archive import now performs corruption validation before accepting the file and rejects oversized files before reading them into memory.
- Added a pre-mutation target race guard to close the check-then-use window after preflight.
- Added core password-policy enforcement and validation of recovery stabilization settings.
- Hardened demo native-backup parsing and expanded recovery edge-case regression tests.

## 0.2.2 — Node 24 / Vercel runtime alignment

- Moved Vercel/CI/local runtime pins to Node.js 24.
