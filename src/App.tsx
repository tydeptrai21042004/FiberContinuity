import { useEffect, useMemo, useState } from "react";
import { DemoFiberAdapter } from "./adapters/DemoFiberAdapter";
import { FiberContinuity } from "./core/continuity";
import { parseArchive } from "./core/archive";
import type { FiberSnapshot, RecoveryArchive, RecoveryReport } from "./core/types";
import { downloadJson, readTextFile } from "./browser/files";
import SnapshotCard from "./components/SnapshotCard";
import HealthReport from "./components/HealthReport";

const DEFAULT_PASSWORD = "fiber-demo-2026";

export default function App() {
  const adapter = useMemo(() => new DemoFiberAdapter(), []);
  const continuity = useMemo(() => new FiberContinuity(adapter), [adapter]);
  const [snapshot, setSnapshot] = useState<FiberSnapshot | null>(null);
  const [archive, setArchive] = useState<RecoveryArchive | null>(null);
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

  const makeBackup = () => run("Creating encrypted recovery archive…", async () => {
    const next = await continuity.createBackup(password);
    setArchive(next);
    setReport(null);
    setStatus("Encrypted .fcr.json archive created and integrity metadata recorded.");
  });

  const simulateLoss = () => run("Simulating browser-state loss…", async () => {
    adapter.simulateBrowserStateLoss();
    await refresh();
    setReport(null);
    setStatus("Local Fiber session state removed in the demo adapter. Restore is now required.");
  });

  const restore = () => run("Restoring and verifying session…", async () => {
    if (!archive) throw new Error("Create or import a recovery archive first.");
    const next = await continuity.restore(archive, password);
    setReport(next);
    await refresh();
    setStatus(next.overall === "healthy" ? "Restore complete. Recovery health is HEALTHY." : "Restore completed with findings.");
  });

  const reset = () => run("Resetting demo…", async () => {
    adapter.reset();
    setArchive(null);
    setReport(null);
    await refresh();
    setStatus("Demo session reset.");
  });

  async function importArchive(file: File) {
    await run("Importing recovery archive…", async () => {
      const parsed = parseArchive(await readTextFile(file));
      setArchive(parsed);
      setReport(null);
      setStatus(`Imported archive for node ${parsed.manifest.source.nodeId}.`);
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
            FiberContinuity wraps official/native Fiber recovery primitives with client-side encryption,
            compatibility preflight and post-restore state verification. The deployed demo uses a deterministic
            adapter so reviewers can exercise the complete recovery lifecycle without real funds.
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
          <div className="panel-title"><div><span>02</span><h2>Create backup</h2></div></div>
          <label className="field">
            <span>Recovery password</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} />
          </label>
          <button className="primary" disabled={busy || password.length < 10} onClick={() => void makeBackup()}>Create encrypted archive</button>
          {archive && <button disabled={busy} onClick={() => downloadJson(`fiber-continuity-${archive.manifest.source.nodeId}.fcr.json`, archive)}>Download .fcr.json</button>}
          <label className="file-button">Import .fcr.json<input type="file" accept="application/json,.json" onChange={(e) => e.target.files?.[0] && void importArchive(e.target.files[0])} /></label>
          {archive && <div className="mini"><span>Archive</span><strong>{archive.manifest.source.nodeId}</strong><code>{archive.manifest.payload.ciphertextDigest.slice(0, 18)}…</code></div>}
        </div>

        <div className="panel">
          <div className="panel-title"><div><span>03</span><h2>Fault + restore</h2></div></div>
          <p className="muted">The demo destroys local Fiber state before restoration. The encrypted archive is the only recovery source.</p>
          <button className="danger" disabled={busy || !archive} onClick={() => void simulateLoss()}>Simulate browser-state loss</button>
          <button className="primary" disabled={busy || !archive} onClick={() => void restore()}>Restore + verify</button>
          <button disabled={busy} onClick={() => void reset()}>Reset demo</button>
        </div>

        <div className="panel wide">
          <div className="panel-title">
            <div><span>04</span><h2>Recovery health</h2></div>
            {report && <button onClick={() => downloadJson(`fiber-continuity-report-${Date.now()}.json`, report)}>Export evidence</button>}
          </div>
          <HealthReport report={report} />
        </div>
      </section>

      <section className="principles">
        <article><span>BOUNDARY</span><h3>No custom channel recovery</h3><p>The live adapter delegates backup and restore to explicitly supplied official/native Fiber hooks.</p></article>
        <article><span>SAFETY</span><h3>Restore is not success</h3><p>Network, node identity and recovered state are checked after the native restore finishes.</p></article>
        <article><span>DEPLOYMENT</span><h3>Static Vercel frontend</h3><p>No backend database or secret is required for the demo. COOP/COEP headers are included for Fiber WASM.</p></article>
      </section>

      <footer>
        <span>FiberContinuity v0.1 reference implementation</span>
        <span>Demo data only — do not use with production funds without upstream integration review.</span>
      </footer>
    </main>
  );
}
