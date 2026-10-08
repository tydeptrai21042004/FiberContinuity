import type { CompatibilityDecision } from "./types";

interface ParsedVersion {
  raw: string;
  major: number;
  minor: number;
  patch: number;
  prerelease?: string;
}

function normalize(version: string): string {
  return version.trim().replace(/^v(?=\d)/i, "");
}

function parseVersion(version: string): ParsedVersion | undefined {
  const raw = normalize(version);
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(raw);
  if (!match || ![match[1], match[2], match[3]].every((n) => Number.isSafeInteger(Number(n)))) return undefined;
  return {
    raw,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease: match[4]
  };
}

function isRc1BreakingTarget(version: ParsedVersion): boolean {
  return version.major === 0 && version.minor === 10 && version.patch === 0 && version.prerelease === "rc1";
}

export function assessCompatibility(source: string, target: string): CompatibilityDecision {
  const from = parseVersion(source);
  const to = parseVersion(target);

  if (!from || !to) {
    return {
      status: "review",
      reason: "One or both Fiber versions are not valid semantic versions; require explicit upstream verification."
    };
  }

  if (from.raw === to.raw) {
    return { status: "supported", reason: "Source and target Fiber versions match." };
  }

  if (isRc1BreakingTarget(to) && !isRc1BreakingTarget(from)) {
    return {
      status: "blocked",
      reason: "Fiber v0.10.0-rc1 explicitly does not support upgrades from older versions."
    };
  }

  if (from.major === 0 && from.minor === 9 && to.major === 0 && to.minor === 9) {
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
