import { checkPublicTestnet } from '../server/ckbMonitor.mjs';
export const config = { maxDuration: 30 };
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store, max-age=0');
  response.setHeader('Content-Type', 'application/json');
  if (request.method !== 'GET') return response.status(405).json({error:'METHOD_NOT_ALLOWED'});
  try { return response.status(200).json(await checkPublicTestnet()); }
  catch { return response.status(503).json({status:'unavailable', networkVerified:false, message:'CKB testnet RPC unavailable or wrong network'}); }
}
