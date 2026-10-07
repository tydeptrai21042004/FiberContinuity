import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import packageJson from "../package.json";
import { DemoFiberAdapter, type DemoFaultScenario } from "./adapters/DemoFiberAdapter";
import { FiberContinuity, type RecoveryStage } from "./core/continuity";
import { MAX_ARCHIVE_JSON_BYTES, decryptArchive, parseArchive, validateArchive } from "./core/archive";
import type { FiberSnapshot, RecoveryArchive, RecoveryPreflight, RecoveryReport } from "./core/types";
import { downloadJson, readTextFile } from "./browser/files";
import SnapshotCard from "./components/SnapshotCard";
import HealthReport from "./components/HealthReport";
import StatusPill from "./components/StatusPill";
import FlowStepper from "./components/FlowStepper";
import OperationBanner, { type OperationNotice } from "./components/OperationBanner";
import PasswordField from "./components/PasswordField";
import ArchivePicker from "./components/ArchivePicker";
import ArchiveStatusCard from "./components/ArchiveStatusCard";
import StateComparison from "./components/StateComparison";
import RecoveryProgress from "./components/RecoveryProgress";
import RestoreConfirmDialog from "./components/RestoreConfirmDialog";

const APP_VERSION = packageJson.version;
const DEMO_PASSWORD = "fiber-demo-2026";

type AppView = "overview" | "protect" | "recover" | "evidence" | "demo";

type ArchiveOrigin = "created" | "imported" | null;

const scenarioCopy: Record<DemoFaultScenario, { title: string; detail: string; tone: string }> = {
  "state-loss": {
    title: "Browser state loss",
    detail: "Empties local recovery records to demonstrate the normal restore path.",
    tone: "Expected: restore allowed"
  },
  "stale-state": {
    title: "Same identity, newer state",
    detail: "Mutates channel/payment state while keeping the same node identity.",
    tone: "Expected: review / blocked"
  },
  "foreign-node": {
    title: "Foreign live node",
    detail: "Keeps live records but changes the target node identity.",
    tone: "Expected: blocked"
  },
  "network-mismatch": {
    title: "Network mismatch",
    detail: "Changes the target network identity while preserving otherwise valid state.",
    tone: "Expected: blocked"
  }
};

const navigation: Array<{ id: AppView; label: string; description: string }> = [
  { id: "overview", label: "Overview", description: "System and recovery status" },
  { id: "protect", label: "Create backup", description: "Protect the current state" },
  { id: "recover", label: "Recover", description: "Restore from an archive" },
  { id: "evidence", label: "Evidence", description: "Verification and reports" },
  { id: "demo", label: "Demo lab", description: "Simulated failure scenarios" }
];

function isPreflightSafe(value: RecoveryPreflight | null) {
  return Boolean(value && value.networkMatches && value.compatibility.status === "supported" && value.targetSafety.status === "safe");
}

function coverageSummary(snapshot: FiberSnapshot | null) {
  if (!snapshot) return "Unknown";
  const values = Object.values(snapshot.capabilities);
  if (values.every((value) => value === "full")) return "Full";
  if (values.some((value) => value === "unavailable")) return "Limited";
  return "Metadata";
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}

