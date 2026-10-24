#!/usr/bin/env node
/**
 * GitHub-hosted Chromium exercises a disposable, unfunded Fiber browser profile.
 * It never handles the watch-only wallet's signing keys, payments or channels.
 * A failed deployment/version check is NOT a failed Fiber recovery experiment.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import settings from '../public-testnet-config.json' with { type: 'json' };
import pkg from '../package.json' with { type: 'json' };
import { sourceFingerprint } from './source-fingerprint.mjs';

const site = process.env.FIBER_CONTINUITY_URL || 'https://fiber-continuity.vercel.app';
if (!/^https:\/\/[a-zA-Z0-9.-]+\/?$/.test(site)) {
  throw Error('FIBER_CONTINUITY_URL must be the HTTPS hostname of the intended Vercel deployment');
}
const base = site.replace(/\/$/, '');
const checkNames = [
  'browserReady', 'testnetVerified', 'actualWasmNodeStarted', 'zeroChannelsObserved',
  'workersStopped', 'encryptedColdBackup', 'archiveRoundtrip',
  'stoppedDatabaseReadback', 'disposableProfileDeleted', 'wholeProfileRestored',
  'zeroChannelRestartVerified', 'fundedChannelRecoveryVerified'
];
const requiredChecks = checkNames.filter(name => name !== 'fundedChannelRecoveryVerified');
const stageValues = new Set(['deployment', 'browser-navigation', 'browser-test', 'evidence-ingest', ...requiredChecks]);
const codeValues = new Set(['DEPLOYMENT_OUTDATED', 'NAVIGATION_FAILED', 'BROWSER_TEST_TIMEOUT',
  'BROWSER_TEST_INCOMPLETE', 'BROWSER_TEST_ERROR', 'EVIDENCE_INGEST_FAILED']);
const runId = crypto.randomUUID();
const negativeNames = ['wrongPasswordRejected', 'tamperedArchiveRejected', 'occupiedRestoreRejected', 'interruptedRestartBlocked'];
const sha = /^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA || '') ? process.env.GITHUB_SHA : null;
const githubRunId = /^\d{1,20}$/.test(process.env.GITHUB_RUN_ID || '') ? process.env.GITHUB_RUN_ID : null;
const githubRunAttempt = /^\d{1,6}$/.test(process.env.GITHUB_RUN_ATTEMPT || '') ? Number(process.env.GITHUB_RUN_ATTEMPT) : null;
const startedAt = new Date().toISOString();
const diagnosticCategories = new Set([
  'BROWSER_ISOLATION', 'CKB_RPC_CONNECTIVITY', 'FIBER_CONFIG_INVALID',
  'FIBER_WASM_ASSET_OR_WORKER', 'FIBER_WASM_STARTUP', 'BROWSER_STORAGE',
  'RECOVERY_SAFETY_GATE', 'UNKNOWN_BROWSER_FAILURE'
]);
const storageReasonCodes = new Set([
  'COLD_STORE_UNSTABLE', 'COLD_STORE_MISSING', 'COLD_STORE_LOCKED',
  'COLD_STORE_SCHEMA', 'COLD_STORE_UNSUPPORTED_VALUE', 'COLD_STORE_LIMIT',
  'COLD_STORE_TRANSACTION', 'COLD_STORE_PRECONDITION', 'COLD_STORE_DISCOVERY',
  'COLD_STORE_OPEN', 'COLD_STORE_CURSOR', 'COLD_STORE_SERIALIZATION',
  'COLD_STORE_CHECKSUM', 'COLD_STORE_VALIDATION', 'COLD_STORE_HOST_FENCE',
  'COLD_STORE_HOST_NAME', 'COLD_STORE_HOST_RELEASE', 'COLD_STORE_UNKNOWN'
]);
const diagnosticPhases = new Set([
  'browser-readiness', 'ckb-rpc-preflight', 'fiber-config-create',
  'fiber-wasm-start', 'fiber-observe', 'fiber-stop', 'encrypted-backup',
  'cold-store-export', 'cold-store-schema', 'archive-encryption', 'archive-decryption',
  'cold-readback', 'disposable-database-delete', 'cold-profile-restore',
  'fiber-wasm-restart'
]);
let report = {
  schema: 'fiber-continuity-hosted-evidence-v1',
  source: 'github-actions-browser',
  address: settings.watchedAddress, runId, mode: 'disposable-full-cycle',
  checks: Object.fromEntries(checkNames.map(name => [name, false])),
  negativeChecks: Object.fromEntries(negativeNames.map(name => [name, false])),
  provenance: { sourceFingerprint: sourceFingerprint(), gitCommit: sha,
    githubRunId, githubRunAttempt, browserRunId: null, siteOrigin: base, startedAt, completedAt: null },
  failureStage: null, failureCode: null,
  browserDiagnostic: null, browserPhase: null, storageFailureReason: null,
};
let failed = true;
let stage = 'deployment';
let browser;
function markFailure(failureStage, failureCode) {
  // Only allow predefined, non-sensitive failure identifiers in evidence.
  report.failureStage = stageValues.has(failureStage) ? failureStage : 'browser-test';
  report.failureCode = codeValues.has(failureCode) ? failureCode : 'BROWSER_TEST_ERROR';
}

try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: false });
  const page = await context.newPage();
  page.on('pageerror', error => console.error(`Page runtime error (name only): ${error.name}`));

  stage = 'browser-navigation';
  const response = await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  if (!response?.ok()) throw Error('NAVIGATION_FAILED');

  stage = 'deployment';
  // Prevent timing out against an old Vercel deployment missing the automation UI.
  // The application displays its version in the header and footer.
  const versionVisible = await page.getByText(`v${pkg.version}`, { exact: true }).first()
    .isVisible().catch(() => false);
  if (!versionVisible) throw Error('DEPLOYMENT_OUTDATED');

  const navButton = page.getByRole('button', { name: /Real Fiber testnet/i });
  if (await navButton.count() === 0) throw Error('DEPLOYMENT_OUTDATED');
  await navButton.click();
  const expectedSource = sourceFingerprint();
  // Vercel auto-deploys can lag a GitHub push. Wait for the same exact source,
  // not the shared v1.0.1 UI version. Never run recovery against stale code.
  let deployedSource = '';
  for (let attempt = 0; attempt < 13; attempt++) {
    deployedSource = (await page.getByTestId('hosted-build-fingerprint')
      .textContent({ timeout: 2500 }).catch(() => ''))?.trim() || '';
    if (deployedSource === expectedSource) break;
    if (attempt === 12) {
      console.error(`Browser deployment source mismatch (CI ${expectedSource.slice(0, 12)}, Vercel ${deployedSource.slice(0, 12) || 'missing'}).`);
      throw Error('DEPLOYMENT_OUTDATED');
    }
    await page.waitForTimeout(10_000);
    await page.reload({ waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.getByRole('button', { name: /Real Fiber testnet/i }).click();
  }
  const runButton = page.getByTestId('run-hosted-full-cycle');
  if (await runButton.count() === 0) throw Error('DEPLOYMENT_OUTDATED');

  stage = 'browser-test';
  await runButton.click();
  try {
    await page.getByTestId('hosted-smoke-result').waitFor({ state: 'visible', timeout: 200_000 });
  } catch {
    throw Error('BROWSER_TEST_TIMEOUT');
  }
  const value = await page.getByTestId('hosted-smoke-result').innerText();
  const result = JSON.parse(value);
  if (result.schema !== report.schema || result.address !== report.address || result.mode !== report.mode ||
      result.source !== 'interactive-browser' || typeof result.runId !== 'string' || !result.runId ||
      !result.checks || typeof result.checks !== 'object' || Array.isArray(result.checks) ||
      result.checks.fundedChannelRecoveryVerified !== false ||
      !result.negativeChecks || typeof result.negativeChecks !== 'object' ||
      negativeNames.some(name => typeof result.negativeChecks[name] !== 'boolean') ||
      checkNames.some(name => typeof result.checks[name] !== 'boolean')) {
    throw Error('BROWSER_TEST_ERROR');
  }
  report = {
    ...report,
    checks: Object.fromEntries(checkNames.map(name => [name, result.checks[name] === true])),
    negativeChecks: Object.fromEntries(negativeNames.map(name => [name, result.negativeChecks[name] === true])),
    provenance: { ...report.provenance, browserRunId: result.runId }
  };
  // All positive milestones must be explicit booleans. The v0.9.1 test must
  // never imply that funded-channel recovery or upstream flush was established.
  failed = requiredChecks.some(name => result.checks[name] !== true) ||
    negativeNames.some(name => result.negativeChecks[name] !== true);
  if (result.failurePhase || result.failureCategory) failed = true;
  if (failed) {
    markFailure(requiredChecks.find(name => !report.checks[name]) || 'browser-test', 'BROWSER_TEST_INCOMPLETE');
    // Read the operator-facing status, but publish only an allowlisted category.
    // Raw UI error text is NOT exported: it can contain RPC URLs or configuration.
    report.browserDiagnostic = diagnosticCategories.has(result.failureCategory)
      ? result.failureCategory : 'UNKNOWN_BROWSER_FAILURE';
    report.browserPhase = diagnosticPhases.has(result.failurePhase)
      ? result.failurePhase : 'unknown';
    report.storageFailureReason = report.browserPhase === 'cold-store-export' && storageReasonCodes.has(result.storageFailureReason)
      ? result.storageFailureReason : null;
    // Never echo raw UI exceptions, keys or RPC URLs into GitHub artifacts.
    console.error(`Hosted Fiber test incomplete at stage: ${report.failureStage}; phase: ${report.browserPhase}; category: ${report.browserDiagnostic}` +
      (report.storageFailureReason ? `; storage reason: ${report.storageFailureReason}` : ''));
    // This is not a false PASS: the real WASM/whole-profile assertion stays required.
  } else {
    console.log('Hosted Fiber disposable zero-channel full-cycle: PASSED');
  }
} catch (error) {
  const code = error instanceof Error ? error.message : '';
  if (code === 'DEPLOYMENT_OUTDATED') {
    markFailure('deployment', 'DEPLOYMENT_OUTDATED');
    console.error(`Deployment is missing v${pkg.version} or the full-cycle UI. Deploy the latest main branch to ${base} before running hosted tests.`);
  } else if (code === 'NAVIGATION_FAILED') {
    markFailure('browser-navigation', 'NAVIGATION_FAILED');
    console.error('Hosted site navigation returned a non-success status. Check deployment readiness.');
  } else if (code === 'BROWSER_TEST_TIMEOUT') {
    markFailure('browser-test', 'BROWSER_TEST_TIMEOUT');
    console.error('Browser test timed out before producing evidence. Inspect the Vercel deployment and RPC reachability.');
  } else {
    markFailure(stage, 'BROWSER_TEST_ERROR');
    console.error(`Hosted browser step failed: ${stage}; error type: ${error instanceof Error ? error.name : 'unknown'}.`);
  }
} finally {
  // Persist a redacted artifact even if the deployment, browser or RPC is broken.
  await mkdir('evidence', { recursive: true });
  try {
    if (browser) await browser.close();
  } catch { console.error('Browser cleanup incomplete. Hosted runner will terminate this disposable process.'); }
  const token = process.env.EVIDENCE_INGEST_TOKEN;
  if (token && token.length >= 24) {
    try {
      const response = await fetch(`${base}/api/evidence`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify(report),
        signal: AbortSignal.timeout(15_000)
      });
      if (!response.ok) {
        console.error(`Evidence endpoint returned HTTP ${response.status}; inspect Vercel settings.`);
        if (!failed) markFailure('evidence-ingest', 'EVIDENCE_INGEST_FAILED');
        failed = true;
      } else {
        console.log('Allowlisted browser evidence accepted by Vercel Logs.');
      }
    } catch {
      console.error('Evidence ingestion unreachable; GitHub artifact will still be saved.');
      if (!failed) markFailure('evidence-ingest', 'EVIDENCE_INGEST_FAILED');
      failed = true;
    }
  } else {
    // Token controls *optional* log delivery, not browser correctness.
    console.warn('EVIDENCE_INGEST_TOKEN not configured: skip Vercel logging. GitHub Actions evidence remains available.');
  }
  report.provenance.completedAt = new Date().toISOString();
  report.verdict = failed ? 'incomplete' : 'passed';
  await writeFile('evidence/hosted-browser-evidence.json', JSON.stringify(report, null, 2) + '\n');
  if (failed) process.exitCode = 1;
}
