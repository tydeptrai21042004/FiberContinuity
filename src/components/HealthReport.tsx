import type { RecoveryReport } from "../core/types";
import StatusPill from "./StatusPill";

export default function HealthReport({ report }: { report: RecoveryReport | null }) {
  if (!report) {
    return (
      <div className="empty-state">
        <div className="empty-icon">✓</div>
        <div><strong>No recovery evidence yet</strong><p>Run a restore to produce a structured state-continuity report.</p></div>
      </div>
    );
  }
  const passed = report.checks.filter((check) => check.status === "pass").length;
  const findings = report.checks.length - passed;
  return (
    <div>
      <div className="report-head">
        <div>
          <div className="eyebrow">RECOVERY HEALTH</div>
          <h3>{report.overall === "healthy" ? "State continuity verified" : report.overall === "unsafe" ? "Unsafe recovery findings" : "Recovery needs review"}</h3>
          <p>{passed}/{report.checks.length} checks passed · {findings} finding{findings === 1 ? "" : "s"} · {new Date(report.checkedAt).toLocaleString()}</p>
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
