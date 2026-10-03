import { describe, expect, it } from "vitest";
import { DemoFiberAdapter } from "../src/adapters/DemoFiberAdapter";
import { createArchive, decryptArchive, validateArchive } from "../src/core/archive";
import { sha256Hex } from "../src/core/crypto";
import { base64ToBytes, bytesToBase64 } from "../src/core/encoding";

if (!globalThis.crypto?.subtle) throw new Error("Tests require Node 20+ Web Crypto.");

describe("recovery archive v2", () => {
  it("encrypts, validates and decrypts both snapshot and native backup", async () => {
    const adapter = new DemoFiberAdapter();
    const snapshot = await adapter.inspect();
    const native = await adapter.exportNativeBackup();
    const archive = await createArchive(snapshot, native, "very-good-password");

    expect(archive.manifest.formatVersion).toBe(2);
    expect(JSON.stringify(archive)).not.toContain(snapshot.nodeId);
    expect(JSON.stringify(archive)).not.toContain(snapshot.channels[0].id);
    await expect(validateArchive(archive)).resolves.toBeUndefined();

    const restored = await decryptArchive(archive, "very-good-password");
    expect(restored.snapshot.nodeId).toBe(snapshot.nodeId);
    expect(new TextDecoder().decode(restored.nativeBackup)).toEqual(new TextDecoder().decode(native));
  });

  it("rejects a wrong password", async () => {
    const adapter = new DemoFiberAdapter();
    const archive = await createArchive(await adapter.inspect(), await adapter.exportNativeBackup(), "very-good-password");
    await expect(decryptArchive(archive, "different-password")).rejects.toThrow(/authentication|password/i);
  });

  it("authenticates public manifest fields through AES-GCM AAD", async () => {
    const adapter = new DemoFiberAdapter();
    const archive = await createArchive(await adapter.inspect(), await adapter.exportNativeBackup(), "very-good-password");
    const tampered = structuredClone(archive);
    tampered.manifest.createdAt = "2030-01-01T00:00:00.000Z";
    await expect(decryptArchive(tampered, "very-good-password")).rejects.toThrow(/authentication/i);
  });

  it("rejects ciphertext tampering even when an attacker recomputes the public SHA-256 digest", async () => {
    const adapter = new DemoFiberAdapter();
    const archive = await createArchive(await adapter.inspect(), await adapter.exportNativeBackup(), "very-good-password");
    const tampered = structuredClone(archive);
    const bytes = base64ToBytes(tampered.ciphertext);
    bytes[Math.floor(bytes.length / 2)] ^= 0x01;
    tampered.ciphertext = bytesToBase64(bytes);
    tampered.manifest.payload.ciphertextDigest = await sha256Hex(bytes);

    await expect(validateArchive(tampered)).resolves.toBeUndefined();
    await expect(decryptArchive(tampered, "very-good-password")).rejects.toThrow(/authentication/i);
  });

  it("blocks legacy v1 archives rather than trusting unauthenticated metadata", async () => {
    const legacy = {
      manifest: { format: "fiber-continuity", formatVersion: 1, payload: {} },
      ciphertext: "AA=="
    } as never;
    await expect(validateArchive(legacy)).rejects.toThrow(/Legacy FiberContinuity v1/i);
  });
});
