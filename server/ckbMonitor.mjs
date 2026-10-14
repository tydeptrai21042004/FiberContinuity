/** Strictly read-only public CKB testnet status and capacity monitor.
 * No keys, no transactions, no third-party-controlled RPC URLs, no writes.
 */
import settings from '../public-testnet-config.json' with { type: 'json' };

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32M = 0x2bc830a3;
function polymod(values) {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3][i];
  }
  return chk >>> 0;
}
function expand(hrp) { return [...hrp].map(x => x.charCodeAt(0) >>> 5).concat([0], [...hrp].map(x => x.charCodeAt(0) & 31)); }
function convertBits(data, from, to) {
  let acc = 0, bits = 0; const out = []; const mask = (1 << to) - 1;
  for (const value of data) {
    if (value < 0 || value >>> from) throw Error('Invalid address payload');
    acc = ((acc << from) | value) & 0x3fffffff; bits += from;
    while (bits >= to) { bits -= to; out.push((acc >>> bits) & mask); }
  }
  if (bits >= from || ((acc << (to - bits)) & mask)) throw Error('Invalid bech32m padding');
  return Uint8Array.from(out);
}
export function decodeTestnetLock(address) {
  if (typeof address !== 'string' || address.length < 15 || address.length > 1023 ||
      address !== address.toLowerCase() || !address.startsWith('ckt1')) throw Error('Not a lowercase CKB testnet address');
  const pos = address.lastIndexOf('1'), hrp = address.slice(0, pos);
  if (hrp !== 'ckt' || pos < 1) throw Error('Wrong address network');
  const words = [...address.slice(pos + 1)].map(c => CHARSET.indexOf(c));
  if (words.some(x => x < 0) || words.length < 7 || polymod(expand(hrp).concat(words)) !== BECH32M) {
    throw Error('Invalid CKB testnet bech32m checksum');
  }
  const payload = convertBits(words.slice(0, -6), 5, 8);
  if (payload.length < 35 || payload[0] !== 0 || ![0, 1, 2, 4].includes(payload[33])) {
    throw Error('Only full CKB2021 lock addresses are supported');
  }
  const toHex = bytes => `0x${Buffer.from(bytes).toString('hex')}`;
  const hashType = ({ 0:'data', 1:'type', 2:'data1', 4:'data2' })[payload[33]];
  if (!hashType) throw Error('Unknown lock hash type');
  return { code_hash: toHex(payload.slice(1, 33)), hash_type: hashType, args: toHex(payload.slice(34)) };
}
export async function rpc(method, params, { fetcher = fetch, endpoint = settings.rpcUrl, timeoutMs = 8000 } = {}) {
  // Never accept a dynamic destination from clients. Tests may inject a fetcher only.
  if (endpoint !== settings.rpcUrl || !['get_blockchain_info', 'get_cells'].includes(method)) throw Error('RPC method/endpoint disallowed');
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetcher(endpoint, {
      method:'POST', headers:{'content-type':'application/json'},
      body:JSON.stringify({jsonrpc:'2.0', id:1, method, params}),
      redirect:'error', cache:'no-store', signal:controller.signal
    });
    if (!resp.ok) throw Error(`RPC_HTTP_${resp.status}`);
    const reply = await resp.json();
    if (reply?.jsonrpc !== '2.0' || reply.id !== 1 || reply.error || !reply.result) throw Error('RPC_INVALID_RESPONSE');
    return reply.result;
  } finally { clearTimeout(timer); }
}
function formatShannons(sum) {
  const digits = sum.toString().padStart(9, '0');
  return `${digits.slice(0, -8) || '0'}.${digits.slice(-8)}`;
}
export async function checkPublicTestnet({ call = rpc, maxPages = 10 } = {}) {
  const now = new Date().toISOString();
  const address = settings.watchedAddress;
  const lock = decodeTestnetLock(address); // never query if invalid.
  const info = await call('get_blockchain_info', []);
  if (info?.chain !== 'ckb_testnet') throw Error('WRONG_NETWORK_NOT_TESTNET');
  const output = { schema:'fiber-continuity-wallet-monitor-v1', at:now, network:'ckb_testnet',
    address, rpcReachable:true, synced: info.is_initial_block_download === false,
    accountType:'external-watch-only', walletCanSign:false, fundedFiberRecoveryVerified:false,
    indexerStatus:'unavailable', capacityCKB:null, liveCells:null, complete:false };
  if (!output.synced) return output; // no confident balance while syncing.
  try {
    let cursor, total = 0n, cellCount = 0, complete = false;
    for (let page = 0; page < maxPages; page++) {
      const params = [{script:lock, script_type:'lock', script_search_mode:'exact', with_data:false}, 'asc', '0x64'];
      if (cursor) params.push(cursor);
      const result = await call('get_cells', params);
      if (!Array.isArray(result?.objects) || result.objects.length > 100) throw Error('INDEXER_BAD_PAGE');
      for (const obj of result.objects) {
        const capacity = obj?.output?.capacity;
        if (typeof capacity !== 'string' || !/^0x[0-9a-f]+$/i.test(capacity)) throw Error('INDEXER_BAD_CAPACITY');
        total += BigInt(capacity); cellCount++;
      }
      if (result.objects.length < 100) { complete = true; break; }
      if (!result.last_cursor || result.last_cursor === cursor) throw Error('INDEXER_CURSOR_STALLED');
      cursor = result.last_cursor;
    }
    output.indexerStatus = complete ? 'ok' : 'too-many-cells';
    output.complete = complete;
    // Never present a partial capacity as a full balance.
    if (complete) { output.capacityCKB = formatShannons(total); output.liveCells = cellCount; }
  } catch {
    output.indexerStatus = 'unavailable'; // Chain check is independently useful.
  }
  return output;
}
export { settings };
