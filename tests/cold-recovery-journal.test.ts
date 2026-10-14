import { describe, expect, it } from "vitest";
import { assertStartAllowed, beginColdRestore, coldJournalKey, readColdJournal, recordColdReadback, recordColdRestart, type JournalStorage } from "../src/core/coldRecoveryJournal";

function fixture() {
  const data = new Map<string, string>();
  const storage: JournalStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); } };
  const input = { profile: "fc-testnet-fixture", database: "fiber-fc-testnet-fixture", nodeId: "node-abc", backupChecksum: "A".repeat(43) + "=" };
  return { data, storage, input };
}
describe("persistent zero-channel cold recovery journal", () => {
  it("blocks ordinary startup during mutation or readback-pending restart", () => {
    const { storage, input } = fixture();
    beginColdRestore(input, storage);
    expect(() => assertStartAllowed(input.profile, false, storage)).toThrow(/mutating/);
    expect(() => assertStartAllowed(input.profile, true, storage)).toThrow(/mutating/);
    recordColdReadback(input, storage);
    expect(() => assertStartAllowed(input.profile, false, storage)).toThrow(/readback-verified/);
    expect(() => assertStartAllowed(input.profile, true, storage)).not.toThrow();
  });
  it("refuses a second destructive attempt until the first is verified", () => {
    const { storage, input } = fixture();
    beginColdRestore(input, storage);
    expect(() => beginColdRestore(input, storage)).toThrow(/journal is mutating/);
    expect(() => recordColdReadback({ ...input, backupChecksum: "B".repeat(43) + "=" }, storage)).toThrow(/does not match/);
    expect(readColdJournal(input.profile, storage)?.stage).toBe("mutating");
    recordColdReadback(input, storage);
    recordColdRestart(input.profile, storage);
    expect(() => assertStartAllowed(input.profile, false, storage)).not.toThrow();
    expect(() => assertStartAllowed(input.profile, true, storage)).toThrow(/No pending/);
  });
  it("blocks a legacy v0.7 interrupted recovery marker", () => {
    const { storage, input, data } = fixture();
    data.set(`fiber-continuity-v07-testnet-quarantine:${input.profile}`, JSON.stringify({ stage: "mutating" }));
    expect(() => assertStartAllowed(input.profile, false, storage)).toThrow(/v0.7/);
  });
  it("fails closed on corrupt localStorage or a mismatched profile", () => {
    const { storage, input, data } = fixture();
    data.set(coldJournalKey(input.profile), "{not json");
    expect(() => assertStartAllowed(input.profile, false, storage)).toThrow(/Corrupt/);
    data.set(coldJournalKey(input.profile), JSON.stringify({ profile: input.profile, stage: "readback-verified" }));
    expect(() => readColdJournal(input.profile, storage)).toThrow(/Invalid/);
  });
});
