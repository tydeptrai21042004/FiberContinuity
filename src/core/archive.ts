import type { BackupManifest, FiberSnapshot, RecoveryArchive, RecoveryEnvelope, RecordCoverage } from "./types";
import { decryptBytes, encryptBytes, sha256Hex } from "./crypto";
import { base64ToBytesStrict, bytesToBase64, text, utf8 } from "./encoding";

/** Browser-oriented guardrails. Base64/JSON copies can use several times the raw backup size in memory. */
export const MAX_CIPHERTEXT_BYTES = 128 * 1024 * 1024;
export const MAX_ARCHIVE_JSON_BYTES = 180 * 1024 * 1024;
export const MAX_NATIVE_BACKUP_BYTES = 96 * 1024 * 1024;
const MAX_RECORDS_PER_FAMILY = 100_000;
const MAX_ID_LENGTH = 4_096;
const MAX_TEXT_FIELD_LENGTH = 16_384;

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function requiredString(value: unknown, label: string, maxLength = MAX_TEXT_FIELD_LENGTH): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > maxLength) {
    throw new Error(`${label} is missing or invalid.`);
  }
  if (/[\u0000-\u001f\u007f]/.test(value)) throw new Error(`${label} contains invalid control characters.`);
  return value;
}

function optionalString(value: unknown, label: string, maxLength = MAX_TEXT_FIELD_LENGTH): string | undefined {
  if (value === undefined) return undefined;
  return requiredString(value, label, maxLength);
}

function assertCoverage(value: unknown, label: string): asserts value is RecordCoverage {
  if (value !== "full" && value !== "metadata" && value !== "unavailable") {
    throw new Error(`${label} is invalid.`);
  }
}

function publicAad(manifest: BackupManifest): Uint8Array {
  return utf8(JSON.stringify({
    format: manifest.format,
    formatVersion: manifest.formatVersion,
    createdAt: manifest.createdAt,
    cipher: manifest.payload.cipher,
    kdf: manifest.payload.kdf,
    iterations: manifest.payload.iterations,
    aadVersion: manifest.payload.aadVersion
  }));
}

function assertRecordArray(value: unknown, label: string): JsonRecord[] {
  if (!Array.isArray(value)) throw new Error(`Archive recovery snapshot ${label} list is invalid.`);
  if (value.length > MAX_RECORDS_PER_FAMILY) throw new Error(`Archive recovery snapshot contains too many ${label} records.`);
  return value.map((item, index) => {
    if (!isRecord(item)) throw new Error(`Archive recovery snapshot contains an invalid ${label} record at index ${index}.`);
    return item;
  });
}

export function assertSnapshot(snapshot: unknown): asserts snapshot is FiberSnapshot {
  if (!isRecord(snapshot)) throw new Error("Archive recovery snapshot is missing.");

  requiredString(snapshot.capturedAt, "Archive recovery snapshot capture timestamp");
  if (Number.isNaN(Date.parse(snapshot.capturedAt as string))) {
    throw new Error("Archive recovery snapshot has an invalid capture timestamp.");
  }
  requiredString(snapshot.adapter, "Archive recovery snapshot adapter");
  requiredString(snapshot.fiberVersion, "Archive recovery snapshot Fiber version");
  requiredString(snapshot.networkIdentity, "Archive recovery snapshot network identity");
  requiredString(snapshot.nodeId, "Archive recovery snapshot node identity", MAX_ID_LENGTH);
  if (snapshot.network !== "testnet" && snapshot.network !== "mainnet" && snapshot.network !== "unknown") {
    throw new Error("Archive recovery snapshot has an invalid network name.");
  }
  if (!isRecord(snapshot.capabilities)) throw new Error("Archive recovery snapshot capabilities are invalid.");
  assertCoverage(snapshot.capabilities.channels, "Archive channel coverage");
  assertCoverage(snapshot.capabilities.payments, "Archive payment coverage");
  assertCoverage(snapshot.capabilities.invoices, "Archive invoice coverage");

  const channels = assertRecordArray(snapshot.channels, "channel");
  const payments = assertRecordArray(snapshot.payments, "payment");
  const invoices = assertRecordArray(snapshot.invoices, "invoice");

  const seen = (records: JsonRecord[], label: string): void => {
    const ids = records.map((record, index) => requiredString(record.id, `Archive ${label}[${index}] identifier`, MAX_ID_LENGTH));
    if (new Set(ids).size !== ids.length) throw new Error(`Archive recovery snapshot contains duplicate ${label} identifiers.`);
  };
  seen(channels, "channel");
  seen(payments, "payment");
  seen(invoices, "invoice");
  // A provider may omit record families only when it admits unavailability.
  // Claims of complete field coverage must be substantiated by each record.
  const capability = snapshot.capabilities as JsonRecord;
  if (capability.channels === "unavailable" && channels.length ||
      capability.payments === "unavailable" && payments.length ||
      capability.invoices === "unavailable" && invoices.length) {
    throw new Error("Unobservable recovery record families cannot simultaneously contain trusted records.");
  }
  if (capability.channels === "full" && channels.some((ch) => ch.localBalance === undefined || ch.remoteBalance === undefined)) {
    throw new Error("Full channel coverage requires both balance fields for every channel.");
  }
  for (const [family, records] of [["payment", payments], ["invoice", invoices]] as const) {
    const declared = capability[family === "payment" ? "payments" : "invoices"];
    if (declared === "full" && records.some((record) => record.amount === undefined)) {
      throw new Error(`Full ${family} coverage requires amount fields for every record.`);
    }
  }


  channels.forEach((record, index) => {
    requiredString(record.state, `Archive channel[${index}] state`);
    optionalString(record.peer, `Archive channel[${index}] peer`, MAX_ID_LENGTH);
    optionalString(record.localBalance, `Archive channel[${index}] local balance`);
    optionalString(record.remoteBalance, `Archive channel[${index}] remote balance`);
  });
  payments.forEach((record, index) => {
    requiredString(record.status, `Archive payment[${index}] status`);
    optionalString(record.amount, `Archive payment[${index}] amount`);
  });
  invoices.forEach((record, index) => {
    requiredString(record.status, `Archive invoice[${index}] status`);
    optionalString(record.amount, `Archive invoice[${index}] amount`);
  });
}