export default function App() {
  const adapter = useMemo(() => new DemoFiberAdapter(), []);
  const continuity = useMemo(() => new FiberContinuity(adapter), [adapter]);
  const [view, setView] = useState<AppView>("overview");
  const [snapshot, setSnapshot] = useState<FiberSnapshot | null>(null);
  const [archive, setArchive] = useState<RecoveryArchive | null>(null);
  const [archiveOrigin, setArchiveOrigin] = useState<ArchiveOrigin>(null);
  const [archiveAuthenticated, setArchiveAuthenticated] = useState(false);
  const [archiveSource, setArchiveSource] = useState<FiberSnapshot | null>(null);
  const [archiveSaved, setArchiveSaved] = useState(false);
  const [preflight, setPreflight] = useState<RecoveryPreflight | null>(null);
  const [report, setReport] = useState<RecoveryReport | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [scenario, setScenario] = useState<DemoFaultScenario>("state-loss");
  const [lastAction, setLastAction] = useState("Session inspection");
  const [notice, setNotice] = useState<OperationNotice>({
    kind: "idle",
    title: "Reference environment ready",
    detail: "This build uses a deterministic Fiber testnet adapter. Recovery data stays in this browser."
  });
  const [recoveryStage, setRecoveryStage] = useState<RecoveryStage | null>(null);
  const [confirmRestore, setConfirmRestore] = useState(false);

  const safe = isPreflightSafe(preflight);
  const passwordReady = password.length >= 12;
  const passwordConfirmed = passwordReady && password === confirmPassword;

  const refresh = async () => {
    const next = await continuity.inspect();
    setSnapshot(next);
    return next;
  };

  useEffect(() => {
    void refresh().catch((error) => setNotice({ kind: "error", title: "Session inspection failed", detail: errorText(error) }));
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [view]);

  async function run(label: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setNotice({ kind: "working", title: label });
    try {
      await fn();
      setLastAction(label.replace(/…$/, ""));
    } catch (error) {
      setRecoveryStage(null);
      setNotice({ kind: "error", title: "Operation stopped safely", detail: errorText(error) });
    } finally {
      setBusy(false);
    }
  }

  function invalidateAuthentication(nextPassword: string) {
    setPassword(nextPassword);
    if (archiveAuthenticated || preflight) {
      setArchiveAuthenticated(false);
      setArchiveSource(null);
      setPreflight(null);
      setNotice({ kind: "warning", title: "Archive authentication cleared", detail: "The recovery password changed. Authenticate the archive and run safety checks again." });
    }
  }

  const makeBackup = () => run("Creating encrypted recovery archive…", async () => {
    if (!passwordConfirmed) throw new Error("Enter matching recovery passwords of at least 12 characters.");
    const next = await continuity.createBackup(password);
    setArchive(next);
    setArchiveOrigin("created");
    setArchiveAuthenticated(false);
    setArchiveSource(null);
    setArchiveSaved(false);
    setPreflight(null);
    setReport(null);
    setNotice({
      kind: "warning",
      title: "Encrypted archive created — save it before relying on it",
      detail: "The archive exists only in this browser session until you download a copy. Keep the recovery password separately."
    });
  });

  function saveArchive() {
    if (!archive) return;
    downloadJson(`fiber-continuity-${Date.now()}.fcr.json`, archive);
    setArchiveSaved(true);
    setNotice({ kind: "success", title: "Archive download requested", detail: "Your browser controls the final save location. Re-import the saved file from Recover if you want to verify that copy." });
  }

  async function importArchive(file: File) {
    await run("Checking archive structure and integrity…", async () => {
      if (file.size > MAX_ARCHIVE_JSON_BYTES) {
        throw new Error(`Archive is too large (${Math.ceil(file.size / 1024 / 1024)} MiB). Maximum supported JSON size is ${Math.floor(MAX_ARCHIVE_JSON_BYTES / 1024 / 1024)} MiB.`);
      }
      const parsed = parseArchive(await readTextFile(file));
      await validateArchive(parsed);
      setArchive(parsed);
      setPassword("");
      setConfirmPassword("");
      setArchiveOrigin("imported");
      setArchiveAuthenticated(false);
      setArchiveSource(null);
      setArchiveSaved(true);
      setPreflight(null);
      setReport(null);
      setRecoveryStage(null);
      setNotice({
        kind: "success",
        title: "Archive loaded and integrity checked",
        detail: "The encrypted payload has not been authenticated yet. Enter the recovery password to unlock it."
      });
    });
  }

  const authenticateArchive = () => run("Authenticating encrypted archive…", async () => {
    if (!archive) throw new Error("Select a recovery archive first.");
    if (!passwordReady) throw new Error("Enter the recovery password (minimum 12 characters)." );
    const decoded = await decryptArchive(archive, password);
    setArchiveAuthenticated(true);
    setArchiveSource(decoded.snapshot);
    setPreflight(null);
    setNotice({
      kind: "success",
      title: "Archive authenticated",
      detail: `Authenticated source: ${decoded.snapshot.network} · Fiber ${decoded.snapshot.fiberVersion} · ${decoded.snapshot.channels.length} channel(s).`
    });
  });

  const checkPreflight = () => run("Running recovery safety checks…", async () => {
    if (!archive) throw new Error("Select a recovery archive first.");
    if (!archiveAuthenticated) throw new Error("Authenticate the recovery archive before running target safety checks.");
    const next = await continuity.preflight(archive, password);
    setPreflight(next);
    setArchiveSource(next.source);
    setReport(null);
    setNotice(isPreflightSafe(next)
      ? { kind: "success", title: "Recovery target is safe to proceed", detail: "Network, compatibility and target-safety gates passed. Review the source ↔ target comparison before restoring." }
      : { kind: "warning", title: "Recovery is blocked", detail: "At least one fail-closed gate rejected or could not prove the current target safe. No mutation has occurred." });
  });

  const restore = () => run("Recovering Fiber state…", async () => {
    if (!archive) throw new Error("Select a recovery archive first.");
    if (!archiveAuthenticated) throw new Error("Authenticate the recovery archive first.");
    if (!safe || !preflight) throw new Error("Run preflight and obtain an explicit SAFE decision before restoring.");
    setRecoveryStage("decrypting");
    const next = await continuity.restore(archive, password, (event) => setRecoveryStage(event.stage));
    setReport(next);
    setPreflight(null);
    await refresh();
    setNotice(next.overall === "healthy"
      ? { kind: "success", title: "Recovery verified — HEALTHY", detail: "The recovered observable Fiber state matches the authenticated recovery source." }
      : { kind: "warning", title: "Recovery completed with findings", detail: "Review the verification report before treating continuity as complete." });
    setView("evidence");
  });

  const applyFault = () => run(`Applying ${scenarioCopy[scenario].title.toLowerCase()}…`, async () => {
    if (!archive) throw new Error("Create a demo archive before applying a fault scenario.");
    adapter.applyFaultScenario(scenario);
    await refresh();
    setPreflight(null);
    setReport(null);
    setRecoveryStage(null);
    setNotice({ kind: "warning", title: `${scenarioCopy[scenario].title} applied`, detail: "This is simulated demo state only. Open Recover and run the safety workflow, or use the guided demo." });
  });

  const guidedDemo = () => run("Running guided recovery demonstration…", async () => {
    setPassword(DEMO_PASSWORD);
    setConfirmPassword(DEMO_PASSWORD);
    const nextArchive = await continuity.createBackup(DEMO_PASSWORD);
    setArchive(nextArchive);
    setArchiveOrigin("created");
    setArchiveSaved(false);
    setArchiveAuthenticated(true);
    const decoded = await decryptArchive(nextArchive, DEMO_PASSWORD);
    setArchiveSource(decoded.snapshot);

    adapter.applyFaultScenario("state-loss");
    await refresh();
    const nextPreflight = await continuity.preflight(nextArchive, DEMO_PASSWORD);
    setPreflight(nextPreflight);
    if (!isPreflightSafe(nextPreflight)) throw new Error("Guided demo stopped because preflight did not pass.");

    const nextReport = await continuity.restore(nextArchive, DEMO_PASSWORD, (event) => setRecoveryStage(event.stage));
    setReport(nextReport);
    setPreflight(null);
    await refresh();
    setNotice(nextReport.overall === "healthy"
      ? { kind: "success", title: "Guided demo complete — HEALTHY", detail: "Backup → simulated loss → authenticated preflight → restore → verification completed." }
      : { kind: "warning", title: "Guided demo completed with findings", detail: "Review the recovery evidence for details." });
  });

  const reset = () => run("Resetting reference environment…", async () => {
    adapter.reset();
    setArchive(null);
    setArchiveOrigin(null);
    setArchiveAuthenticated(false);
    setArchiveSource(null);
    setArchiveSaved(false);
    setPreflight(null);
    setReport(null);
    setScenario("state-loss");
    setPassword("");
    setConfirmPassword("");
    setRecoveryStage(null);
    await refresh();
    setNotice({ kind: "success", title: "Reference environment reset", detail: "Deterministic testnet state has been restored to its baseline." });
  });

  function exportEvidence() {
    const evidence = {
      schemaVersion: "fiber-continuity-review-evidence-v1",
      generatedAt: new Date().toISOString(),
      application: {
        name: "FiberContinuity",
        version: APP_VERSION,
        mode: "deterministic-demo",
        runtime: typeof navigator !== "undefined" ? navigator.userAgent : "browser"
      },
      archiveManifest: archive?.manifest ?? null,
      archiveAuthenticated,
      archiveSource,
      preflight,
      recoveryReport: report,
      currentSnapshot: snapshot,
      guarantees: {
        clientSideOnly: true,
        archivePayloadAuthenticated: archiveAuthenticated,
        compatibilityFailClosed: true,
        targetSafetyFailClosed: true,
        targetRaceGuard: true,
        postRestoreVerification: true
      }
    };
    downloadJson(`fiber-continuity-evidence-${Date.now()}.json`, evidence);
  }

  const backupSteps = [
    { label: "Inspect", detail: snapshot ? "Current state visible" : "Loading", state: snapshot ? "done" : "active" },
    { label: "Password", detail: passwordConfirmed ? "Confirmed" : "Create a passphrase", state: passwordConfirmed ? "done" : snapshot ? "active" : "pending" },
    { label: "Create", detail: archiveOrigin === "created" ? "Encrypted archive ready" : "Pending", state: archiveOrigin === "created" ? "done" : passwordConfirmed ? "active" : "pending" },
    { label: "Save", detail: archiveOrigin === "created" && archiveSaved ? "Download requested" : "Keep an offline copy", state: archiveOrigin === "created" && archiveSaved ? "done" : archiveOrigin === "created" ? "active" : "pending" }
  ] as const;

  const recoverySteps = [
    { label: "Archive", detail: archive ? "Integrity checked" : "Select a backup", state: archive ? "done" : "active" },
    { label: "Authenticate", detail: archiveAuthenticated ? "Password verified" : "Unlock locally", state: archiveAuthenticated ? "done" : archive ? "active" : "pending" },
    { label: "Safety check", detail: preflight ? (safe ? "Safe" : "Blocked") : "Compare source and target", state: preflight ? (safe ? "done" : "blocked") : archiveAuthenticated ? "active" : "pending" },
    { label: "Restore", detail: report ? "Mutation complete" : safe ? "Confirmation required" : "Locked", state: report ? "done" : safe ? "active" : "pending" },
    { label: "Verify", detail: report ? report.overall.toUpperCase() : "Post-restore evidence", state: report ? "done" : "pending" }
  ] as const;

  return (
    <main className="app-frame">
      <header className="topbar">
        <button className="brand brand-button" type="button" onClick={() => setView("overview")} aria-label="Open FiberContinuity overview">
          <span className="brand-mark">FC</span><span>FiberContinuity</span><small>v{APP_VERSION}</small>
        </button>
        <div className="top-actions">
          <span className="environment-badge"><i /> REFERENCE · TESTNET</span>
          <a href="https://github.com/tydeptrai21042004/FiberContinuity" target="_blank" rel="noreferrer">Source ↗</a>
          <a href="https://github.com/nervosnetwork/fiber" target="_blank" rel="noreferrer">Fiber ↗</a>
        </div>
      </header>

      <div className="shell">
        <aside className="sidebar" aria-label="Application navigation">
          <nav>
            {navigation.map((item) => (
              <button key={item.id} className={view === item.id ? "active" : ""} type="button" onClick={() => setView(item.id)}>
                <strong>{item.label}</strong><small>{item.description}</small>
              </button>
            ))}
          </nav>
          <div className="sidebar-status">
            <span>Environment</span><strong>Deterministic testnet</strong>
            <span>Adapter</span><strong>{snapshot?.adapter ?? "Inspecting…"}</strong>
            <span>Coverage</span><strong>{coverageSummary(snapshot)}</strong>
            <span>Last action</span><strong>{lastAction}</strong>
          </div>
          <div className="privacy-note"><strong>Local by design</strong><p>No recovery archive, password, seed phrase or recovery payload is uploaded by this reference UI.</p></div>
        </aside>

        <section className="workspace">
          <OperationBanner notice={notice} />

          {view === "overview" && (
            <>
              <div className="page-heading">
                <div><div className="eyebrow">RECOVERY CONTINUITY</div><h1>Protect or recover Fiber state.</h1><p>A fail-closed local recovery workflow around native Fiber backup and restore primitives.</p></div>
                <div className="environment-card"><span className="status-light" /><div><small>Active environment</small><strong>Reference adapter · CKB testnet</strong><p>Demo state only. A live deployment must supply reviewed upstream recovery hooks.</p></div></div>
              </div>

              <div className="action-grid">
                <button className="action-card" type="button" onClick={() => setView("protect")}><span>01</span><strong>Create a backup</strong><p>Inspect the current node, encrypt native recovery bytes and save a portable archive.</p><b>Create backup →</b></button>
                <button className="action-card featured" type="button" onClick={() => setView("recover")}><span>02</span><strong>Recover from backup</strong><p>Authenticate an archive, compare source and target, then restore only after a safe preflight.</p><b>Start recovery →</b></button>
                <button className="action-card" type="button" onClick={() => setView("evidence")}><span>03</span><strong>Review evidence</strong><p>Inspect post-recovery health checks and export machine-readable evidence.</p><b>Open evidence →</b></button>
              </div>

              <section className="panel">
                <div className="panel-title"><div><span>LIVE</span><div><h2>Current recovery target</h2><p>Observable state used by fail-closed target safety and post-restore verification.</p></div></div><button disabled={busy} onClick={() => void run("Refreshing current recovery target…", async () => { await refresh(); setNotice({ kind: "success", title: "Current target refreshed" }); })}>Refresh</button></div>
                <SnapshotCard snapshot={snapshot} />
              </section>

              <section className="trust-grid" aria-label="Recovery safety properties">
                <article><span>01</span><strong>Authenticated archives</strong><p>Snapshot metadata and native backup bytes are protected together inside AES-GCM.</p></article>
                <article><span>02</span><strong>Fail-closed mutation</strong><p>Unknown compatibility or target safety never silently becomes permission to restore.</p></article>
                <article><span>03</span><strong>Race recheck</strong><p>The target is checked again while the rollback checkpoint is captured immediately before mutation.</p></article>
                <article><span>04</span><strong>Explicit evidence</strong><p>Recovery is not complete until observable state has stabilized and verification is reported.</p></article>
              </section>
            </>
          )}

          {view === "protect" && (
            <>
              <div className="page-heading compact"><div><div className="eyebrow">CREATE BACKUP</div><h1>Protect the current Fiber state.</h1><p>Create an encrypted archive locally, then save a copy before treating backup as complete.</p></div></div>
              <FlowStepper ariaLabel="Backup workflow" steps={[...backupSteps]} />

              <section className="panel">
                <div className="panel-title"><div><span>01</span><div><h2>Inspect current node</h2><p>Confirm the environment and recovery coverage before protecting it.</p></div></div><button disabled={busy} onClick={() => void run("Refreshing session inspection…", async () => { await refresh(); setNotice({ kind: "success", title: "Session inspection refreshed" }); })}>Refresh</button></div>
                <SnapshotCard snapshot={snapshot} />
              </section>

              <div className="two-column">
                <section className="panel">
                  <div className="panel-title"><div><span>02</span><div><h2>Choose recovery password</h2><p>The password is not stored by FiberContinuity. Keep it separately from the archive.</p></div></div></div>
                  <PasswordField value={password} onChange={invalidateAuthentication} autoComplete="new-password" hint={passwordReady ? "longer passphrases are recommended" : undefined} />
                  <PasswordField value={confirmPassword} onChange={setConfirmPassword} label="Confirm recovery password" autoComplete="new-password" hint={confirmPassword.length === 0 ? "repeat the password" : password === confirmPassword ? "matches" : "does not match"} />
                  <div className={`inline-callout ${passwordConfirmed ? "success" : "neutral"}`}><strong>{passwordConfirmed ? "Password ready" : "Use a long unique passphrase"}</strong><p>The core enforces a 12-character minimum; production use should prefer a substantially longer passphrase.</p></div>
                  <button className="primary full-width" disabled={busy || !snapshot || !passwordConfirmed} onClick={() => void makeBackup()}>Create encrypted archive</button>
                </section>

                <section className="panel">
                  <div className="panel-title"><div><span>03</span><div><h2>Save recovery archive</h2><p>Creating an archive in memory is not the same as having a durable backup.</p></div></div></div>
                  {archive && archiveOrigin === "created" ? (
                    <ArchiveStatusCard archive={archive} authenticated={archiveAuthenticated} preflight={preflight} saved={archiveSaved} onDownload={saveArchive} />
                  ) : (
                    <div className="empty-state"><div className="empty-icon">◆</div><div><strong>No newly-created archive yet</strong><p>Create an encrypted archive to enable local download.</p></div></div>
                  )}
                  {archiveOrigin === "created" && archiveSaved && <div className="success-completion"><span>✓</span><div><strong>Archive download requested</strong><p>Keep the recovery password somewhere separate. Re-import the saved file from Recover to verify that local copy.</p></div></div>}
                </section>
              </div>
            </>
          )}

          {view === "recover" && (
            <>
              <div className="page-heading compact"><div><div className="eyebrow">RECOVER</div><h1>Restore only after the target is proven safe.</h1><p>Archive authentication, source ↔ target comparison and an explicit preflight decision are required before mutation.</p></div></div>
              <FlowStepper ariaLabel="Recovery workflow" steps={[...recoverySteps]} />

              <div className="two-column recovery-top">
                <section className="panel">
                  <div className="panel-title"><div><span>01</span><div><h2>Select recovery archive</h2><p>Structure and corruption checks run locally before the encrypted payload is opened.</p></div></div></div>
                  {!archive ? <ArchivePicker disabled={busy} onFile={(file) => void importArchive(file)} /> : (
                    <>
                      <ArchiveStatusCard archive={archive} authenticated={archiveAuthenticated} preflight={preflight} saved={archiveSaved} />
                      <div className="split-actions"><ArchivePicker disabled={busy} onFile={(file) => void importArchive(file)} /><button type="button" className="ghost" disabled={busy} onClick={() => { setArchive(null); setArchiveOrigin(null); setArchiveAuthenticated(false); setArchiveSource(null); setPreflight(null); setPassword(""); setConfirmPassword(""); setRecoveryStage(null); }}>Clear archive</button></div>
                    </>
                  )}
                </section>

                <section className="panel">
                  <div className="panel-title"><div><span>02</span><div><h2>Authenticate archive</h2><p>Only successful AES-GCM authentication proves the encrypted recovery payload belongs to this password.</p></div></div></div>
                  <PasswordField value={password} onChange={invalidateAuthentication} />
                  <button className="primary full-width" disabled={busy || !archive || !passwordReady || archiveAuthenticated} onClick={() => void authenticateArchive()}>{archiveAuthenticated ? "Archive authenticated" : "Authenticate archive"}</button>
                  {archiveSource && (
                    <div className="source-summary">
                      <div><span>Source network</span><strong>{archiveSource.network}</strong></div>
                      <div><span>Fiber</span><strong>{archiveSource.fiberVersion}</strong></div>
                      <div><span>Node ID</span><strong className="mono" title={archiveSource.nodeId}>{archiveSource.nodeId}</strong></div>
                      <div><span>Channels</span><strong>{archiveSource.channels.length}</strong></div>
                    </div>
                  )}
                </section>
              </div>

              <section className="panel">
                <div className="panel-title"><div><span>03</span><div><h2>Compare source and current target</h2><p>The current target is inspected after archive authentication. Unknown or unsafe state blocks recovery.</p></div></div><button disabled={busy || !archiveAuthenticated} onClick={() => void checkPreflight()}>Run safety check</button></div>
                {!preflight ? (
                  <div className="empty-state"><div className="empty-icon">↔</div><div><strong>No safety decision yet</strong><p>Authenticate the archive, then run the target comparison. Restore remains locked until a SAFE result exists.</p></div></div>
                ) : (
                  <>
                    <div className={`decision-banner ${safe ? "allowed" : "blocked"}`}>
                      <div><span>{safe ? "✓" : "×"}</span><div><strong>{safe ? "RECOVERY TARGET SAFE" : "RECOVERY BLOCKED"}</strong><p>{safe ? "All required fail-closed gates passed. Review the comparison before confirming mutation." : "At least one gate rejected or could not prove the target safe. No mutation has occurred."}</p></div></div>
                      <StatusPill status={safe ? "pass" : "fail"} />
                    </div>
                    <StateComparison preflight={preflight} />
                    <div className="preflight-checks">
                      <div><strong>Network identity</strong><p>{preflight.networkMatches ? "Source and target network identities match." : "Network mismatch blocks restore."}</p><StatusPill status={preflight.networkMatches ? "pass" : "fail"} /></div>
                      <div><strong>Fiber compatibility</strong><p>{preflight.compatibility.reason}</p><StatusPill status={preflight.compatibility.status === "supported" ? "pass" : preflight.compatibility.status === "blocked" ? "fail" : "unknown"} /></div>
                      <div><strong>Target safety</strong><p>{preflight.targetSafety.reason}</p><StatusPill status={preflight.targetSafety.status === "safe" ? "pass" : preflight.targetSafety.status === "blocked" ? "fail" : "unknown"} /></div>
                    </div>
                  </>
                )}
              </section>

              <section className="panel restore-panel">
                <div className="panel-title"><div><span>04</span><div><h2>Restore and verify</h2><p>The restore button is available only after an explicitly safe preflight. Safety checks run again immediately before mutation.</p></div></div></div>
                <RecoveryProgress stage={recoveryStage} />
                {!busy && !report && <div className={`restore-gate ${safe ? "ready" : "locked"}`}><span aria-hidden="true">{safe ? "✓" : "⌁"}</span><div><strong>{safe ? "Ready for final confirmation" : "Restore locked"}</strong><p>{safe ? "Review the source and target comparison, then confirm the destructive action." : "Authenticate the archive and obtain a SAFE preflight decision first."}</p></div></div>}
                <button className="danger full-width restore-button" disabled={busy || !archive || !archiveAuthenticated || !safe || !preflight} onClick={() => setConfirmRestore(true)}>Review and confirm restore</button>
              </section>
            </>
          )}

          {view === "evidence" && (
            <>
              <div className="page-heading compact"><div><div className="eyebrow">EVIDENCE</div><h1>Recovery health and reproducible evidence.</h1><p>Verification distinguishes a healthy match from degraded or unsafe findings, including explicitly unavailable coverage.</p></div></div>
              <section className="panel">
                <div className="panel-title"><div><span>01</span><div><h2>Recovery report</h2><p>Post-stabilization checks against the authenticated source snapshot.</p></div></div><div className="panel-actions">{report && <button onClick={() => downloadJson(`fiber-continuity-report-${Date.now()}.json`, report)}>Report JSON</button>}<button disabled={!snapshot && !report && !preflight} onClick={exportEvidence}>Evidence bundle</button></div></div>
                <HealthReport report={report} />
              </section>
              <section className="panel technical-evidence">
                <div className="panel-title"><div><span>02</span><div><h2>Evidence context</h2><p>Current reference-environment facts included in the exported reviewer artifact.</p></div></div></div>
                <div className="evidence-facts">
                  <div><span>Application</span><strong>FiberContinuity v{APP_VERSION}</strong></div>
                  <div><span>Environment</span><strong>Deterministic testnet</strong></div>
                  <div><span>Archive</span><strong>{archive ? (archiveAuthenticated ? "Authenticated" : "Loaded, locked") : "None"}</strong></div>
                  <div><span>Target race guard</span><strong>Enabled</strong></div>
                  <div><span>Server upload</span><strong>None</strong></div>
                  <div><span>Current coverage</span><strong>{coverageSummary(snapshot)}</strong></div>
                </div>
              </section>
            </>
          )}

          {view === "demo" && (
            <>
              <div className="demo-banner"><strong>DEMO ENVIRONMENT</strong><span>Simulated Fiber testnet state · No real funds · Fault controls are intentionally isolated from the recovery workflow.</span></div>
              <div className="page-heading compact"><div><div className="eyebrow">DEMO LAB</div><h1>Exercise recovery and fail-closed scenarios.</h1><p>Use the deterministic adapter to reproduce expected success, stale-state, foreign-node and network-mismatch behavior.</p></div><button className="primary" disabled={busy} onClick={() => void guidedDemo()}>Run guided recovery demo</button></div>

              <div className="two-column">
                <section className="panel">
                  <div className="panel-title"><div><span>01</span><div><h2>Scenario controls</h2><p>Create a demo archive first, then mutate the reference target intentionally.</p></div></div></div>
                  <label className="field"><span>Fault scenario</span><select value={scenario} onChange={(event: ChangeEvent<HTMLSelectElement>) => setScenario(event.target.value as DemoFaultScenario)} disabled={busy}>{Object.entries(scenarioCopy).map(([value, item]) => <option key={value} value={value}>{item.title}</option>)}</select></label>
                  <div className="scenario-info"><strong>{scenarioCopy[scenario].title}</strong><p>{scenarioCopy[scenario].detail}</p><small>{scenarioCopy[scenario].tone}</small></div>
                  <button className="primary full-width" disabled={busy} onClick={() => void run("Creating demo archive…", async () => { setPassword(DEMO_PASSWORD); setConfirmPassword(DEMO_PASSWORD); const next = await continuity.createBackup(DEMO_PASSWORD); setArchive(next); setArchiveOrigin("created"); setArchiveAuthenticated(true); setArchiveSource((await decryptArchive(next, DEMO_PASSWORD)).snapshot); setArchiveSaved(false); setPreflight(null); setReport(null); setNotice({ kind: "success", title: "Demo archive ready", detail: "The demo password was filled automatically only inside Demo lab." }); })}>Create demo archive</button>
                  <button className={scenario === "state-loss" ? "danger full-width" : "warning full-width"} disabled={busy || !archive} onClick={() => void applyFault()}>Apply selected scenario</button>
                  <button className="ghost full-width" disabled={busy} onClick={() => void reset()}>Reset reference environment</button>
                </section>

                <section className="panel">
                  <div className="panel-title"><div><span>02</span><div><h2>Current simulated state</h2><p>What the recovery engine sees after applying a scenario.</p></div></div></div>
                  <SnapshotCard snapshot={snapshot} />
                  <div className="demo-next"><strong>Test the decision in the production-style flow</strong><p>Open Recover to authenticate the archive, run preflight and inspect why mutation is allowed or blocked.</p><button onClick={() => setView("recover")}>Open Recover →</button></div>
                </section>
              </div>
            </>
          )}

          <footer>
            <span>FiberContinuity v{APP_VERSION} · recovery continuity reference implementation</span>
            <span>Reference adapter only — live use requires supported upstream recovery hooks and integration review.</span>
          </footer>
        </section>
      </div>

      <RestoreConfirmDialog
        open={confirmRestore}
        preflight={preflight}
        onCancel={() => setConfirmRestore(false)}
        onConfirm={() => { setConfirmRestore(false); void restore(); }}
      />
    </main>
  );
}
