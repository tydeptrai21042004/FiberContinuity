import type {
  ChannelSnapshot,
  FiberSnapshot,
  InvoiceSnapshot,
  PaymentSnapshot,
  RecordCoverage,
  RecoveryCheck,
  RecoveryReport
} from "./types";

function stableSort<T extends { id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.id.localeCompare(b.id));
}

function effectiveCoverage(a: RecordCoverage, b: RecordCoverage): RecordCoverage {
  if (a === "unavailable" || b === "unavailable") return "unavailable";
  if (a === "metadata" || b === "metadata") return "metadata";
  return "full";
}

function diffIds<T extends { id: string }>(before: T[], after: T[]): string {
  const a = new Set(before.map((item) => item.id));
  const b = new Set(after.map((item) => item.id));
  const missing = [...a].filter((id) => !b.has(id));
  const added = [...b].filter((id) => !a.has(id));
  const pieces: string[] = [];
  if (missing.length) pieces.push(`missing: ${missing.slice(0, 3).join(", ")}${missing.length > 3 ? "…" : ""}`);
  if (added.length) pieces.push(`added: ${added.slice(0, 3).join(", ")}${added.length > 3 ? "…" : ""}`);
  return pieces.join("; ");
}

function compareChannels(before: ChannelSnapshot[], after: ChannelSnapshot[], coverage: RecordCoverage): RecoveryCheck {
  if (coverage === "unavailable") {
    return { key: "channels", label: "Channel records", status: "unknown", detail: "Channel verification is unavailable in one or both snapshots." };
  }
  const fields: (keyof ChannelSnapshot)[] = coverage === "full"
    ? ["id", "peer", "state", "localBalance", "remoteBalance"]
    : ["id", "peer", "state"];
  const a = stableSort(before);
  const b = stableSort(after);
  const same = a.length === b.length && a.every((item, i) => fields.every((field) => item[field] === b[i]?.[field]));
  return {
    key: "channels",
    label: coverage === "full" ? "Channel state + balances" : "Channel metadata",
    status: same ? "pass" : "fail",
    detail: same
      ? `${a.length} channel record(s) preserved across ${fields.join(", ")}.`
      : `Channel recovery mismatch (${a.length} before / ${b.length} after). ${diffIds(a, b)}`.trim()
  };
}

function comparePayments(before: PaymentSnapshot[], after: PaymentSnapshot[], coverage: RecordCoverage): RecoveryCheck {
  if (coverage === "unavailable") {
    return { key: "payments", label: "Payment records", status: "unknown", detail: "Payment-history verification is unavailable in one or both snapshots." };
  }
  const fields: (keyof PaymentSnapshot)[] = coverage === "full" ? ["id", "status", "amount"] : ["id", "status"];
  const a = stableSort(before);
  const b = stableSort(after);
  const same = a.length === b.length && a.every((item, i) => fields.every((field) => item[field] === b[i]?.[field]));
  return {
    key: "payments",
    label: "Payment records",
    status: same ? "pass" : "warn",
    detail: same ? `${a.length} payment record(s) preserved.` : `Payment-history mismatch (${a.length} before / ${b.length} after). ${diffIds(a, b)}`.trim()
  };
}

function compareInvoices(before: InvoiceSnapshot[], after: InvoiceSnapshot[], coverage: RecordCoverage): RecoveryCheck {
  if (coverage === "unavailable") {
    return { key: "invoices", label: "Invoice records", status: "unknown", detail: "Invoice-history verification is unavailable in one or both snapshots." };
  }
  const fields: (keyof InvoiceSnapshot)[] = coverage === "full" ? ["id", "status", "amount"] : ["id", "status"];
  const a = stableSort(before);
  const b = stableSort(after);
  const same = a.length === b.length && a.every((item, i) => fields.every((field) => item[field] === b[i]?.[field]));
  return {
    key: "invoices",
    label: "Invoice records",
    status: same ? "pass" : "warn",
    detail: same ? `${a.length} invoice record(s) preserved.` : `Invoice-history mismatch (${a.length} before / ${b.length} after). ${diffIds(a, b)}`.trim()
  };
}

/** Canonical state representation used only for consistency/stability checks. */
export function comparableSnapshot(snapshot: FiberSnapshot): string {
  return JSON.stringify({
    adapter: snapshot.adapter,
    fiberVersion: snapshot.fiberVersion,
    network: snapshot.network,
    networkIdentity: snapshot.networkIdentity,
    nodeId: snapshot.nodeId,
    capabilities: snapshot.capabilities,
    channels: stableSort(snapshot.channels),
    payments: stableSort(snapshot.payments),
    invoices: stableSort(snapshot.invoices)
  });
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
    compareChannels(before.channels, after.channels, effectiveCoverage(before.capabilities.channels, after.capabilities.channels)),
    comparePayments(before.payments, after.payments, effectiveCoverage(before.capabilities.payments, after.capabilities.payments)),
    compareInvoices(before.invoices, after.invoices, effectiveCoverage(before.capabilities.invoices, after.capabilities.invoices))
  ];

  const hardFailure = checks.some((check) => check.status === "fail");
  const incomplete = checks.some((check) => check.status === "warn" || check.status === "unknown");

  return {
    overall: hardFailure ? "unsafe" : incomplete ? "degraded" : "healthy",
    checkedAt: new Date().toISOString(),
    checks,
    before,
    after
  };
}