function parseManifest(value: unknown): BackupManifest {
  if (!isRecord(value)) throw new Error("Not a FiberContinuity archive.");
  if (value.format !== "fiber-continuity") throw new Error("Not a FiberContinuity archive.");
  if (value.formatVersion !== 2) {
    if (value.formatVersion === 1) {
      throw new Error("Legacy FiberContinuity v1 archives are intentionally blocked because their metadata was not authenticated. Recreate the backup with v2.");
    }
    throw new Error("Unsupported FiberContinuity archive format version.");
  }
  const createdAt = requiredString(value.createdAt, "Recovery archive creation timestamp");
  if (Number.isNaN(Date.parse(createdAt))) throw new Error("Recovery archive has an invalid creation timestamp.");
  if (!isRecord(value.payload)) throw new Error("Recovery archive cryptographic payload metadata is missing.");

  const payload = value.payload;
  if (payload.cipher !== "AES-GCM-256" || payload.kdf !== "PBKDF2-SHA256" || payload.aadVersion !== 1) {
    throw new Error("Unsupported FiberContinuity cryptographic parameters.");
  }
  if (!Number.isInteger(payload.iterations) || (payload.iterations as number) < 100_000 || (payload.iterations as number) > 2_000_000) {
    throw new Error("Unsupported FiberContinuity PBKDF2 iteration count.");
  }
  const digest = requiredString(payload.ciphertextDigest, "Recovery archive ciphertext digest", 64);
  if (!/^[0-9a-f]{64}$/i.test(digest)) throw new Error("Recovery archive has an invalid ciphertext digest.");

  const salt = requiredString(payload.salt, "Recovery archive salt", 128);
  const iv = requiredString(payload.iv, "Recovery archive IV", 128);
  if (base64ToBytesStrict(salt, "Recovery archive salt").length !== 16) {
    throw new Error("Recovery archive salt must decode to 16 bytes.");
  }
  if (base64ToBytesStrict(iv, "Recovery archive IV").length !== 12) {
    throw new Error("Recovery archive IV must decode to 12 bytes.");
  }

  return value as unknown as BackupManifest;
}

