import { useRef, useState, type ChangeEvent } from "react";
import { ManagedFiberTestnetHost, PINNED_FIBER_VERSION } from "../adapters/ManagedFiberTestnetHost";
import { createArchive, decryptArchive, parseArchive } from "../core/archive";
import type { RecoveryArchive, FiberSnapshot } from "../core/types";
import { downloadJson } from "../browser/files";
import { assertFiber091StorageContract } from "../adapters/Fiber091StorageContract";
import {
  beginColdRestore, readColdJournal, recordColdReadback, recordColdRestart,
  type ColdRecoveryJournal
} from "../core/coldRecoveryJournal";

const makePrefix = () => `fc-testnet-${crypto.randomUUID()}`;
const hex = (bytes: Uint8Array) => [...bytes].map(v => v.toString(16).padStart(2, "0")).join("");
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
type Event = Record<string, unknown>;

type EvidenceStatus = "not-tested" | "matched" | "unverified";

/** Real WASM testnet integration: a zero-channel experiment, not funded recovery. */
export default function RealFiberTestnetLab() {
  const host = useRef<ManagedFiberTestnetHost | null>(null);
  const [profile, setProfile] = useState(makePrefix);
  const [nodeKey, setNodeKey] = useState("");
  const [ckbKey, setCkbKey] = useState("");
  const [rpcUrl, setRpcUrl] = useState("");
  const [peerAddress, setPeerAddress] = useState("");
  const [peerPubkey, setPeerPubkey] = useState("");
  const [password, setPassword] = useState("");
  const [archive, setArchive] = useState<RecoveryArchive | null>(null);
  const [archiveFromFile, setArchiveFromFile] = useState(false);
  const [snapshot, setSnapshot] = useState<FiberSnapshot | null>(null);
  const [status, setStatus] = useState("No live Fiber node initialized.");
  const [evidence, setEvidence] = useState<Event[]>([]);
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [readback, setReadback] = useState<EvidenceStatus>("not-tested");
  const [peers, setPeers] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);
  const [restartVerified, setRestartVerified] = useState(false);

  const event = (action: string, more: Event = {}) =>
    setEvidence(old => [...old, { at: new Date().toISOString(), action, ...more }]);
  const run = async (label: string, task: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setStatus(`${label}…`);
    try {
      await task();
      setStatus(`${label} completed. Funded-channel recovery remains UNSUPPORTED.`);
    } catch (error) {
      const message = errorMessage(error);
      setStatus(`BLOCKED: ${message}`);
      event("blocked", { operation: label, error: message });
    } finally { setBusy(false); }
  };
  const requireHost = (): ManagedFiberTestnetHost => {
    if (!host.current) throw new Error("Start a new testnet node or prepare the offline recovery profile first.");
    return host.current;
  };
  const matchingArchive = async (h: ManagedFiberTestnetHost) => {
    if (!archive || password.length < 12) throw new Error("Import an archive and enter its password (at least 12 characters).");
    const decoded = await decryptArchive(archive, password);
    if (decoded.snapshot.adapter !== "fiber-js" || decoded.snapshot.network !== "testnet" ||
        decoded.snapshot.networkIdentity !== h.networkIdentity || decoded.snapshot.nodeId !== h.nodeId ||
        decoded.snapshot.fiberVersion !== PINNED_FIBER_VERSION) {
      throw new Error("Archive does not match the pinned runtime, entire configuration and persisted node identity.");
    }
    if (decoded.snapshot.channels.length !== 0 || decoded.snapshot.capabilities.channels === "unavailable") {
      throw new Error("Funded or uninspectable channels cannot be restored by this experimental browser lab.");
    }
    return decoded;
  };

  const recordSource = async (h: ManagedFiberTestnetHost, bytes: Uint8Array) => {
    const dump = await h.withColdStore(async (store) => store.validateBytes(bytes));
    assertFiber091StorageContract(dump);
    return { profile: h.prefix, database: h.databaseName, nodeId: h.nodeId, backupChecksum: dump.checksum };
  };
  const offlineReadback = async (h: ManagedFiberTestnetHost) => {
    const decoded = await matchingArchive(h);
    const meta = await recordSource(h, decoded.nativeBackup);
    const verification = await h.verifyRestoredBytes(decoded.nativeBackup);
    if (verification.checksum !== meta.backupChecksum) throw new Error("Cold readback checksum differs from the imported archive.");
    recordColdReadback(meta);
    setRestored(true); setReadback("matched");
    event("cold-readback-verified", {
      status: "exact-database-match", bytes: verification.bytes, database: h.databaseName,
      fundedChannelSafety: "not-established", nodeRestart: "pending"
    });
  };

  let journal: ColdRecoveryJournal | null = null;
  let journalError = "";
  try { journal = readColdJournal(profile); }
  catch (error) { journalError = errorMessage(error); }
  const pendingJournal = journal?.stage === "mutating" || journal?.stage === "readback-verified";
  const stopped = Boolean(host.current && !host.current.running);

  return (
    <>
      <div className="demo-banner">
        <strong>REAL FIBER JS 0.9.1 · TESTNET ONLY</strong>
        <span>Actual WASM node and IndexedDB; strict whole-profile operations. No funded channels, hot backup, or guaranteed flush barrier.</span>
      </div>
      <div className="page-heading compact">
        <div>
          <div className="eyebrow">OPT-IN REAL NODE EXPERIMENT</div>
          <h1>Backup, recover and verify a browser Fiber profile.</h1>
          <p>Follow the upstream whole-node approach: inspect, stop, export all IndexedDB records, restore into an empty target and restart deliberately. This is a controlled zero-channel testnet experiment, not a production wallet recovery service.</p>
        </div>
      </div>
      <div className="two-column">
        <section className="panel">
          <h2>1. Start and stop a dedicated testnet profile</h2>
          <p><strong>Use cases:</strong> lost browser storage, corrupted local testnet profile, or recovery after a crashed operation. Device-to-device funded-channel migration and single-channel rollback are NOT supported.</p>
          <label className="field"><span>Unique testnet profile (save with archive)</span><input value={profile} onChange={(e: ChangeEvent<HTMLInputElement>) => setProfile(e.target.value)} disabled={!!host.current || busy} /></label>
          <label className="field"><span>Trusted CKB testnet HTTPS RPC endpoint</span><input value={rpcUrl} onChange={(e: ChangeEvent<HTMLInputElement>) => setRpcUrl(e.target.value)} placeholder="https://your-ckb-testnet-rpc.example" disabled={!!host.current || busy} /></label>
          <label className="field"><span>Original Fiber identity secret (64 hex characters)</span><input type="password" autoComplete="off" value={nodeKey} onChange={(e: ChangeEvent<HTMLInputElement>) => setNodeKey(e.target.value)} disabled={!!host.current || busy} /></label>
          <label className="field"><span>Original CKB signing secret (testnet only)</span><input type="password" autoComplete="off" value={ckbKey} onChange={(e: ChangeEvent<HTMLInputElement>) => setCkbKey(e.target.value)} disabled={!!host.current || busy} /></label>
          <button className="ghost full-width" disabled={busy || !!host.current} onClick={() => {
            setNodeKey(hex(crypto.getRandomValues(new Uint8Array(32))));
            setCkbKey(hex(crypto.getRandomValues(new Uint8Array(32))));
          }}>Generate two independent testnet-only keys</button>
          <button className="ghost full-width" disabled={!nodeKey} onClick={() => void navigator.clipboard.writeText(nodeKey).then(() => setStatus("Fiber identity secret copied. Store it securely offline.")).catch(() => setStatus("Clipboard denied."))}>Copy Fiber identity secret</button>
          <button className="ghost full-width" disabled={!ckbKey} onClick={() => void navigator.clipboard.writeText(ckbKey).then(() => setStatus("CKB signing secret copied. Store it securely offline.")).catch(() => setStatus("Clipboard denied."))}>Copy CKB signing secret</button>
          <p>Keep both original secrets and the profile identifier offline. Neither private key is included in an encrypted backup. Never enter mainnet secrets.</p>
          <button className="primary full-width" disabled={busy || !!host.current || !!pendingJournal || !!journalError} onClick={() => void run("Starting the pinned WASM testnet node", async () => {
            const h = await ManagedFiberTestnetHost.create({ prefix: profile, fiberKeyHex: nodeKey, ckbKeyHex: ckbKey, ckbRpcUrl: rpcUrl });
            host.current = h;
            try {
              const s = await h.start(); setSnapshot(s);
              event("real-testnet-node-started", { runtime: PINNED_FIBER_VERSION, database: h.databaseName, nodeId: s.nodeId, channels: s.channels.length });
            } catch (error) { host.current = null; throw error; }
          })}>Start new zero-channel Fiber node (no bootnodes)</button>
          <label className="field"><span>Optional peer WSS multiaddr</span><input value={peerAddress} onChange={(e: ChangeEvent<HTMLInputElement>) => setPeerAddress(e.target.value)} placeholder="/dns4/…/tcp/443/wss" disabled={busy} /></label>
          <label className="field"><span>Peer compressed pubkey (66 hex characters)</span><input value={peerPubkey} onChange={(e: ChangeEvent<HTMLInputElement>) => setPeerPubkey(e.target.value)} disabled={busy} /></label>
          <button className="ghost full-width" disabled={busy || !host.current?.running} onClick={() => void run("Connecting and observing a testnet peer", async () => {
            const h = requireHost(); await h.connectPeer(peerAddress, peerPubkey);
            const info = await h.observe(); setSnapshot(info.snapshot); setPeers(info.peers);
            event("testnet-peer-observed", { peerCount: info.peers, channelCount: info.snapshot.channels.length, peerSafety: "not-established" });
          })}>Connect testnet peer and observe</button>
          <button className="ghost full-width" disabled={busy || !host.current?.running} onClick={() => void run("Inspecting real Fiber RPC state", async () => {
            const info = await requireHost().observe(); setSnapshot(info.snapshot); setPeers(info.peers);
            event("real-fiber-rpc-inspection", { channelCount: info.snapshot.channels.length, peerCount: info.peers });
          })}>Inspect node, channels and peers</button>
          <button className="primary full-width" disabled={busy || !host.current?.running} onClick={() => void run("Stopping Fiber before cold storage", async () => {
            const h = requireHost(); await h.stop(); setSnapshot(h.snapshot);
            event("fiber-workers-stopped", { workerFlushGuarantee: "upstream-not-documented", channelCount: h.snapshot?.channels.length ?? null });
          })}>Stop Fiber workers explicitly</button>
        </section>

        <section className="panel">
          <h2>2. Cold backup and whole-profile recovery</h2>
          <label className="field"><span>Archive passphrase (12+ characters)</span><input type="password" autoComplete="new-password" value={password} onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)} /></label>
          <button className="primary full-width" disabled={busy || !stopped || password.length < 12 || !!pendingJournal || !!journalError} onClick={() => void run("Creating authenticated complete IndexedDB archive", async () => {
            const h = requireHost(); const snap = h.snapshot;
            if (!snap || snap.channels.length !== 0 || snap.capabilities.channels === "unavailable") throw new Error("Require a real observed zero-channel snapshot captured immediately before stop.");
            const bytes = await h.withColdStore(async store => {
              const stable = await store.exportStableBytes();
              assertFiber091StorageContract(stable.dump);
              return stable.bytes;
            });
            const saved = await createArchive(snap, bytes, password);
            setArchive(saved); setArchiveFromFile(false); setRestored(false); setReadback("not-tested"); setRestartVerified(false); setApproved(false);
            event("whole-idb-backup-encrypted", { database: h.databaseName, sourceChannels: snap.channels.length, sourceBytes: bytes.length, twoCompleteStorageReads: "matched", upstreamFlushBarrier: "not-proven" });
          })}>Create authenticated cold archive</button>
          <button className="ghost full-width" disabled={!archive || busy} onClick={() => archive && downloadJson(`fiber-cold-testnet-${profile}.fcr.json`, archive)}>Download .fcr.json archive</button>
          <label className="field"><span>Re-import the SAVED archive before simulating loss</span><input type="file" accept=".json,application/json" disabled={busy} onChange={(e: ChangeEvent<HTMLInputElement>) => void (async () => {
            const file = e.target.files?.[0]; if (!file) return;
            try {
              const parsed = parseArchive(await file.text());
              setArchive(parsed); setArchiveFromFile(true); setReadback("not-tested"); setRestored(false); setRestartVerified(false);
              setStatus("Archive file imported and structurally checked. Authentication and storage comparison occur before destructive actions.");
              event("encrypted-archive-file-imported", { format: parsed.manifest.formatVersion, fileBytes: file.size });
            } catch (error) {
              setArchive(null); setArchiveFromFile(false); setStatus(`Archive file rejected: ${errorMessage(error)}`);
            } finally { e.target.value = ""; }
          })()} /></label>
          <p><strong>Saved-copy evidence:</strong> {archiveFromFile ? "Encrypted file re-imported; passphrase and source identity checked on next operation." : "Not verified. Download and re-import the file before intentional loss."}</p>
          <button className="ghost full-width" disabled={busy || !!host.current || !archiveFromFile || !archive || password.length < 12 || !!journalError} onClick={() => void run("Preparing offline recovery without starting Fiber", async () => {
            if (!archive) throw new Error("Import the previously exported archive.");
            const decoded = await decryptArchive(archive, password);
            const h = await ManagedFiberTestnetHost.create({ prefix: profile, fiberKeyHex: nodeKey, ckbKeyHex: ckbKey, ckbRpcUrl: rpcUrl });
            await h.adoptColdRecoveryProfile(decoded.nativeBackup, decoded.snapshot);
            host.current = h; setSnapshot(decoded.snapshot);
            event("cold-profile-adopted-without-node-startup", { database: h.databaseName, nodeId: h.nodeId, runtime: PINNED_FIBER_VERSION });
          })}>Prepare offline recovery after browser refresh</button>
          <label className="field"><span><input type="checkbox" checked={approved} onChange={(e: ChangeEvent<HTMLInputElement>) => setApproved(e.target.checked)} /> I saved BOTH original secrets, re-imported the encrypted archive, understand deletion is irreversible without the backup, and confirm this is a dedicated zero-channel testnet profile.</span></label>
          <button className="danger full-width" disabled={busy || !approved || !archiveFromFile || !archive || !host.current?.canSimulateLoss || !!pendingJournal || !!journalError} onClick={() => void run("Simulating whole-profile loss on newly created lab state", async () => {
            const h = requireHost(); const decoded = await matchingArchive(h);
            // Critically: a stale backup must NEVER authorize deleting newer local node data.
            // Compare the entire observed cold database with the imported archive first.
            const source = await h.verifyRestoredBytes(decoded.nativeBackup);
            const expected = await recordSource(h, decoded.nativeBackup);
            if (source.checksum !== expected.backupChecksum) throw new Error("Saved archive is stale or differs from current IndexedDB; deliberate deletion BLOCKED.");
            await h.simulateLossForZeroChannelProfile(); setApproved(false);
            event("dedicated-zero-channel-database-deleted", { database: h.databaseName, archiveVerifiedAgainstOriginal: true });
          })}>Simulate local loss (only newly created owned profile)</button>
          <button className="primary full-width" disabled={busy || !archiveFromFile || !archive || !stopped || !!pendingJournal || !!journalError} onClick={() => void run("Restoring the complete IndexedDB profile", async () => {
            const h = requireHost(); const decoded = await matchingArchive(h);
            const meta = await recordSource(h, decoded.nativeBackup);
            // Preflight all non-mutating work before committing the persistent marker.
            await h.withColdStore(async store => {
              const state = await store.presence();
              if (state !== "absent" && state !== "empty") throw new Error("Occupied target: never overwrite a node database, even if the keys match.");
            });
            beginColdRestore(meta); // durable marker BEFORE any writes
            await h.withColdStore(async store => { await store.restoreBytes(decoded.nativeBackup); });
            // Independently re-open and hash ALL restored records before permitting startup.
            await offlineReadback(h);
            event("whole-profile-restored", { database: h.databaseName, scope: "cold-testnet-zero-channel", safety: "local-integrity-only" });
          })}>Restore whole profile (absent/empty target only)</button>
          <button className="ghost full-width" disabled={busy || !archiveFromFile || !archive || !stopped || !pendingJournal || !!journalError} onClick={() => void run("Resuming read-only verification after interruption", async () => {
            const h = requireHost();
            // Safe even for a journal stuck at 'mutating': NO second restore is attempted.
            await offlineReadback(h);
            event("interrupted-recovery-resumed", { operation: "read-only-full-idb-compare", recoveryMutation: false });
          })}>Resume interrupted restore — verify bytes without rewriting</button>
          <button className="ghost full-width" disabled={busy || !restored || !stopped || !archiveFromFile || !!journalError} onClick={() => void run("Explicitly restarting the isolated zero-channel node", async () => {
            const h = requireHost(); const decoded = await matchingArchive(h);
            const meta = await recordSource(h, decoded.nativeBackup);
            await h.verifyRestoredBytes(decoded.nativeBackup); // check again immediately before startup
            const current = readColdJournal(h.prefix);
            if (!current || current.stage !== "readback-verified" || current.backupChecksum !== meta.backupChecksum ||
                current.database !== meta.database || current.nodeId !== meta.nodeId) throw new Error("Persistent recovery journal is not readback-verified for this exact source.");
            const after = await h.start(true); // explicit override ONLY for matching verified journal
            if (after.nodeId !== decoded.snapshot.nodeId || after.capabilities.channels === "unavailable" || after.channels.length !== 0) {
              throw new Error("Restarted node identity/channel state is not verified; keep recovery quarantined.");
            }
            const info = await h.observe(); setSnapshot(info.snapshot); setPeers(info.peers);
            if (info.snapshot.nodeId !== decoded.snapshot.nodeId || info.snapshot.capabilities.channels === "unavailable" || info.snapshot.channels.length !== 0) {
              throw new Error("Post-restart observation differs. Reconciliation is NOT verified.");
            }
            recordColdRestart(h.prefix); setRestartVerified(true);
            event("zero-channel-restart-verified", { nodeId: info.snapshot.nodeId, zeroChannels: true,
              peerCount: info.peers, localStorageReadback: "matched", channelSafety: "not-established", paymentInvoiceCompleteness: "unknown" });
          })}>Explicitly restart and inspect — zero-channel only</button>
        </section>
      </div>
      <section className="panel">
        <h2>3. Recovery state and evidence</h2>
        <p><strong>Current operation:</strong> {status}</p>
        <p><strong>Profile:</strong> {profile} · <strong>IndexedDB:</strong> {host.current?.databaseName || "not discovered"} · <strong>Node:</strong> {snapshot?.nodeId || "not observed"}</p>
        <p><strong>Journal:</strong> {journalError ? `BLOCKED — ${journalError}` : journal?.stage || "No pending recovery"}. A journal in the mutating state can only advance through a complete, read-only authenticated database comparison.</p>
        <p><strong>Local record integrity:</strong> {readback} · <strong>Zero-channel restart:</strong> {restartVerified || journal?.stage === "restart-verified" ? "verified locally" : "not verified"} · <strong>Peers:</strong> {peers ?? "unavailable"}</p>
        <p><strong>Funded channel safety:</strong> not established. <strong>Payment/invoice reconciliation:</strong> unknown. <strong>Peer/chain confirmation:</strong> not established. Normal Fiber reestablishment is not sufficient proof of a safe commitment state.</p>
        <button className="ghost full-width" disabled={!evidence.length || !host.current} onClick={() => {
          const h = host.current!;
          downloadJson("fiber-real-testnet-redacted-evidence.json", {
            schema: "fiber-continuity-testnet-evidence-v0.8", generatedAt: new Date().toISOString(),
            scope: "actual-fiber-js-testnet-zero-channel-experiment", runtime: PINNED_FIBER_VERSION,
            verifiedFundedChannelRecovery: false, verifiedAtomicCheckpoint: false,
            credentialMaterialIncluded: false, operatorMustRunOnRealTestnet: true,
            recoveryStages: { storageReadback: readback, zeroChannelRestart: restartVerified ? "matched" : "not-tested",
              peerChannelSafety: "unverified", paymentInvoiceCoverage: "unavailable", journalStage: readColdJournal(profile)?.stage || "none" },
            observation: h.evidence(readback === "matched" ? "matched" : "not-run", peers), events: evidence
          });
        }}>Export redacted real-testnet evidence</button>
        <p>This export is a record of locally observed actions, not a fabricated certification. It excludes passwords, secret keys and raw IndexedDB data. Only an actual browser/testnet run can produce genuine runtime evidence.</p>
      </section>
    </>
  );
}
