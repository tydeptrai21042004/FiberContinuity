/**
 * Fail-closed, persistent, REDACTED recovery journal for the experimental browser lab.
 * Only a verified readback may authorize an explicit restart. This journal is an
 * interruption indicator, NOT a cross-process locking mechanism or safety proof.
 * Removing site data removes this marker, so a separate exclusive Web Lock and
 * target-occupancy guard are always required.
 */
export type ColdRecoveryStage = "mutating" | "readback-verified" | "restart-verified";
export interface ColdRecoveryJournal {
  format: "fiber-continuity-cold-journal";
  version: 1;
  profile: string;
  database: string;
  nodeId: string;
  backupChecksum: string;
  stage: ColdRecoveryStage;
  createdAt: string;
  updatedAt: string;
}

export type JournalStorage = Pick<Storage, "getItem" | "setItem">;
export const coldJournalKey = (profile: string) => `fiber-continuity-v08-testnet-quarantine:${profile}`;
const legacyJournalKey = (profile: string) => `fiber-continuity-v07-testnet-quarantine:${profile}`;

function validate(j: unknown, profile: string): asserts j is ColdRecoveryJournal {
  if (!j || typeof j !== "object") throw new Error("Invalid persistent recovery journal. Do not start the profile.");
  const r = j as Record<string, unknown>;
  if (r.format !== "fiber-continuity-cold-journal" || r.version !== 1 || r.profile !== profile ||
      !["mutating", "readback-verified", "restart-verified"].includes(String(r.stage)) ||
      typeof r.database !== "string" || !r.database || typeof r.nodeId !== "string" || !r.nodeId ||
      typeof r.backupChecksum !== "string" || !/^[A-Za-z0-9+/]{43}=$/.test(r.backupChecksum) ||
      typeof r.createdAt !== "string" || !Number.isFinite(Date.parse(r.createdAt)) ||
      typeof r.updatedAt !== "string" || !Number.isFinite(Date.parse(r.updatedAt))) {
    throw new Error("Invalid persistent recovery journal. Leave the database offline for manual investigation.");
  }
}

export function readColdJournal(profile: string, storage: JournalStorage = localStorage): ColdRecoveryJournal | null {
  // An interrupted v0.7 restore has no trusted checksum metadata. Never silently
  // bypass its quarantine during an app upgrade: manual investigation is needed.
  if (storage.getItem(legacyJournalKey(profile)) !== null) {
    throw new Error("Unresolved v0.7 recovery quarantine exists. Investigate it manually; this release cannot auto-upgrade that journal.");
  }
  const raw = storage.getItem(coldJournalKey(profile));
  if (raw === null) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error("Corrupt recovery journal: cannot safely start or restore this profile."); }
  validate(parsed, profile);
  return parsed;
}

export function beginColdRestore(
  input: Pick<ColdRecoveryJournal, "profile" | "database" | "nodeId" | "backupChecksum">,
  storage: JournalStorage = localStorage
): ColdRecoveryJournal {
  const existing = readColdJournal(input.profile, storage);
  if (existing && existing.stage !== "restart-verified") {
    throw new Error(`Recovery journal is ${existing.stage}; verify existing restored bytes before attempting another operation.`);
  }
  const now = new Date().toISOString();
  const journal: ColdRecoveryJournal = {
    format: "fiber-continuity-cold-journal", version: 1, ...input,
    stage: "mutating", createdAt: now, updatedAt: now
  };
  validate(journal, input.profile);
  storage.setItem(coldJournalKey(input.profile), JSON.stringify(journal));
  return journal;
}

/** Only call this AFTER a full cold readback checksum matches the authenticated dump. */
export function recordColdReadback(
  input: Pick<ColdRecoveryJournal, "profile" | "database" | "nodeId" | "backupChecksum">,
  storage: JournalStorage = localStorage
): ColdRecoveryJournal {
  const previous = readColdJournal(input.profile, storage);
  if (!previous || previous.stage === "restart-verified" ||
      previous.database !== input.database || previous.nodeId !== input.nodeId ||
      previous.backupChecksum !== input.backupChecksum) {
    throw new Error("Recovery journal does not match this archive/profile. Keep the node offline.");
  }
  const next: ColdRecoveryJournal = { ...previous, stage: "readback-verified", updatedAt: new Date().toISOString() };
  storage.setItem(coldJournalKey(input.profile), JSON.stringify(next));
  return next;
}

/** Restart is not a proof of peer/channel safety. This is a zero-channel testnet milestone only. */
export function recordColdRestart(profile: string, storage: JournalStorage = localStorage): ColdRecoveryJournal {
  const previous = readColdJournal(profile, storage);
  if (!previous || previous.stage !== "readback-verified") {
    throw new Error("Readback verification is required before completing a recovery journal.");
  }
  const next: ColdRecoveryJournal = { ...previous, stage: "restart-verified", updatedAt: new Date().toISOString() };
  storage.setItem(coldJournalKey(profile), JSON.stringify(next));
  return next;
}

export function assertStartAllowed(profile: string, recoveryRestart = false, storage: JournalStorage = localStorage): void {
  const j = readColdJournal(profile, storage);
  if (!j || j.stage === "restart-verified") {
    if (recoveryRestart) throw new Error("No pending verified restore exists to restart.");
    return;
  }
  if (recoveryRestart && j.stage === "readback-verified") return;
  throw new Error(`Recovery is ${j.stage}. Stay offline and use the explicit archive readback/resume workflow.`);
}
