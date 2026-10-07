import { useEffect, useRef, useState } from "react";
import type { RecoveryPreflight } from "../core/types";

export default function RestoreConfirmDialog({
  open,
  preflight,
  onCancel,
  onConfirm
}: {
  open: boolean;
  preflight: RecoveryPreflight | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setAcknowledged(false);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog ref={ref} className="restore-dialog" onCancel={(event) => { event.preventDefault(); onCancel(); }} onClose={onCancel}>
      <div className="dialog-icon" aria-hidden="true">!</div>
      <div className="eyebrow">DESTRUCTIVE RECOVERY ACTION</div>
      <h2>Ready to restore Fiber state?</h2>
      <p>The current recovery target may be replaced. FiberContinuity will re-run safety checks and attempt to capture a rollback checkpoint immediately before mutation.</p>
      {preflight && (
        <dl className="confirm-summary">
          <div><dt>Network</dt><dd>{preflight.target.network}</dd></div>
          <div><dt>Target node</dt><dd className="mono">{preflight.target.nodeId}</dd></div>
          <div><dt>Recovery source</dt><dd className="mono">{preflight.source.nodeId}</dd></div>
          <div><dt>Fiber version</dt><dd>{preflight.source.fiberVersion} → {preflight.target.fiberVersion}</dd></div>
        </dl>
      )}
      <label className="confirm-check">
        <input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />
        <span>I reviewed the source and target comparison and understand that this operation can replace local Fiber recovery state.</span>
      </label>
      <div className="dialog-actions">
        <button type="button" onClick={onCancel} autoFocus>Cancel</button>
        <button type="button" className="danger" disabled={!acknowledged} onClick={onConfirm}>Restore Fiber state</button>
      </div>
    </dialog>
  );
}
