import type { RecoveryPreflight } from "../core/types";
import StatusPill from "./StatusPill";

type ComparisonStatus = "pass" | "fail" | "warn" | "unknown" | "expected" | "info";

function compact(value: string) {
  return value.length > 22 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
}

export default function StateComparison({ preflight }: { preflight: RecoveryPreflight }) {
  const source = preflight.source;
  const target = preflight.target;
  const observed = (family: "channels" | "payments" | "invoices") =>
    source.capabilities[family] !== "unavailable" && target.capabilities[family] !== "unavailable";
  const rows: { label: string; source: string; target: string; status: ComparisonStatus; explanation: string }[] = [
    { label: "Network", source: source.network, target: target.network,
      status: preflight.networkMatches ? "pass" : "fail", explanation: "Network name and genesis identity must match." },
    { label: "Network identity", source: compact(source.networkIdentity), target: compact(target.networkIdentity),
      status: preflight.networkMatches ? "pass" : "fail", explanation: "Network identity must be known and match." },
    { label: "Node identity", source: compact(source.nodeId), target: compact(target.nodeId),
      status: source.nodeId === target.nodeId ? "pass" : preflight.targetSafety.status === "safe" ? "expected" : "warn",
      explanation: source.nodeId === target.nodeId ? "Node identity matches." : "Identity differs. This is not a PASS; a separate native target-safety decision is required." },
    { label: "Recovery adapter", source: source.adapter, target: target.adapter,
      status: source.adapter === target.adapter ? "pass" : "fail", explanation: "Cross-adapter restore is not supported." },
    { label: "Fiber version", source: source.fiberVersion, target: target.fiberVersion,
      status: preflight.compatibility.status === "supported" ? "pass" : preflight.compatibility.status === "review" ? "warn" : "fail",
      explanation: preflight.compatibility.reason },
    ...(["channels", "payments", "invoices"] as const).map((family) => ({
      label: family[0].toUpperCase() + family.slice(1),
      source: source.capabilities[family] === "unavailable" ? "Unavailable" : String(source[family].length),
      target: target.capabilities[family] === "unavailable" ? "Unavailable" : String(target[family].length),
      status: (observed(family) ? "info" : "unknown") as ComparisonStatus,
      explanation: observed(family)
        ? "Record counts are context only; equality does not establish safe recovery."
        : "At least one side cannot enumerate these records."
    }))
  ];

  return (
    <div className="state-comparison">
      <div className="comparison-head"><span>Recovery source</span><span aria-hidden="true">→</span><span>Current target</span><span>Decision</span></div>
      {rows.map((row) => {
        return (
          <div className="comparison-row" key={row.label}>
            <strong>{row.label}</strong>
            <code title={row.source}>{row.source}</code>
            <span className="comparison-arrow" aria-hidden="true">→</span>
            <code title={row.target}>{row.target}</code>
            <span className="comparison-decision" title={row.explanation}><StatusPill status={row.status} /></span>
          </div>
        );
      })}
    </div>
  );
}
