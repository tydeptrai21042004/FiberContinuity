import { timingSafeEqual } from 'node:crypto';
import { checkPublicTestnet } from '../server/ckbMonitor.mjs';
export const config = { maxDuration: 30 };
function authorized(header, secret) {
  if (!secret || secret.length < 16 || typeof header !== 'string') return false;
  const a = Buffer.from(header); const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  if (request.method !== 'GET') return response.status(405).json({error:'METHOD_NOT_ALLOWED'});
  if (!process.env.CRON_SECRET || process.env.CRON_SECRET.length < 16) return response.status(503).json({error:'CRON_SECRET_NOT_CONFIGURED'});
  if (!authorized(request.headers.authorization, process.env.CRON_SECRET)) return response.status(401).json({error:'UNAUTHORIZED'});
  try {
    const result = await checkPublicTestnet();
    console.info('[FiberContinuity][scheduled-wallet-monitor]', JSON.stringify(result));
    return response.status(200).json(result);
  } catch {
    console.error('[FiberContinuity][scheduled-wallet-monitor]', JSON.stringify({at:new Date().toISOString(), status:'failed', reason:'rpc-unavailable-or-wrong-network'}));
    return response.status(503).json({status:'failed', reason:'rpc-unavailable-or-wrong-network'});
  }
}
