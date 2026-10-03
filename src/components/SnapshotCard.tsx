import type { FiberSnapshot } from "../core/types";

export default function SnapshotCard({ snapshot }: { snapshot: FiberSnapshot | null }) {
  if (!snapshot) return <div className="empty">No session snapshot loaded.</div>;
  return (
    <div className="snapshot-grid">
      <div><span>Fiber</span><strong>{snapshot.fiberVersion}</strong></div>
      <div><span>Network</span><strong>{snapshot.network}</strong></div>
      <div><span>Node ID</span><strong className="mono">{snapshot.nodeId}</strong></div>
      <div><span>Channels</span><strong>{snapshot.channels.length}</strong></div>
      <div><span>Payments</span><strong>{snapshot.payments.length}</strong></div>
      <div><span>Invoices</span><strong>{snapshot.invoices.length}</strong></div>
    </div>
  );
}
