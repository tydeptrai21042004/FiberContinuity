import type { BackupManifest, FiberSnapshot, RecoveryArchive } from "./types";
import { decryptBytes, encryptBytes, sha256Hex } from "./crypto";
import { base64ToBytes, bytesToBase64 } from "./encoding";

export async function createArchive(
  snapshot: FiberSnapshot,
  nativeBackup: Uint8Array,
  password: string
): Promise<RecoveryArchive> {
  const encrypted = await encryptBytes(nativeBackup, password);
  const ciphertextDigest = await sha256Hex(encrypted.ciphertext);
  const snapshotDigest = await sha256Hex(JSON.stringify(snapshot));

  const manifest: BackupManifest = {
    format: "fiber-continuity",
    formatVersion: 1,
    createdAt: new Date().toISOString(),
    source: {
      adapter: snapshot.adapter,
      fiberVersion: snapshot.fiberVersion,
      network: snapshot.network,
      networkIdentity: snapshot.networkIdentity,
      nodeId: snapshot.nodeId
    },
    snapshotDigest,
    payload: {
      cipher: "AES-GCM",
      kdf: "PBKDF2-SHA256",
      iterations: encrypted.iterations,
      salt: bytesToBase64(encrypted.salt),
      iv: bytesToBase64(encrypted.iv),
      ciphertextDigest
    }
  };

  return {
    manifest,
    ciphertext: bytesToBase64(encrypted.ciphertext),
    snapshot
  };
}

export async function validateArchive(archive: RecoveryArchive): Promise<void> {
  if (archive.manifest.format !== "fiber-continuity" || archive.manifest.formatVersion !== 1) {
    throw new Error("Unsupported FiberContinuity archive format.");
  }
  const digest = await sha256Hex(base64ToBytes(archive.ciphertext));
  if (digest !== archive.manifest.payload.ciphertextDigest) {
    throw new Error("Encrypted payload integrity check failed.");
  }
  const snapshotDigest = await sha256Hex(JSON.stringify(archive.snapshot));
  if (snapshotDigest !== archive.manifest.snapshotDigest) {
    throw new Error("Snapshot metadata integrity check failed.");
  }
}

export async function decryptArchive(archive: RecoveryArchive, password: string): Promise<Uint8Array> {
  await validateArchive(archive);
  return decryptBytes(
    base64ToBytes(archive.ciphertext),
    password,
    archive.manifest.payload.salt,
    archive.manifest.payload.iv
  );
}

export function parseArchive(json: string): RecoveryArchive {
  const value = JSON.parse(json) as RecoveryArchive;
  if (!value?.manifest || !value?.ciphertext || !value?.snapshot) throw new Error("Not a FiberContinuity archive.");
  return value;
}
