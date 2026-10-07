import type { RecoveryPreflight } from "../core/types";
import StatusPill from "./StatusPill";

function compact(value: string) {
  return value.length > 22 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
}

export default function StateComparison({ preflight }: { preflight: RecoveryPreflight }) {
  const source = preflight.source;
  const target = preflight.target;
  const rows = [
    { label: "Network", source: source.network, target: target.network, matches: source.network === target.network },
    { label: "Network identity", source: compact(source.networkIdentity), target: compact(target.networkIdentity), matches: source.networkIdentity === target.networkIdentity },
    { label: "Node identity", source: compact(source.nodeId), target: compact(target.nodeId), matches: source.nodeId === target.nodeId, neutral: preflight.targetSafety.status === "safe" },
    { label: "Fiber version", source: source.fiberVersion, target: target.fiberVersion, matches: preflight.compatibility.status === "supported" },
    { label: "Channels", source: String(source.channels.length), target: String(target.channels.length), neutral: true },
    { label: "Payments", source: String(source.payments.length), target: target.capabilities.payments === "unavailable" ? "Unavailable" : String(target.payments.length), neutral: true },
    { label: "Invoices", source: String(source.invoices.length), target: target.capabilities.invoices === "unavailable" ? "Unavailable" : String(target.invoices.length), neutral: true }
  ];

  return (
    <div className="state-comparison">
      <div className="comparison-head"><span>Recovery source</span><span aria-hidden="true">→</span><span>Current target</span><span>Decision</span></div>
      {rows.map((row) => {
        const pass = row.matches || row.neutral;
        return (
          <div className="comparison-row" key={row.label}>
            <strong>{row.label}</strong>
            <code title={row.source}>{row.source}</code>
            <span aria-hidden="true">→</span>
            <code title={row.target}>{row.target}</code>
            <StatusPill status={pass ? "pass" : "fail"} />
          </div>
        );
      })}
    </div>
  );
}
