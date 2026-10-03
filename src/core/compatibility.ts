import type { CompatibilityDecision } from "./types";

function normalize(version: string): string {
  return version.trim().replace(/^v/, "");
}

export function assessCompatibility(source: string, target: string): CompatibilityDecision {
  const from = normalize(source);
  const to = normalize(target);

  if (from === to) {
    return { status: "supported", reason: "Source and target Fiber versions match." };
  }

  if (to.startsWith("0.10.0-rc1") && !from.startsWith("0.10.0-rc1")) {
    return {
      status: "blocked",
      reason: "Fiber v0.10.0-rc1 explicitly does not support upgrades from older versions."
    };
  }

  if (from.startsWith("0.9.") && to.startsWith("0.9.")) {
    return {
      status: "review",
      reason: "Same minor release line, but the native Fiber migration/restore path must still approve the data."
    };
  }

  return {
    status: "review",
    reason: "No FiberContinuity compatibility rule is registered for this version pair; require explicit upstream verification."
  };
}
