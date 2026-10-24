#!/usr/bin/env node
/**
 * Fail-closed offline audit of the JSON produced by scripts/run-hosted-browser.mjs.
 * It can establish consistency with an exact checkout/Actions run; it cannot
 * cryptographically prove that a browser, a deployment or the testnet told the truth.
 * Never accept this verifier as proof of funded-channel recovery.
 */
import { readFile } from 'node:fs/promises';
import { sourceFingerprint } from './source-fingerprint.mjs';

const positive = [
  'browserReady', 'testnetVerified', 'actualWasmNodeStarted', 'zeroChannelsObserved',
  'workersStopped', 'encryptedColdBackup', 'archiveRoundtrip',
  'stoppedDatabaseReadback', 'disposableProfileDeleted', 'wholeProfileRestored',
  'zeroChannelRestartVerified',
];
const negatives = ['wrongPasswordRejected','tamperedArchiveRejected','occupiedRestoreRejected','interruptedRestartBlocked'];
const fail = (reason) => { throw new Error(`HOSTED_ARTIFACT_REJECTED: ${reason}`); };

export function verifyHostedArtifact(document, options = {}) {
  const { expectedFingerprint = sourceFingerprint(),
    expectedSha = process.env.GITHUB_SHA || null,
    expectedRunId = process.env.GITHUB_RUN_ID || null,
    requireGitHub = false,
  } = options;
  if (!document || typeof document !== 'object' || Array.isArray(document)) fail('Not a JSON object');
  if (document.schema !== 'fiber-continuity-hosted-evidence-v1' ||
      document.source !== 'github-actions-browser' || document.mode !== 'disposable-full-cycle')
    fail('Wrong schema, runner, or test scope');
  if (!/^[a-f0-9-]{32,40}$/i.test(document.runId || '')) fail('Invalid runner identifier');
  if (document.verdict !== 'passed' || document.failureStage !== null ||
      document.failureCode !== null || document.browserDiagnostic !== null ||
      document.browserPhase !== null || document.storageFailureReason !== null)
    fail('Runner did not report a clean full cycle');
  if (!document.checks || typeof document.checks !== 'object' || Array.isArray(document.checks) ||
      document.checks.fundedChannelRecoveryVerified !== false ||
      positive.some((key) => document.checks[key] !== true))
    fail('A required real browser milestone is missing or invalid');
  if (!document.negativeChecks || typeof document.negativeChecks !== 'object' ||
      negatives.some((key) => document.negativeChecks[key] !== true))
    fail('A required negative safety control is missing or invalid');
  const provenance = document.provenance;
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance) ||
      !/^[a-f0-9]{64}$/.test(provenance.sourceFingerprint || '') ||
      provenance.sourceFingerprint !== expectedFingerprint)
    fail('Deployment/runner fingerprint does not match exact sources in checkout');
  if (!/^[a-f0-9-]{32,40}$/i.test(provenance.browserRunId || ''))
    fail('No distinct browser execution identifier');
  if (provenance.browserRunId === document.runId) fail('Runner/browser identity must be distinct');
  if (!/^https:\/\/[a-z0-9.-]+$/i.test(provenance.siteOrigin || '')) fail('Invalid deployment origin');
  const started = Date.parse(provenance.startedAt);
  const ended = Date.parse(provenance.completedAt);
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started || ended - started > 30 * 60_000)
    fail('Invalid or excessive observation interval');
  if (expectedSha && provenance.gitCommit !== expectedSha) fail('Wrong GitHub source SHA');
  if (expectedRunId && provenance.githubRunId !== expectedRunId) fail('Wrong GitHub run ID');
  if (requireGitHub) {
    if (!/^[a-f0-9]{40}$/.test(provenance.gitCommit || '') ||
        !/^\d{1,20}$/.test(provenance.githubRunId || '') ||
        !Number.isSafeInteger(provenance.githubRunAttempt) || provenance.githubRunAttempt < 1)
      fail('Missing real GitHub Actions provenance');
  }
  return Object.freeze({
    status: 'passed', scope: 'disposable-zero-channel-testnet-only',
    sourceFingerprint: provenance.sourceFingerprint, gitCommit: provenance.gitCommit,
    githubRunId: provenance.githubRunId, browserRunId: provenance.browserRunId,
    fundedChannelRecoveryVerified: false, upstreamFlushBarrierEstablished: false,
    externallyAttested: false,
  });
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const filepath = process.argv[2];
  if (!filepath) {
    console.error('Usage: node scripts/verify-hosted-artifact.mjs evidence/hosted-browser-evidence.json');
    process.exitCode = 2;
  } else {
    try {
      const result = verifyHostedArtifact(JSON.parse(await readFile(filepath, 'utf8')),
        {requireGitHub: process.env.GITHUB_ACTIONS === 'true'});
      console.log(JSON.stringify(result, null, 2));
      console.log('LIMIT: This checks a GitHub Actions browser report, not CKB transactions, funded-channel safety, or a cryptographic attestation.');
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'HOSTED_ARTIFACT_REJECTED');
      process.exitCode = 1;
    }
  }
}
