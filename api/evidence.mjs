import { timingSafeEqual } from 'node:crypto';
import settings from '../public-testnet-config.json' with {type:'json'};
export const config = { maxDuration: 10 };
export function normalizeEvidence(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || payload.schema !== 'fiber-continuity-hosted-evidence-v1' ||
    typeof payload.runId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(payload.runId) ||
    !['github-actions-browser', 'interactive-browser'].includes(payload.source) ||
    payload.address !== settings.watchedAddress || !['non-destructive-smoke','disposable-full-cycle'].includes(payload.mode) || !payload.checks || typeof payload.checks !== 'object') throw Error('INVALID_EVIDENCE');
  const checks = {};
  for (const key of ['browserReady','testnetVerified','actualWasmNodeStarted','zeroChannelsObserved',
    'workersStopped','encryptedColdBackup','archiveRoundtrip','stoppedDatabaseReadback','disposableProfileDeleted','wholeProfileRestored',
    'zeroChannelRestartVerified','fundedChannelRecoveryVerified']) {
    if (typeof payload.checks[key] !== 'boolean') throw Error('INVALID_EVIDENCE');
    checks[key] = payload.checks[key];
  }
  if (checks.fundedChannelRecoveryVerified) throw Error('UNSUPPORTED_FUNDED_RECOVERY_CLAIM');
  const corePassed = checks.browserReady && checks.testnetVerified && checks.actualWasmNodeStarted &&
    checks.zeroChannelsObserved && checks.workersStopped && checks.encryptedColdBackup &&
    checks.archiveRoundtrip && checks.stoppedDatabaseReadback;
  const fullCyclePassed = checks.disposableProfileDeleted && checks.wholeProfileRestored && checks.zeroChannelRestartVerified;
  const status = corePassed && (payload.mode === 'non-destructive-smoke' ?
    !fullCyclePassed && !checks.disposableProfileDeleted && !checks.wholeProfileRestored && !checks.zeroChannelRestartVerified : fullCyclePassed) ? 'passed' : 'incomplete';
  // Deliberately discard all other fields. NEVER log unreviewed browser payloads.
  return {schema:'fiber-continuity-hosted-evidence-v1', loggedAt:new Date().toISOString(), runId:payload.runId,
    source:payload.source, address:settings.watchedAddress, scope:payload.mode === 'disposable-full-cycle' ? 'isolated-disposable-zero-channel-full-cycle' : 'non-destructive-zero-channel-browser-smoke',
    status, checks, failureStage: typeof payload.failureStage === 'string' && [
      'deployment','browser-navigation','browser-test','evidence-ingest',
      'browserReady','testnetVerified','actualWasmNodeStarted','zeroChannelsObserved','workersStopped',
      'encryptedColdBackup','archiveRoundtrip','stoppedDatabaseReadback','disposableProfileDeleted',
      'wholeProfileRestored','zeroChannelRestartVerified'
    ].includes(payload.failureStage) ? payload.failureStage : null,
    failureCode: typeof payload.failureCode === 'string' && [
      'DEPLOYMENT_OUTDATED','NAVIGATION_FAILED','BROWSER_TEST_TIMEOUT',
      'BROWSER_TEST_INCOMPLETE','BROWSER_TEST_ERROR','EVIDENCE_INGEST_FAILED'
    ].includes(payload.failureCode) ? payload.failureCode : null,
    storageFailureReason: typeof payload.storageFailureReason === 'string' && [
      'COLD_STORE_UNSTABLE','COLD_STORE_MISSING','COLD_STORE_LOCKED',
      'COLD_STORE_SCHEMA','COLD_STORE_UNSUPPORTED_VALUE','COLD_STORE_LIMIT',
      'COLD_STORE_TRANSACTION','COLD_STORE_UNKNOWN'
    ].includes(payload.storageFailureReason) ? payload.storageFailureReason : null,
    isolatedZeroChannelRestoreReported:payload.mode === 'disposable-full-cycle' && status === 'passed',
    fundedChannelRestoreVerified:false, externallyAttested:false};
}
function authorized(header, secret) {
  if (!secret || secret.length < 24 || typeof header !== 'string') return false;
  const a = Buffer.from(header), b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
export default async function handler(request, response) {
  response.setHeader('Cache-Control','no-store, max-age=0');
  if (request.method !== 'POST') return response.status(405).json({error:'METHOD_NOT_ALLOWED'});
  if (!process.env.EVIDENCE_INGEST_TOKEN || process.env.EVIDENCE_INGEST_TOKEN.length < 24)
    return response.status(503).json({error:'EVIDENCE_INGEST_TOKEN_NOT_CONFIGURED'});
  if (!authorized(request.headers.authorization, process.env.EVIDENCE_INGEST_TOKEN))
    return response.status(401).json({error:'UNAUTHORIZED'});
  const length = Number(request.headers['content-length']);
  if (Number.isFinite(length) && length > 8192) return response.status(413).json({error:'EVIDENCE_TOO_LARGE'});
  try {
    const record = normalizeEvidence(request.body);
    console.info('[FiberContinuity][hosted-browser-evidence]', JSON.stringify(record));
    return response.status(200).json({accepted:true, runId:record.runId, status:record.status});
  } catch { return response.status(400).json({error:'INVALID_EVIDENCE'}); }
}
