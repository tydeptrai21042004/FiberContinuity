import { describe, expect, it } from "vitest";
import { DemoFiberAdapter } from "../src/adapters/DemoFiberAdapter";
import { createArchive, decryptArchive, validateArchive } from "../src/core/archive";

if (!globalThis.crypto?.subtle) {
  throw new Error("Tests require Node 20+ Web Crypto.");
}

describe("recovery archive", () => {
  it("encrypts, validates and decrypts native backup bytes", async () => {
    const adapter = new DemoFiberAdapter();
    const snapshot = await adapter.inspect();
    const native = await adapter.exportNativeBackup();
    const archive = await createArchive(snapshot, native, "very-good-password");
    await expect(validateArchive(archive)).resolves.toBeUndefined();
    const restored = await decryptArchive(archive, "very-good-password");
    expect(new TextDecoder().decode(restored)).toEqual(new TextDecoder().decode(native));
  });

  it("rejects a wrong password", async () => {
    const adapter = new DemoFiberAdapter();
    const archive = await createArchive(await adapter.inspect(), await adapter.exportNativeBackup(), "very-good-password");
    await expect(decryptArchive(archive, "different-password")).rejects.toThrow();
  });
});
