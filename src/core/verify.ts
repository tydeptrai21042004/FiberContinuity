import type { FiberSnapshot, RecoveryCheck, RecoveryReport } from "./types";

function setEqual(a: string[], b: string[]) {
  return a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
}

export function verifyRecovery(before: FiberSnapshot, after: FiberSnapshot): RecoveryReport {
  const checks: RecoveryCheck[] = [
    {
      key: "network",
      label: "Network identity",
      status: before.network === after.network && before.networkIdentity === after.networkIdentity ? "pass" : "fail",
      detail: `${before.network}/${before.networkIdentity} → ${after.network}/${after.networkIdentity}`
    },
    {
      key: "identity",
      label: "Node identity",
      status: before.nodeId === after.nodeId ? "pass" : "fail",
      detail: before.nodeId === after.nodeId ? `Preserved ${after.nodeId}` : `${before.nodeId} → ${after.nodeId}`
    },
    {
      key: "channels",
      label: "Channel set",
      status: setEqual(before.channels.map(c => c.id), after.channels.map(c => c.id)) ? "pass" : "fail",
      detail: `${before.channels.length} before / ${after.channels.length} after`
    },
    {
      key: "payments",
      label: "Payment records",
      status: setEqual(before.payments.map(p => p.id), after.payments.map(p => p.id)) ? "pass" : "warn",
      detail: `${before.payments.length} before / ${after.payments.length} after`
    },
    {
      key: "invoices",
      label: "Invoice records",
      status: setEqual(before.invoices.map(p => p.id), after.invoices.map(p => p.id)) ? "pass" : "warn",
      detail: `${before.invoices.length} before / ${after.invoices.length} after`
    }
  ];

  const hardFailure = checks.some(c => c.status === "fail");
  const warning = checks.some(c => c.status === "warn");

  return {
    overall: hardFailure ? "unsafe" : warning ? "degraded" : "healthy",
    checkedAt: new Date().toISOString(),
    checks,
    before,
    after
  };
}
