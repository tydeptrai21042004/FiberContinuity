import { sha256Hex } from "./crypto";

/** Public redacted evidence. Hash chains show accidental changes after export,
 * but are NOT signatures, third-party attestations, or peer/channel safety proofs.
 */
export interface ChainedEvidenceEvent { sequence: number; event: Record<string, unknown>; previousHash: string; hash: string; }
export interface ChainedEvidence { algorithm: "SHA-256"; domain: "fiber-continuity-evidence-v1"; events: ChainedEvidenceEvent[]; finalHash: string; }
const START_HASH = "0".repeat(64);

function sanitizeString(value: string): string {
  // Error text can originate from RPC/WASM and must not leak credentials or private keys.
  return value
    .replace(/\b(?:0x)?[0-9a-fA-F]{64}\b/g, "[REDACTED_32_BYTE_HEX]")
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, "$1[REDACTED_AUTH]@")
    .replace(/((?:token|apikey|api_key|password|secret|key)=)[^&\s]+/gi, "$1[REDACTED]");
}
export function redactEvidenceValue(input: unknown, depth = 0): unknown {
  if (depth > 16) return "[OMITTED_DEEP_VALUE]";
  if (typeof input === "string") return sanitizeString(input);
  if (input === null || typeof input === "boolean" || typeof input === "number") return input;
  if (Array.isArray(input)) return input.slice(0, 1000).map(value => redactEvidenceValue(value, depth + 1));
  if (input && typeof input === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input).slice(0, 100)) {
      if (/(?:private|secret|password|passphrase|seed|mnemonic|credential|ciphertext|nativebackup)/i.test(key)) continue;
      result[key] = redactEvidenceValue(value, depth + 1);
    }
    return result;
  }
  return "[UNSUPPORTED_VALUE]";
}
export async function buildEvidenceChain(events: Record<string, unknown>[]): Promise<ChainedEvidence> {
  if (events.length > 10_000) throw new Error("Evidence event count exceeds review export limit.");
  let previousHash = START_HASH;
  const items: ChainedEvidenceEvent[] = [];
  for (let i = 0; i < events.length; i++) {
    const event = redactEvidenceValue(events[i]) as Record<string, unknown>;
    const hash = await sha256Hex(JSON.stringify(["fiber-continuity-evidence-v1", i, previousHash, event]));
    items.push({ sequence: i, event, previousHash, hash });
    previousHash = hash;
  }
  return { algorithm: "SHA-256", domain: "fiber-continuity-evidence-v1", events: items, finalHash: previousHash };
}
export async function verifyEvidenceChain(chain: ChainedEvidence): Promise<boolean> {
  if (chain.algorithm !== "SHA-256" || chain.domain !== "fiber-continuity-evidence-v1" || !Array.isArray(chain.events)) return false;
  let previousHash = START_HASH;
  for (let i = 0; i < chain.events.length; i++) {
    const item = chain.events[i];
    if (item.sequence !== i || item.previousHash !== previousHash) return false;
    const expected = await sha256Hex(JSON.stringify([chain.domain, i, previousHash, item.event]));
    if (item.hash !== expected) return false;
    previousHash = expected;
  }
  return previousHash === chain.finalHash;
}
