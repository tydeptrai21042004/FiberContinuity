import { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { DemoFiberAdapter, type DemoFaultScenario } from "./adapters/DemoFiberAdapter";
import { FiberContinuity } from "./core/continuity";
import { MAX_ARCHIVE_JSON_BYTES, parseArchive, validateArchive } from "./core/archive";
import type { FiberSnapshot, RecoveryArchive, RecoveryPreflight, RecoveryReport } from "./core/types";
import { downloadJson, readTextFile } from "./browser/files";
import SnapshotCard from "./components/SnapshotCard";
import HealthReport from "./components/HealthReport";
import StatusPill from "./components/StatusPill";

const APP_VERSION = "0.3.0";
const DEFAULT_PASSWORD = "fiber-demo-2026";

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

function isPreflightSafe(value: RecoveryPreflight | null) {
  return Boolean(value && value.networkMatches && value.compatibility.status === "supported" && value.targetSafety.status === "safe");
}

function shortDigest(value: string) {
  return `${value.slice(0, 12)}…${value.slice(-8)}`;
}

export default function App() {
  const adapter = useMemo(() => new DemoFiberAdapter(), []);
  const continuity = useMemo(() => new FiberContinuity(adapter), [adapter]);
  const [snapshot, setSnapshot] = useState<FiberSnapshot | null>(null);
  const [archive, setArchive] = useState<RecoveryArchive | null>(null);
  const [preflight, setPreflight] = useState<RecoveryPreflight | null>(null);
  const [report, setReport] = useState<RecoveryReport | null>(null);
  const [password, setPassword] = useState(DEFAULT_PASSWORD);
  const [status, setStatus] = useState("Ready. Demo adapter is active.");
  const [busy, setBusy] = useState(false);
  const [scenario, setScenario] = useState<DemoFaultScenario>("state-loss");
  const [lastAction, setLastAction] = useState("Session inspected");

  const refresh = async () => {
    const next = await continuity.inspect();
    setSnapshot(next);
    return next;
  };

  useEffect(() => {
    void refresh().catch((error) => setStatus(error instanceof Error ? `Inspection failed: ${error.message}` : "Inspection failed."));
  }, []);

  async function run(label: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setStatus(label);
    try {
      await fn();
      setLastAction(label.replace(/…$/, ""));
    } catch (error) {
      setStatus(error instanceof Error ? `Error: ${error.message}` : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  const makeBackup = () => run("Creating authenticated recovery archive…", async () => {
    const next = await continuity.createBackup(password);
    setArchive(next);
    setPreflight(null);
    setReport(null);
    setStatus("Private v2 archive created locally. Snapshot and native backup are authenticated inside AES-GCM.");
  });

  const applyFault = () => run(`Applying ${scenarioCopy[scenario].title.toLowerCase()} scenario…`, async () => {
    if (!archive) throw new Error("Create or import a recovery archive before applying a fault scenario.");
    adapter.applyFaultScenario(scenario);
    await refresh();
    setPreflight(null);
    setReport(null);
    setStatus(`${scenarioCopy[scenario].title} applied. Run preflight to observe the fail-closed decision.`);
  });

  const checkPreflight = () => run("Authenticating archive and running preflight…", async () => {
    if (!archive) throw new Error("Create or import a recovery archive first.");
    const next = await continuity.preflight(archive, password);
    setPreflight(next);
    setReport(null);
    setStatus(isPreflightSafe(next) ? "Preflight passed. Restore is permitted against the current target state." : "Preflight blocked mutation. Review the decision below.");
  });

  const restore = () => run("Restoring, stabilizing and verifying session…", async () => {
    if (!archive) throw new Error("Create or import a recovery archive first.");
    const next = await continuity.restore(archive, password);
    setReport(next);
    setPreflight(null);
    await refresh();
    setStatus(next.overall === "healthy" ? "Restore complete. State continuity is HEALTHY." : "Restore completed with findings; review the evidence report.");
  });

  const guidedDemo = () => run("Running guided continuity demonstration…", async () => {
    const nextArchive = await continuity.createBackup(password);
    setArchive(nextArchive);
    adapter.applyFaultScenario("state-loss");
    await refresh();
    const nextPreflight = await continuity.preflight(nextArchive, password);
    setPreflight(nextPreflight);
    if (!isPreflightSafe(nextPreflight)) throw new Error("Guided demo stopped because preflight did not pass.");
    const nextReport = await continuity.restore(nextArchive, password);
    setReport(nextReport);
    setPreflight(null);
    await refresh();
    setStatus(nextReport.overall === "healthy" ? "Guided demo complete: backup → loss → preflight → restore → HEALTHY." : "Guided demo completed with findings.");
  });

  const reset = () => run("Resetting demo…", async () => {
    adapter.reset();
    setArchive(null);
    setPreflight(null);
    setReport(null);
    setScenario("state-loss");
    await refresh();
    setStatus("Demo session reset to the deterministic baseline.");
  });

  async function importArchive(file: File) {
    await run("Validating imported recovery archive…", async () => {
      if (file.size > MAX_ARCHIVE_JSON_BYTES) {
        throw new Error(`Archive is too large (${Math.ceil(file.size / 1024 / 1024)} MiB). Maximum supported JSON size is ${Math.floor(MAX_ARCHIVE_JSON_BYTES / 1024 / 1024)} MiB.`);
      }
      const parsed = parseArchive(await readTextFile(file));
      await validateArchive(parsed);
      setArchive(parsed);
      setPreflight(null);
      setReport(null);
      setStatus(`Imported and corruption-checked FiberContinuity v${parsed.manifest.formatVersion} archive. Private source metadata remains encrypted until password authentication.`);
    });
  }

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
      preflight,
      recoveryReport: report,
      currentSnapshot: snapshot,
      guarantees: {
        clientSideOnly: true,
        archivePayloadAuthenticated: true,
        compatibilityFailClosed: true,
        targetSafetyFailClosed: true,
        targetRaceGuard: true,
        postRestoreVerification: true
      }
    };
    downloadJson(`fiber-continuity-evidence-${Date.now()}.json`, evidence);
  }

  const safe = isPreflightSafe(preflight);
  const workflowStage = report ? 4 : preflight ? 3 : archive ? 2 : 1;
  const coverageComplete = snapshot ? Object.values(snapshot.capabilities).every((value) => value === "full") : false;

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">FC</span><span>FiberContinuity</span><small>v{APP_VERSION}</small></div>
        <div className="top-actions">
          <span className="mode"><i /> VERCEL-SAFE DEMO</span>
          <a href="https://github.com/tydeptrai21042004/FiberContinuity" target="_blank" rel="noreferrer">Source ↗</a>
          <a href="https://github.com/nervosnetwork/fiber" target="_blank" rel="noreferrer">Fiber ↗</a>
        </div>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow">RECOVERY CONTINUITY LAYER FOR FIBER</div>
          <h1>Recover browser state.<br/><em>Prove it stayed intact.</em></h1>
          <p>
            A client-side recovery workflow around official/native Fiber primitives: authenticated encrypted archives,
            compatibility gates, destructive-restore protection, target race detection, stabilization and evidence-grade verification.
          </p>
          <div className="hero-actions">
            <button className="primary hero-cta" disabled={busy || password.length < 12} onClick={() => void guidedDemo()}>{busy ? "Working…" : "Run guided recovery demo"}</button>
            <span>No wallet, seed phrase or recovery payload leaves this browser.</span>
          </div>
        </div>
        <aside className="hero-card">
          <div className="status-line"><span className={busy ? "pulse busy" : "pulse"} /><span>{busy ? "Operation in progress" : "System ready"}</span></div>
          <strong>{status}</strong>
          <div className="hero-kpis">
            <div><span>Mode</span><b>Demo / testnet</b></div>
            <div><span>Coverage</span><b>{coverageComplete ? "Full" : "Partial"}</b></div>
            <div><span>Server upload</span><b>None</b></div>
            <div><span>Last action</span><b title={lastAction}>{lastAction}</b></div>
          </div>
        </aside>
      </section>

      <section className="proof-strip">
        <div><span>01</span><strong>AES-GCM v2</strong><small>Snapshot + native backup authenticated together</small></div>
        <div><span>02</span><strong>Fail-closed policy</strong><small>Unknown compatibility never mutates storage</small></div>
        <div><span>03</span><strong>Race guarded</strong><small>Target is rechecked immediately before restore</small></div>
        <div><span>04</span><strong>Evidence export</strong><small>Machine-readable review artifact</small></div>
      </section>

      <section className="workflow">
        {["Inspect", "Protect", "Preflight", "Verify"].map((label, index) => {
          const step = index + 1;
          const state = step < workflowStage ? "done" : step === workflowStage ? "active" : "pending";
          return <div className={`workflow-step ${state}`} key={label}><span>{step < workflowStage ? "✓" : `0${step}`}</span><div><strong>{label}</strong><small>{state === "done" ? "Complete" : state === "active" ? "Current stage" : "Pending"}</small></div></div>;
        })}
      </section>

      <section className="layout">
        <div className="panel wide">
          <div className="panel-title"><div><span>01</span><div><h2>Session inspection</h2><p>Observable Fiber state used for safety and post-restore comparison.</p></div></div><button disabled={busy} onClick={() => void run("Refreshing session inspection…", async () => { await refresh(); setStatus("Session inspection refreshed."); })}>Refresh</button></div>
          <SnapshotCard snapshot={snapshot} />
        </div>

        <div className="panel">
          <div className="panel-title"><div><span>02</span><div><h2>Protected recovery archive</h2><p>Create locally or import an existing v2 archive.</p></div></div></div>
          <label className="field">
            <span>Recovery password <em>{password.length >= 12 ? "meets minimum" : `${12 - password.length} more characters`}</em></span>
            <input type="password" value={password} onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)} minLength={12} autoComplete="new-password" spellCheck={false} />
          </label>
          <div className="button-row">
            <button className="primary" disabled={busy || password.length < 12} onClick={() => void makeBackup()}>Create archive</button>
            <label className="file-button">Import<input type="file" accept="application/json,.json,.fcr.json" onChange={(e: ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (file) void importArchive(file); e.currentTarget.value = ""; }} /></label>
          </div>
          {archive ? (
            <div className="archive-card">
              <div className="archive-state"><span className="archive-icon">◆</span><div><strong>Authenticated archive ready</strong><small>Created {new Date(archive.manifest.createdAt).toLocaleString()}</small></div><StatusPill status="pass" /></div>
              <dl><div><dt>Format</dt><dd>v{archive.manifest.formatVersion}</dd></div><div><dt>KDF</dt><dd>{archive.manifest.payload.kdf}</dd></div><div><dt>Iterations</dt><dd>{archive.manifest.payload.iterations.toLocaleString()}</dd></div><div><dt>Digest</dt><dd className="mono">{shortDigest(archive.manifest.payload.ciphertextDigest)}</dd></div></dl>
              <button disabled={busy} onClick={() => downloadJson(`fiber-continuity-${Date.now()}.fcr.json`, archive)}>Download .fcr.json</button>
            </div>
          ) : <div className="callout neutral"><strong>No archive loaded</strong><span>Create one before simulating a recovery fault.</span></div>}
        </div>

        <div className="panel">
          <div className="panel-title"><div><span>03</span><div><h2>Safety scenario lab</h2><p>Exercise both successful recovery and fail-closed cases.</p></div></div></div>
          <label className="field">
            <span>Fault scenario</span>
            <select value={scenario} onChange={(e: ChangeEvent<HTMLSelectElement>) => setScenario(e.target.value as DemoFaultScenario)} disabled={busy}>
              {Object.entries(scenarioCopy).map(([value, item]) => <option key={value} value={value}>{item.title}</option>)}
            </select>
          </label>
          <div className="scenario-info"><strong>{scenarioCopy[scenario].title}</strong><p>{scenarioCopy[scenario].detail}</p><small>{scenarioCopy[scenario].tone}</small></div>
          <button className={scenario === "state-loss" ? "danger" : "warning"} disabled={busy || !archive} onClick={() => void applyFault()}>Apply selected scenario</button>
          <button disabled={busy || !archive || password.length < 12} onClick={() => void checkPreflight()}>Run authenticated preflight</button>
          <button className="primary" disabled={busy || !archive || password.length < 12 || (preflight !== null && !safe)} onClick={() => void restore()}>Restore + stabilize + verify</button>
          <button className="ghost" disabled={busy} onClick={() => void reset()}>Reset deterministic demo</button>
        </div>

        {preflight && (
          <div className="panel wide decision-panel">
            <div className="panel-title"><div><span>04</span><div><h2>Preflight decision</h2><p>Every gate must pass before native storage mutation is permitted.</p></div></div><StatusPill status={safe ? "pass" : "fail"} /></div>
            <div className={`decision-banner ${safe ? "allowed" : "blocked"}`}>
              <div><span>{safe ? "✓" : "×"}</span><div><strong>{safe ? "RESTORE PERMITTED" : "RESTORE BLOCKED"}</strong><p>{safe ? "Archive, network, compatibility and target safety checks passed." : "At least one fail-closed gate rejected the current target."}</p></div></div>
              <small>Restore re-runs these checks and verifies target state again immediately before mutation.</small>
            </div>
            <div className="checks three-col">
              <div className="check-card"><div><strong>Network identity</strong><p>{preflight.networkMatches ? "Source and target network identities match." : "Network mismatch blocks restore."}</p></div><StatusPill status={preflight.networkMatches ? "pass" : "fail"} /></div>
              <div className="check-card"><div><strong>Fiber compatibility</strong><p>{preflight.compatibility.reason}</p></div><StatusPill status={preflight.compatibility.status === "supported" ? "pass" : preflight.compatibility.status === "blocked" ? "fail" : "unknown"} /></div>
              <div className="check-card"><div><strong>Target safety</strong><p>{preflight.targetSafety.reason}</p></div><StatusPill status={preflight.targetSafety.status === "safe" ? "pass" : preflight.targetSafety.status === "blocked" ? "fail" : "unknown"} /></div>
            </div>
          </div>
        )}

        <div className="panel wide evidence-panel">
          <div className="panel-title">
            <div><span>{preflight ? "05" : "04"}</span><div><h2>Recovery evidence</h2><p>Structured verification suitable for reviewer reproduction and CI artifacts.</p></div></div>
            <div className="panel-actions">
              {report && <button onClick={() => downloadJson(`fiber-continuity-report-${Date.now()}.json`, report)}>Report JSON</button>}
              <button disabled={!snapshot && !report && !preflight} onClick={exportEvidence}>Evidence bundle</button>
            </div>
          </div>
          <HealthReport report={report} />
        </div>
      </section>

      <section className="readiness">
        <div className="section-heading"><div className="eyebrow">REVIEWER READINESS</div><h2>What this demo proves—and what it deliberately does not.</h2></div>
        <div className="principles">
          <article><span>BOUNDARY</span><h3>No custom channel recovery</h3><p>The live adapter delegates native backup and restore to explicitly supplied upstream hooks instead of reverse-engineering Fiber storage.</p></article>
          <article><span>SAFETY</span><h3>Mutation is fail closed</h3><p>Unknown compatibility, unsafe targets, network mismatch and target races stop before destructive storage mutation.</p></article>
          <article><span>PRIVACY</span><h3>Metadata stays encrypted</h3><p>Node, channel, payment and invoice snapshots live inside the authenticated payload rather than the public archive header.</p></article>
          <article><span>EVIDENCE</span><h3>Verification is explicit</h3><p>Node identity, network, channel state/balances and supported payment/invoice records are compared after stabilization.</p></article>
        </div>
      </section>

      <footer>
        <span>FiberContinuity v{APP_VERSION} · hardened reviewer reference implementation</span>
        <span>Demo data only — production use requires supported upstream recovery hooks and integration review.</span>
      </footer>
    </main>
  );
}
