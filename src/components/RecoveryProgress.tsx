import type { RecoveryStage } from "../core/continuity";

const ordered: Array<{ stage: RecoveryStage; label: string }> = [
  { stage: "decrypting", label: "Authenticate archive" },
  { stage: "inspecting-target", label: "Recheck recovery target" },
  { stage: "capturing-rollback", label: "Capture rollback checkpoint" },
  { stage: "restoring", label: "Restore native state" },
  { stage: "restarting", label: "Restart Fiber integration" },
  { stage: "stabilizing", label: "Wait for stable state" },
  { stage: "verifying", label: "Verify recovered state" },
  { stage: "complete", label: "Recovery complete" }
];

export default function RecoveryProgress({ stage }: { stage: RecoveryStage | null }) {
  if (!stage) return null;
  const activeIndex = stage === "rolling-back" ? -1 : ordered.findIndex((item) => item.stage === stage);
  return (
    <div className="recovery-progress" role="status" aria-live="polite">
      <div className="progress-title"><strong>{stage === "rolling-back" ? "Restoring previous checkpoint" : "Recovery in progress"}</strong><span>{stage === "rolling-back" ? "ROLLBACK" : "DO NOT CLOSE THIS TAB"}</span></div>
      {stage === "rolling-back" ? (
        <div className="progress-rollback">The recovery operation failed. FiberContinuity is attempting to restore the pre-mutation checkpoint.</div>
      ) : (
        <ol>
          {ordered.map((item, index) => {
            const state = index < activeIndex ? "done" : index === activeIndex ? "active" : "pending";
            return <li className={state} key={item.stage}><span aria-hidden="true">{state === "done" ? "✓" : index + 1}</span><strong>{item.label}</strong></li>;
          })}
        </ol>
      )}
    </div>
  );
}
