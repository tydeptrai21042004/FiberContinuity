import type { FiberAdapter } from "../adapters/FiberAdapter";
import type { RecoveryArchive, RecoveryReport } from "./types";
import { assessCompatibility } from "./compatibility";
import { createArchive, decryptArchive, validateArchive } from "./archive";
import { verifyRecovery } from "./verify";

export class FiberContinuity {
  constructor(private readonly adapter: FiberAdapter) {}

  inspect() {
    return this.adapter.inspect();
  }

  async createBackup(password: string): Promise<RecoveryArchive> {
    const snapshot = await this.adapter.inspect();
    const native = await this.adapter.exportNativeBackup();
    return createArchive(snapshot, native, password);
  }

  async preflight(archive: RecoveryArchive) {
    await validateArchive(archive);
    const target = await this.adapter.inspect();
    const compatibility = assessCompatibility(archive.manifest.source.fiberVersion, target.fiberVersion);
    const networkMatches = archive.manifest.source.network === target.network &&
      archive.manifest.source.networkIdentity === target.networkIdentity;

    return {
      networkMatches,
      compatibility,
      sourceNodeId: archive.manifest.source.nodeId,
      targetNodeId: target.nodeId
    };
  }

  async restore(archive: RecoveryArchive, password: string): Promise<RecoveryReport> {
    const preflight = await this.preflight(archive);
    if (!preflight.networkMatches) {
      throw new Error("Restore blocked: backup belongs to a different Fiber/CKB network identity.");
    }
    if (preflight.compatibility.status === "blocked") {
      throw new Error(`Restore blocked: ${preflight.compatibility.reason}`);
    }

    const native = await decryptArchive(archive, password);
    await this.adapter.restoreNativeBackup(native);
    await this.adapter.restartAfterRestore?.();
    const after = await this.adapter.inspect();
    return verifyRecovery(archive.snapshot, after);
  }
}
