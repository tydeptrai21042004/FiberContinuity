import type { FiberSnapshot } from "../core/types";

function coverageLabel(value: "full" | "metadata" | "unavailable") {
  if (value === "full") return "full";
  if (value === "metadata") return "metadata";
  return "unavailable";
}

export default function SnapshotCard({ snapshot }: { snapshot: FiberSnapshot | null }) {
  if (!snapshot) return <div className="empty">No session snapshot loaded.</div>;
  const captured = new Date(snapshot.capturedAt);
  return (
    <div>
      <div className="snapshot-grid">
        <div><span>Fiber</span><strong>{snapshot.fiberVersion}</strong></div>
        <div><span>Network</span><strong>{snapshot.network}</strong></div>
        <div><span>Node ID</span><strong className="mono" title={snapshot.nodeId}>{snapshot.nodeId}</strong></div>
        <div><span>Channels</span><strong>{snapshot.channels.length}</strong><small>{coverageLabel(snapshot.capabilities.channels)} coverage</small></div>
        <div><span>Payments</span><strong>{snapshot.payments.length}</strong><small>{coverageLabel(snapshot.capabilities.payments)} coverage</small></div>
        <div><span>Invoices</span><strong>{snapshot.invoices.length}</strong><small>{coverageLabel(snapshot.capabilities.invoices)} coverage</small></div>
      </div>
      <div className="snapshot-meta">
        <span>Adapter <strong>{snapshot.adapter}</strong></span>
        <span>Captured <strong>{Number.isNaN(captured.getTime()) ? snapshot.capturedAt : captured.toLocaleString()}</strong></span>
        <span>Network identity <code>{snapshot.networkIdentity}</code></span>
      </div>
    </div>
  );
}