export async function createArchive(
  snapshot: FiberSnapshot,
  nativeBackup: Uint8Array,
  password: string
): Promise<RecoveryArchive> {
  assertSnapshot(snapshot);
  if (!(nativeBackup instanceof Uint8Array)) throw new Error("Native backup must be a Uint8Array.");
  if (nativeBackup.byteLength === 0) throw new Error("Native recovery checkpoint cannot be empty.");
  if (nativeBackup.byteLength > MAX_NATIVE_BACKUP_BYTES) {
    throw new Error(`Native backup exceeds the browser archive limit of ${Math.floor(MAX_NATIVE_BACKUP_BYTES / 1024 / 1024)} MiB.`);
  }
  const createdAt = new Date().toISOString();

  const manifestBase: BackupManifest = {
    format: "fiber-continuity",
    formatVersion: 2,
    createdAt,
    payload: {
      cipher: "AES-GCM-256",
      kdf: "PBKDF2-SHA256",
      iterations: 310_000,
      salt: "",
      iv: "",
      aadVersion: 1,
      ciphertextDigest: ""
    }
  };

  const envelope: RecoveryEnvelope = {
    schemaVersion: 1,
    snapshot,
    nativeBackup: bytesToBase64(nativeBackup)
  };
  const plain = utf8(JSON.stringify(envelope));
  const encrypted = await encryptBytes(plain, password, publicAad(manifestBase), manifestBase.payload.iterations);
  if (encrypted.ciphertext.byteLength > MAX_CIPHERTEXT_BYTES) {
    throw new Error("Encrypted recovery payload exceeds the supported browser archive size limit.");
  }

  const manifest: BackupManifest = {
    ...manifestBase,
    payload: {
      ...manifestBase.payload,
      iterations: encrypted.iterations,
      salt: bytesToBase64(encrypted.salt),
      iv: bytesToBase64(encrypted.iv),
      ciphertextDigest: await sha256Hex(encrypted.ciphertext)
    }
  };

  return { manifest, ciphertext: bytesToBase64(encrypted.ciphertext) };
}

export async function validateArchive(archive: RecoveryArchive): Promise<void> {
  if (!isRecord(archive) || typeof archive.ciphertext !== "string") throw new Error("Not a FiberContinuity archive.");
  const manifest = parseManifest(archive.manifest);

  if (archive.ciphertext.length > Math.ceil(MAX_CIPHERTEXT_BYTES * 4 / 3) + 8) {
    throw new Error("Recovery archive exceeds the supported size limit.");
  }
  const bytes = base64ToBytesStrict(archive.ciphertext, "Recovery archive ciphertext");
  if (bytes.length > MAX_CIPHERTEXT_BYTES) throw new Error("Recovery archive exceeds the supported size limit.");
  if (bytes.length < 16) throw new Error("Recovery archive ciphertext is too short to contain an AES-GCM authentication tag.");

  const digest = await sha256Hex(bytes);
  if (digest !== manifest.payload.ciphertextDigest.toLowerCase()) {
    throw new Error("Encrypted payload corruption check failed.");
  }
}

export async function decryptArchive(
  archive: RecoveryArchive,
  password: string
): Promise<{ snapshot: FiberSnapshot; nativeBackup: Uint8Array }> {
  await validateArchive(archive);
  const plain = await decryptBytes(
    base64ToBytesStrict(archive.ciphertext, "Recovery archive ciphertext"),
    password,
    archive.manifest.payload.salt,
    archive.manifest.payload.iv,
    archive.manifest.payload.iterations,
    publicAad(archive.manifest)
  );

  let envelopeValue: unknown;
  try {
    envelopeValue = JSON.parse(text(plain));
  } catch {
    throw new Error("Authenticated recovery payload is not valid JSON.");
  }
  if (!isRecord(envelopeValue) || envelopeValue.schemaVersion !== 1 || typeof envelopeValue.nativeBackup !== "string") {
    throw new Error("Unsupported authenticated recovery payload schema.");
  }
  assertSnapshot(envelopeValue.snapshot);
  const nativeBackup = base64ToBytesStrict(envelopeValue.nativeBackup, "Authenticated native backup");
  if (nativeBackup.byteLength === 0) throw new Error("Authenticated native backup cannot be empty.");
  if (nativeBackup.byteLength > MAX_NATIVE_BACKUP_BYTES) {
    throw new Error("Authenticated native backup exceeds the supported browser size limit.");
  }
  return { snapshot: envelopeValue.snapshot, nativeBackup };
}

export function parseArchive(json: string): RecoveryArchive {
  if (utf8(json).byteLength > MAX_ARCHIVE_JSON_BYTES) {
    throw new Error("Recovery archive file is too large.");
  }
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    throw new Error("Recovery archive is not valid JSON.");
  }
  if (!isRecord(value) || typeof value.ciphertext !== "string") throw new Error("Not a FiberContinuity archive.");
  parseManifest(value.manifest);
  return value as unknown as RecoveryArchive;
}
