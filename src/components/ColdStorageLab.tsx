import { useState } from "react";
import { IndexedDbColdStore } from "../adapters/IndexedDbColdStore";
import { downloadJson } from "../browser/files";

const NAME = "fiber-continuity-owned-cold-lab-v1";
// This database belongs solely to the lab, NOT to fiber-js or another origin.
const cold = new IndexedDbColdStore(NAME, async () => {
  if (!indexedDB?.databases) throw new Error("This browser cannot inspect existing databases safely.");
});

function openLab(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(NAME, 1);
    request.onupgradeneeded = () => {
      const records = request.result.createObjectStore("records", { keyPath: "key", autoIncrement: false });
      records.createIndex("category", "category", { unique: false });
    };
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Close all other lab tabs and retry."));
    request.onsuccess = () => resolve(request.result);
  });
}
async function modifyLab(mode: "seed" | "clear"): Promise<void> {
  const db = await openLab();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("records", "readwrite");
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error("Lab transaction aborted."));
      tx.onerror = () => reject(tx.error ?? new Error("Lab transaction failed."));
      const records = tx.objectStore("records");
      if (mode === "clear") records.clear();
      else {
        records.put({ key: "channel:01", category: "channel", state: "READY", amount: 125n });
        records.put({ key: "binary:02", category: "binary", bytes: new Uint8Array([0, 1, 7, 55, 255]) });
        records.put({ key: "metadata:03", category: "meta", updatedAt: new Date("2026-10-01T00:00:00Z") });
      }
    });
  } finally { db.close(); }
}

export default function ColdStorageLab() {
  const [bytes, setBytes] = useState<Uint8Array | null>(null);
  const [step, setStep] = useState("No lab database initialized");
  const [evidence, setEvidence] = useState<Record<string, unknown>[]>([]);
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState(false);
  const run = async (label: string, task: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await task(); setStep(label); }
    catch (error) { setStep(`BLOCKED — ${error instanceof Error ? error.message : String(error)}`); }
    finally { setBusy(false); }
  };
  return (
    <>
      <div className="demo-banner"><strong>OWNED INDEXEDDB LAB</strong><span>Real browser storage operations on a dedicated, synthetic test database. Not Fiber channel recovery.</span></div>
      <div className="page-heading compact"><div><div className="eyebrow">COLD DATABASE TRANSPORT</div><h1>Verify the IndexedDB round trip.</h1><p>Run a genuine browser transaction through the cold storage transport. Only this dedicated lab database is accessed. No wallet, Fiber profile or funds are touched.</p></div></div>
      <div className="two-column">
        <section className="panel">
          <div className="panel-title"><div><span>01</span><div><h2>Storage operations</h2><p>Seed, capture, erase then restore a synthetic database.</p></div></div></div>
          <button className="primary full-width" disabled={busy} onClick={() => void run("Synthetic IndexedDB records seeded", async () => { await modifyLab("seed"); setBytes(null); setEvidence([]); setApproved(false); })}>1. Seed synthetic database</button>
          <button className="ghost full-width" disabled={busy} onClick={() => void run("Whole-database backup captured", async () => {
            const output = await cold.exportBytes(); const dump = await cold.validateBytes(output); setBytes(output);
            setEvidence((before) => [...before, { operation: "capture", at: new Date().toISOString(), size: output.length, stores: dump.stores.length, records: dump.stores.reduce((n, item) => n + item.entries.length, 0), checksum: dump.checksum }]);
          })}>2. Capture the complete database</button>
          <label className="field" style={{ marginTop: 16 }}><span><input type="checkbox" checked={approved} onChange={(event) => setApproved(event.target.checked)} /> I approve erasing only the dedicated synthetic lab database</span></label>
          <button className="danger full-width" disabled={busy || !bytes || !approved} onClick={() => void run("Synthetic lab records erased", async () => { await modifyLab("clear"); setEvidence((before) => [...before, { operation: "synthetic-loss", at: new Date().toISOString() }]); })}>3. Simulate local data loss</button>
          <button className="primary full-width" disabled={busy || !bytes} onClick={() => void run("Cold database restored and full readback verified", async () => {
            if (!bytes) throw new Error("Capture a backup first.");
            await cold.restoreBytes(bytes);
            const dump = await cold.validateBytes(bytes);
            setEvidence((before) => [...before, { operation: "restore-readback-verified", at: new Date().toISOString(), checksum: dump.checksum, status: "local-storage-integrity-only" }]);
          })}>4. Restore and verify readback</button>
        </section>
        <section className="panel">
          <div className="panel-title"><div><span>02</span><div><h2>Result and evidence</h2><p>Archive data stays in memory, never transmitted to a backend.</p></div></div></div>
          <p><strong>Latest result:</strong> {step}</p>
          <p><strong>Database:</strong> {NAME}</p>
          <p><strong>Captured bytes:</strong> {bytes?.length ?? "No backup yet"}</p>
          <p><strong>Checks recorded:</strong> {evidence.length}</p>
          <button className="ghost full-width" disabled={!evidence.length} onClick={() => downloadJson("fiber-continuity-cold-lab-evidence.json", {
            application: "FiberContinuity", mode: "synthetic-owned-indexeddb-lab", verifiedFiberRecovery: false,
            channelSafety: "not-established", database: NAME, events: evidence
          })}>Export redacted lab evidence</button>
          <div className="scenario-info"><strong>Important scope boundary</strong><p>This exercise validates key/value serialization, object-store schemas, storage transactions and integrity readback. It does not demonstrate quiescence of Fiber WASM workers, restart with persisted node keys or peer/channel reconciliation. The real integration requires reviewed same-origin lifecycle hooks.</p></div>
        </section>
      </div>
    </>
  );
}
