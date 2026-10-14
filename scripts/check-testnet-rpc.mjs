#!/usr/bin/env node
// Network-only diagnostic; does not check browser CORS or worker isolation.
const endpoint = process.argv[2] || 'https://testnet.ckbapp.dev/';
const u = new URL(endpoint);
if (u.protocol !== 'https:' || u.username || u.password || u.search || u.hash || !['/', '/rpc'].includes(u.pathname)) throw Error('Provide a clean HTTPS RPC URL');
const abort = new AbortController();
const timer = setTimeout(() => abort.abort(), 10000);
try {
  const result = await fetch(u, { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'get_blockchain_info', params: [] }), signal: abort.signal, redirect: 'error' });
  if (!result.ok) throw Error(`HTTP ${result.status}`);
  const json = await result.json();
  if (json?.id !== 1 || json?.result?.chain !== 'ckb_testnet') throw Error(`Wrong chain or RPC error: ${json?.result?.chain ?? 'unknown'}`);
  console.log(`PASS: Pudge testnet ckb_testnet; initial block download: ${json.result.is_initial_block_download}`);
  console.log('Also test the RPC in the browser; server-side success does not establish CORS access.');
} finally { clearTimeout(timer); }
