import { describe, expect, it } from "vitest";
import { buildEvidenceChain, verifyEvidenceChain, redactEvidenceValue } from "../src/core/reviewEvidence";

describe("testnet evidence redaction and local integrity", () => {
  it("creates and verifies ordered SHA-256 hash links", async () => {
    const events = [{ action: "rpc-verified", chain: "ckb_testnet" }, { action: "recovery-readback", matched: true }];
    const chain = await buildEvidenceChain(events);
    expect(chain.events).toHaveLength(2);
    expect(await verifyEvidenceChain(chain)).toBe(true);
    chain.events[0].event.chain = "ckb";
    expect(await verifyEvidenceChain(chain)).toBe(false);
  });
  it("excludes likely credential fields and scrubs secret literals", () => {
    const secret = "a".repeat(64);
    const sanitized = redactEvidenceValue({ password: "test", nativeBackup: "plaintext", action: `error: ${secret}`, info: { api_key: secret } });
    const serialized = JSON.stringify(sanitized);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("plaintext");
    expect(serialized).toContain("[REDACTED_32_BYTE_HEX]");
  });
});
