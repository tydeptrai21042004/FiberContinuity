import { useEffect, useMemo, useState } from "react";
import { DemoFiberAdapter } from "./adapters/DemoFiberAdapter";
import { FiberContinuity } from "./core/continuity";
import { parseArchive } from "./core/archive";
import type { FiberSnapshot, RecoveryArchive, RecoveryPreflight, RecoveryReport } from "./core/types";
import { downloadJson, readTextFile } from "./browser/files";
import SnapshotCard from "./components/SnapshotCard";
import HealthReport from "./components/HealthReport";
import StatusPill from "./components/StatusPill";

const DEFAULT_PASSWORD = "fiber-demo-2026";

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

  const refresh = async () => setSnapshot(await continuity.inspect());
  useEffect(() => { void refresh(); }, []);

  async function run(label: string, fn: () => Promise<void>) {
    setBusy(true);
    setStatus(label);
    try {
      await fn();
    } catch (error) {
      setStatus(error instanceof Error ? `Error: ${error.message}` : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  const makeBackup = () => run("Creating authenticated encrypted recovery archive…", async () => {
    const next = await continuity.createBackup(password);
    setArchive(next);
    setPreflight(null);
    setReport(null);
    setStatus("Private v2 archive created. Snapshot and native backup are authenticated inside AES-GCM.");
  });

  const simulateLoss = () => run("Simulating browser-state loss…", async () => {
    adapter.simulateBrowserStateLoss();
    await refresh();
    setPreflight(null);
    setReport(null);
    setStatus("Local Fiber session state removed in the demo adapter. Restore is now required.");
  });

  const checkPreflight = () => run("Decrypting archive and running fail-closed preflight…", async () => {
    if (!archive) throw new Error("Create or import a recovery archive first.");
    const next = await continuity.preflight(archive, password);
    setPreflight(next);
    const safe = next.networkMatches && next.compatibility.status === "supported" && next.targetSafety.status === "safe";
    setStatus(safe ? "Preflight passed. Restore is permitted." : "Preflight found a condition that blocks restore.");
  });

  const restore = () => run("Restoring, stabilizing and verifying session…", async () => {
    if (!archive) throw new Error("Create or import a recovery archive first.");
    const next = await continuity.restore(archive, password);
    setReport(next);
    setPreflight(null);
    await refresh();
    setStatus(next.overall === "healthy" ? "Restore complete. Recovery health is HEALTHY." : "Restore completed with findings; review the health report.");
  });

  const reset = () => run("Resetting demo…", async () => {
    adapter.reset();
    setArchive(null);
    setPreflight(null);
    setReport(null);
    await refresh();
    setStatus("Demo session reset.");
  });

  async function importArchive(file: File) {
    await run("Importing recovery archive…", async () => {
      const parsed = parseArchive(await readTextFile(file));
      setArchive(parsed);
      setPreflight(null);
      setReport(null);
      setStatus(`Imported FiberContinuity v${parsed.manifest.formatVersion} archive. Source metadata stays private until authenticated decryption.`);
    });
  }

  return (
    <main>
      <header className="topbar">
        <div className="brand"><span className="brand-mark">FC</span><span>FiberContinuity</span></div>
        <div className="top-actions">
          <span className="mode">VERCEL-SAFE DEMO</span>
          <a href="https://github.com/nervosnetwork/fiber" target="_blank" rel="noreferrer">Fiber upstream ↗</a>
        </div>
      </header>

      <section className="hero">
        <div>
          <div className="eyebrow">BROWSER SESSION CONTINUITY FOR FIBER</div>
          <h1>Backup. Lose local state.<br/>Restore. <em>Verify.</em></h1>
          <p>
            FiberContinuity wraps official/native Fiber recovery primitives with authenticated client-side encryption,
            fail-closed compatibility checks, destructive-restore protection and post-restore state verification.
            The deployed demo uses a deterministic adapter so reviewers can exercise the recovery lifecycle without real funds.
          </p>
        </div>
        <div className="hero-card">
          <span>Current status</span>
          <strong>{status}</strong>
          <small>No recovery payload is uploaded to a server.</small>
        </div>
      </section>

      <section className="layout">
        <div className="panel wide">
          <div className="panel-title"><div><span>01</span><h2>Session inspection</h2></div><button disabled={busy} onClick={() => void refresh()}>Refresh</button></div>
          <SnapshotCard snapshot={snapshot} />
        </div>

        <div className="panel">
          <div className="panel-title"><div><span>02</span><h2>Create / import backup</h2></div></div>
          <label className="field">
            <span>Recovery password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={12} autoComplete="new-password" />
          </label>
          <button className="primary" disabled={busy || password.length < 12} onClick={() => void makeBackup()}>Create private v2 archive</button>
          {archive && <button disabled={busy} onClick={() => downloadJson(`fiber-continuity-${Date.now()}.fcr.json`, archive)}>Download .fcr.json</button>}
          <label className="file-button">Import .fcr.json<input type="file" accept="application/json,.json,.fcr.json" onChange={(e) => e.target.files?.[0] && void importArchive(e.target.files[0])} /></label>
          {archive && <div className="mini"><span>Archive</span><strong>FiberContinuity v{archive.manifest.formatVersion}</strong><code>{archive.manifest.payload.ciphertextDigest.slice(0, 18)}…</code></div>}
        </div>

        <div className="panel">
          <div className="panel-title"><div><span>03</span><h2>Fault + restore</h2></div></div>
          <p className="muted">Restore is allowed only after authenticated metadata, network, version compatibility and target safety checks pass.</p>
          <button className="danger" disabled={busy || !archive} onClick={() => void simulateLoss()}>Simulate browser-state loss</button>
          <button disabled={busy || !archive || password.length < 12} onClick={() => void checkPreflight()}>Run preflight</button>
          <button className="primary" disabled={busy || !archive || password.length < 12} onClick={() => void restore()}>Restore + stabilize + verify</button>
          <button disabled={busy} onClick={() => void reset()}>Reset demo</button>
        </div>

        {preflight && (
          <div className="panel wide">
            <div className="panel-title"><div><span>04</span><h2>Preflight decision</h2></div></div>
            <div className="checks">
              <div className="check"><div><strong>Network identity</strong><p>{preflight.networkMatches ? "Source and target network identities match." : "Network mismatch blocks restore."}</p></div><StatusPill status={preflight.networkMatches ? "pass" : "fail"} /></div>
              <div className="check"><div><strong>Fiber compatibility</strong><p>{preflight.compatibility.reason}</p></div><StatusPill status={preflight.compatibility.status === "supported" ? "pass" : preflight.compatibility.status === "blocked" ? "fail" : "unknown"} /></div>
              <div className="check"><div><strong>Restore target safety</strong><p>{preflight.targetSafety.reason}</p></div><StatusPill status={preflight.targetSafety.status === "safe" ? "pass" : preflight.targetSafety.status === "blocked" ? "fail" : "unknown"} /></div>
            </div>
          </div>
        )}

        <div className="panel wide">
          <div className="panel-title">
            <div><span>{preflight ? "05" : "04"}</span><h2>Recovery health</h2></div>
            {report && <button onClick={() => downloadJson(`fiber-continuity-report-${Date.now()}.json`, report)}>Export evidence</button>}
          </div>
          <HealthReport report={report} />
        </div>
      </section>

      <section className="principles">
        <article><span>BOUNDARY</span><h3>No custom channel recovery</h3><p>The live adapter delegates backup and restore to explicitly supplied official/native Fiber hooks.</p></article>
        <article><span>SAFETY</span><h3>Fail closed before mutation</h3><p>Unknown compatibility or target safety blocks restore instead of being silently accepted.</p></article>
        <article><span>PRIVACY</span><h3>Metadata is encrypted too</h3><p>Node, channel, payment and invoice snapshots live inside the authenticated v2 payload rather than the public file header.</p></article>
      </section>

      <footer>
        <span>FiberContinuity v0.2.2 hardened reference implementation</span>
        <span>Demo data only — do not use with production funds without supported upstream recovery hooks and integration review.</span>
      </footer>
    </main>
  );
}
