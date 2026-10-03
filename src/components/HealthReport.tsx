import type { RecoveryReport } from "../core/types";
import StatusPill from "./StatusPill";

export default function HealthReport({ report }: { report: RecoveryReport | null }) {
  if (!report) return <div className="empty">Run a restore to generate a recovery health report.</div>;
  return (
    <div>
      <div className="report-head">
        <div>
          <div className="eyebrow">RECOVERY HEALTH</div>
          <h3>{report.overall === "healthy" ? "State continuity verified" : "Review required"}</h3>
        </div>
        <StatusPill status={report.overall} />
      </div>
      <div className="checks">
        {report.checks.map((check) => (
          <div className="check" key={check.key}>
            <div>
              <strong>{check.label}</strong>
              <p>{check.detail}</p>
            </div>
            <StatusPill status={check.status} />
          </div>
        ))}
      </div>
    </div>
  );
}
