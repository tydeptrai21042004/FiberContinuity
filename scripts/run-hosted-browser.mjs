#!/usr/bin/env node
/** Run remotely in GitHub-hosted Chromium against the live Vercel deployment.
 * No supplied wallet keys or payments; destructive recovery is confined to a freshly-generated zero-channel disposable profile.
 */
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import settings from '../public-testnet-config.json' with {type:'json'};
const site = process.env.FIBER_CONTINUITY_URL || 'https://fiber-continuity.vercel.app';
if (!/^https:\/\/[a-zA-Z0-9.-]+\/?$/.test(site)) throw Error('Set FIBER_CONTINUITY_URL to the HTTPS hostname of your deployment');
const base = site.replace(/\/$/, '');
const runId = globalThis.crypto.randomUUID();
let report = { schema:'fiber-continuity-hosted-evidence-v1', source:'github-actions-browser',
  address:settings.watchedAddress, runId, mode:'disposable-full-cycle', checks:Object.fromEntries([
    'browserReady','testnetVerified','actualWasmNodeStarted','zeroChannelsObserved','workersStopped',
    'encryptedColdBackup','archiveRoundtrip','stoppedDatabaseReadback','disposableProfileDeleted',
    'wholeProfileRestored','zeroChannelRestartVerified','fundedChannelRecoveryVerified'
  ].map(key=>[key,false])) };
let failed = true, page;
const browser = await chromium.launch({headless:true});
try {
  const context = await browser.newContext({acceptDownloads:false});
  page = await context.newPage();
  await page.goto(base, {waitUntil:'domcontentloaded', timeout:60_000});
  await page.getByRole('button',{name:/Real Fiber testnet/i}).click();
  await page.getByTestId('run-hosted-full-cycle').click();
  await page.getByTestId('hosted-smoke-result').waitFor({state:'visible', timeout:200_000});
  const value = await page.getByTestId('hosted-smoke-result').innerText();
  const result = JSON.parse(value);
  if (result.schema !== report.schema || result.address !== report.address || result.mode !== report.mode) throw Error('Hosted result did not match expected schema/address');
  report = {schema:report.schema,source:'github-actions-browser',address:report.address,runId, mode:report.mode,
    checks:Object.fromEntries(Object.keys(report.checks).map(key => [key, result.checks[key] === true]))};
  failed = Object.entries(report.checks).some(([key,value]) => key !== 'fundedChannelRecoveryVerified' && !value);
  console.log(`Hosted actual Fiber WASM smoke ${failed ? 'INCOMPLETE' : 'PASSED'}`);
} catch (error) {
  console.error('Hosted browser test failed:', error instanceof Error ? error.name : 'unknown');
} finally {
  // No secrets, screenshots of keys, state dump or private recovery files in CI artifacts.
  await mkdir('evidence',{recursive:true});
  await writeFile('evidence/hosted-browser-evidence.json', JSON.stringify(report,null,2)+'\n');
  await browser.close();
  const token = process.env.EVIDENCE_INGEST_TOKEN;
  if (token && token.length >= 24) {
    try {
      const response = await fetch(`${base}/api/evidence`, {method:'POST',
        headers:{'content-type':'application/json',authorization:`Bearer ${token}`},
        body:JSON.stringify(report),signal:AbortSignal.timeout(15_000)});
      if (!response.ok) { console.error(`Vercel evidence ingestion HTTP ${response.status}`); failed = true; }
      else console.log('Sanitized browser evidence was accepted by the Vercel API and written to Vercel Logs.');
    } catch { console.error('Vercel evidence endpoint unreachable'); failed = true; }
  } else { console.error('EVIDENCE_INGEST_TOKEN missing. Artifact saved to GitHub Actions, but requested Vercel Logs export was not configured.'); failed = true; }
  if (failed) process.exitCode=1;
}
