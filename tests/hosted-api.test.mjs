import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeTestnetLock, checkPublicTestnet, settings } from '../server/ckbMonitor.mjs';
import { normalizeEvidence } from '../api/evidence.mjs';

test('user-supplied testnet address has a valid CKB2021 bech32m checksum and lock',()=> {
  const lock = decodeTestnetLock(settings.watchedAddress);
  assert.equal(lock.hash_type,'type');
  assert.equal(lock.code_hash,'0x9bd7e06f3ecf4be0f2fcd2188b23f1b9fcc88e5d4b65a8637b17723bbda3cce8');
  assert.match(lock.args,/^0x[0-9a-f]{40}$/);
});
test('address checksum mutation and mainnet address are rejected',()=> {
  const a = settings.watchedAddress;
  assert.throws(()=>decodeTestnetLock(a.slice(0,-1)+(a.at(-1)==='q'?'p':'q')));
  assert.throws(()=>decodeTestnetLock('ckb'+a.slice(3)));
});
test('indexer wallet balance uses precise bigint CKB capacity and exact lock',async()=> {
  const calls=[];
  const call=async(method,params)=>{
    calls.push([method,params]);
    if(method==='get_blockchain_info') return {chain:'ckb_testnet',is_initial_block_download:false};
    return {objects:[{output:{capacity:'0x174876e800'}},{output:{capacity:'0x5f5e100'}}],last_cursor:'0x00'}; // 1001 CKB
  };
  const result=await checkPublicTestnet({call});
  assert.equal(result.capacityCKB,'1001.00000000');
  assert.equal(result.liveCells,2);
  assert.equal(result.complete,true);
  assert.equal(calls[1][1][0].script_search_mode,'exact');
  assert.equal(calls[1][1][0].script_type,'lock');
  assert.equal(result.fundedFiberRecoveryVerified,false);
});
test('wrong RPC network fails closed',async()=>{
  await assert.rejects(()=>checkPublicTestnet({call:async()=>({chain:'ckb',is_initial_block_download:false})}),/WRONG_NETWORK/);
});
test('indexer failure preserves chain verification without inventing a zero balance',async()=>{
  const data=await checkPublicTestnet({call:async method=> {
    if(method==='get_blockchain_info') return {chain:'ckb_testnet',is_initial_block_download:false};
    throw Error('INDEXER_UNAVAILABLE');
  }});
  assert.equal(data.network,'ckb_testnet');
  assert.equal(data.capacityCKB,null);
  assert.equal(data.indexerStatus,'unavailable');
});
test('partial pagination must never claim a complete balance',async()=>{
  const data=await checkPublicTestnet({maxPages:1,call:async method=> {
    if(method==='get_blockchain_info') return {chain:'ckb_testnet',is_initial_block_download:false};
    return {objects:Array.from({length:100},()=>({output:{capacity:'0x5f5e100'}})),last_cursor:'0x10'};
  }});
  assert.equal(data.complete,false);
  assert.equal(data.capacityCKB,null);
  assert.equal(data.indexerStatus,'too-many-cells');
});
const report={schema:'fiber-continuity-hosted-evidence-v1',runId:'12345678-test',address:settings.watchedAddress,
  source:'github-actions-browser', mode:'non-destructive-smoke',checks:{browserReady:true,testnetVerified:true,actualWasmNodeStarted:true,
    zeroChannelsObserved:true,workersStopped:true,encryptedColdBackup:true,archiveRoundtrip:true,
    stoppedDatabaseReadback:true,disposableProfileDeleted:false,wholeProfileRestored:false,
    zeroChannelRestartVerified:false,fundedChannelRecoveryVerified:false}};
test('Vercel evidence strips caller-controlled arbitrary fields',()=>{
  const result=normalizeEvidence({...report,privateKey:'secret-do-not-log',checks:{...report.checks,password:'never-log'}});
  assert.equal(result.status,'passed');
  assert.equal(JSON.stringify(result).includes('secret-do-not-log'),false);
  assert.equal(JSON.stringify(result).includes('never-log'),false);
  assert.equal(result.isolatedZeroChannelRestoreReported,false);
});
test('rejects false claims of funded channel recovery or forged watched address',()=>{
  assert.throws(()=>normalizeEvidence({...report,checks:{...report.checks,fundedChannelRecoveryVerified:true}}));
  assert.throws(()=>normalizeEvidence({...report,address:'ckt1other'}));
});

test('cron endpoint is always unauthorized without a strong configured secret', async () => {
  const { default: cronHandler } = await import('../api/cron-watch.mjs');
  const prior = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'this-test-only-secret-strong-enough';
  const makeResponse = () => ({code:0, result:null, setHeader(){return this;},status(code){this.code=code;return this;},json(result){this.result=result;return this;}});
  try {
    const res = makeResponse();
    await cronHandler({method:'GET',headers:{authorization:'Bearer wrong-secret'}},res);
    assert.equal(res.code,401);
    assert.equal(res.result.error,'UNAUTHORIZED');
    const res2 = makeResponse();
    await cronHandler({method:'POST',headers:{authorization:'Bearer this-test-only-secret-strong-enough'}},res2);
    assert.equal(res2.code,405);
  } finally { if(prior===undefined)delete process.env.CRON_SECRET; else process.env.CRON_SECRET=prior; }
});

test('evidence ingestion refuses unauthenticated input', async () => {
  const {default: handler} = await import('../api/evidence.mjs');
  const prior=process.env.EVIDENCE_INGEST_TOKEN;
  process.env.EVIDENCE_INGEST_TOKEN = 'strong-test-server-only-evidence-token';
  const res={code:null,result:null,setHeader(){return this;},status(code){this.code=code;return this;},json(result){this.result=result;return this;}};
  try {
    await handler({method:'POST',headers:{authorization:'Bearer wrong', 'content-length':'10'},body:report},res);
    assert.equal(res.code,401);
    assert.equal(res.result.error,'UNAUTHORIZED');
  } finally {if(prior===undefined)delete process.env.EVIDENCE_INGEST_TOKEN; else process.env.EVIDENCE_INGEST_TOKEN=prior;}
});

test('complete disposable zero-channel recovery evidence is distinct from funded recovery',()=>{
  const payload={...report,mode:'disposable-full-cycle',checks:{...report.checks,disposableProfileDeleted:true,wholeProfileRestored:true,zeroChannelRestartVerified:true}};
  const output=normalizeEvidence(payload);
  assert.equal(output.status,'passed');
  assert.equal(output.isolatedZeroChannelRestoreReported,true);
  assert.equal(output.fundedChannelRestoreVerified,false);
  const incomplete=normalizeEvidence({...payload,checks:{...payload.checks,zeroChannelRestartVerified:false}});
  assert.equal(incomplete.status,'incomplete');
});

test('failure codes are strictly allowlisted before writing Vercel logs',()=>{
  const incomplete=normalizeEvidence({...report,checks:{...report.checks,actualWasmNodeStarted:false},
    failureStage:'actualWasmNodeStarted',failureCode:'BROWSER_TEST_INCOMPLETE'});
  assert.equal(incomplete.status,'incomplete');
  assert.equal(incomplete.failureStage,'actualWasmNodeStarted');
  assert.equal(incomplete.failureCode,'BROWSER_TEST_INCOMPLETE');
  const injected=normalizeEvidence({...report, failureStage:'DO_NOT_LOG_SECRET', failureCode:'password=TEST_SECRET'});
  assert.equal(injected.failureStage,null);
  assert.equal(injected.failureCode,null);
  assert.equal(JSON.stringify(injected).includes('TEST_SECRET'),false);
});
