import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyHostedArtifact } from '../scripts/verify-hosted-artifact.mjs';

function valid() {
  return {
    schema: 'fiber-continuity-hosted-evidence-v1', source:'github-actions-browser',
    mode:'disposable-full-cycle', runId:'01234567-89ab-cdef-0123-456789abcdef',
    verdict:'passed', failureStage:null, failureCode:null, browserDiagnostic:null,
    browserPhase:null, storageFailureReason:null,
    checks: {
      browserReady:true, testnetVerified:true, actualWasmNodeStarted:true,
      zeroChannelsObserved:true, workersStopped:true, encryptedColdBackup:true,
      archiveRoundtrip:true, stoppedDatabaseReadback:true, disposableProfileDeleted:true,
      wholeProfileRestored:true, zeroChannelRestartVerified:true,
      fundedChannelRecoveryVerified:false,
    },
    negativeChecks: {wrongPasswordRejected:true,tamperedArchiveRejected:true,occupiedRestoreRejected:true,interruptedRestartBlocked:true},
    provenance: {
      sourceFingerprint:'a'.repeat(64), gitCommit:'b'.repeat(40), githubRunId:'12345',
      githubRunAttempt:1, browserRunId:'11111111-2222-3333-4444-555555555555',
      siteOrigin:'https://fiber-continuity.vercel.app',
      startedAt:'2026-10-24T12:00:00.000Z',completedAt:'2026-10-24T12:03:00.000Z'
    }
  };
}
const opts={expectedFingerprint:'a'.repeat(64),expectedSha:'b'.repeat(40),expectedRunId:'12345',requireGitHub:true};
test('accepts complete, source-pinned, negative-tested, zero-channel report',()=>{
  const x=verifyHostedArtifact(valid(),opts);
  assert.equal(x.status,'passed');
  assert.equal(x.fundedChannelRecoveryVerified,false);
  assert.equal(x.externallyAttested,false);
});
test('rejects omissions of each real browser milestone',()=>{
  for(const key of Object.keys(valid().checks)) {
    const doc=valid();doc.checks[key] = key === 'fundedChannelRecoveryVerified' ? true : false;
    assert.throws(()=>verifyHostedArtifact(doc,opts),/HOSTED_ARTIFACT_REJECTED/);
  }
});
test('rejects missing negative controls, mismatched source, failed logs and fabricated github metadata',()=>{
  for(const key of Object.keys(valid().negativeChecks)) {
    const doc=valid();doc.negativeChecks[key]=false;
    assert.throws(()=>verifyHostedArtifact(doc,opts),/negative safety/);
  }
  let doc=valid();doc.provenance.sourceFingerprint='c'.repeat(64);
  assert.throws(()=>verifyHostedArtifact(doc,opts),/fingerprint/);
  doc=valid();doc.provenance.gitCommit='c'.repeat(40);
  assert.throws(()=>verifyHostedArtifact(doc,opts),/source SHA/);
  doc=valid();doc.provenance.browserRunId=doc.runId;
  assert.throws(()=>verifyHostedArtifact(doc,opts),/distinct/);
  doc=valid();doc.failureCode='EVIDENCE_INGEST_FAILED';
  assert.throws(()=>verifyHostedArtifact(doc,opts),/clean full cycle/);
  doc=valid();doc.provenance.completedAt='2026-10-24T13:00:00.000Z';
  assert.throws(()=>verifyHostedArtifact(doc,opts),/interval/);
});
