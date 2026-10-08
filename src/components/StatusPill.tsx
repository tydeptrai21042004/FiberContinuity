import type { CheckStatus } from "../core/types";

export default function StatusPill({ status }: { status: CheckStatus | "healthy" | "degraded" | "unsafe" | "expected" | "info" }) {
  return <span className={`pill pill-${status}`}>{status.toUpperCase()}</span>;
}
