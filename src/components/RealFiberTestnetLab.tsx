import { useEffect, useRef, useState, type ChangeEvent } from "react";
import publicTestnet from "../../public-testnet-config.json";
import { ManagedFiberTestnetHost, PINNED_FIBER_VERSION } from "../adapters/ManagedFiberTestnetHost";
import { createArchive, decryptArchive, parseArchive } from "../core/archive";
import type { RecoveryArchive, FiberSnapshot } from "../core/types";
import { downloadJson } from "../browser/files";
import { assertFiber091StorageContract } from "../adapters/Fiber091StorageContract";
import { verifyCkbTestnetRpc, inspectBrowserRecoveryReadiness, requestDurableBrowserStorage,
  type TestnetRpcCheck, type BrowserRecoveryReadiness } from "../core/testnetReadiness";
import { buildEvidenceChain, redactEvidenceValue } from "../core/reviewEvidence";
import { classifyHostedFailure, classifyColdExportFailure, type HostedFailureCategory, type ColdExportFailureReason } from "../core/hostedFailureCategory";
import {
  beginColdRestore, readColdJournal, recordColdReadback, recordColdRestart,
  type ColdRecoveryJournal
} from "../core/coldRecoveryJournal";

declare const __HOSTED_SOURCE_FINGERPRINT__: string;
const makePrefix = () => `fc-testnet-${crypto.randomUUID()}`;
const hex = (bytes: Uint8Array) => [...bytes].map(v => v.toString(16).padStart(2, "0")).join("");
const errorMessage = (error: unknown) => error instanceof Error ? error.message : String(error);
type Event = Record<string, unknown>;

type EvidenceStatus = "not-tested" | "matched" | "unverified";
type HostedSmokeReport = {
  schema: "fiber-continuity-hosted-evidence-v1";
  source: "interactive-browser" | "github-actions-browser";
  address: string; runId: string; mode: "non-destructive-smoke" | "disposable-full-cycle";
  failurePhase?: string;
  failureCategory?: HostedFailureCategory;
  /** Real browser negative controls; passing requires observing explicit refusal. */
  negativeChecks: {
    wrongPasswordRejected: boolean;
    tamperedArchiveRejected: boolean;
    occupiedRestoreRejected: boolean;
    interruptedRestartBlocked: boolean;
  };
  storageFailureReason?: ColdExportFailureReason;
  checks: {
    browserReady: boolean; testnetVerified: boolean; actualWasmNodeStarted: boolean;
    zeroChannelsObserved: boolean; workersStopped: boolean;
    encryptedColdBackup: boolean; archiveRoundtrip: boolean;
    stoppedDatabaseReadback: boolean; disposableProfileDeleted: boolean;
    wholeProfileRestored: boolean; zeroChannelRestartVerified: boolean;
    fundedChannelRecoveryVerified: false;
  };
};
function blankReport(source: HostedSmokeReport["source"], mode: HostedSmokeReport["mode"]): HostedSmokeReport {
  return { schema: "fiber-continuity-hosted-evidence-v1", source,
    address: publicTestnet.watchedAddress, runId: crypto.randomUUID(), mode,
    negativeChecks: { wrongPasswordRejected: false, tamperedArchiveRejected: false, occupiedRestoreRejected: false, interruptedRestartBlocked: false }, checks: {
      browserReady: false, testnetVerified: false, actualWasmNodeStarted: false,
      zeroChannelsObserved: false, workersStopped: false, encryptedColdBackup: false,
      archiveRoundtrip: false, stoppedDatabaseReadback: false, disposableProfileDeleted: false,
      wholeProfileRestored: false, zeroChannelRestartVerified: false, fundedChannelRecoveryVerified: false
    } };
}

/** Real WASM testnet integration: a zero-channel experiment, not funded recovery. */
export default function RealFiberTestnetLab() {
  const host = useRef<ManagedFiberTestnetHost | null>(null);
  const [profile, setProfile] = useState(makePrefix);
  const [nodeKey, setNodeKey] = useState("");
  const [ckbKey, setCkbKey] = useState("");
  const [rpcUrl, setRpcUrl] = useState(publicTestnet.rpcUrl);
  const [watchStatus, setWatchStatus] = useState<null | Record<string, unknown>>(null);
  const [smokeResult, setSmokeResult] = useState<HostedSmokeReport | null>(null);
  const [logToken, setLogToken] = useState("");
  const [logStatus, setLogStatus] = useState("No evidence has been sent to Vercel Logs.");
  const [rpcCheck, setRpcCheck] = useState<TestnetRpcCheck | null>(null);
  const [browserCheck, setBrowserCheck] = useState<BrowserRecoveryReadiness | null>(null);
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
  const operationActive = useRef(false);
  useEffect(() => {
    // Browser unload is not a Fiber flush barrier. Warn rather than pretending
    // to synchronously commit worker storage during page teardown.
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      let interrupted = false;
      try { const marker = readColdJournal(profile); interrupted = Boolean(marker && marker.stage !== "restart-verified"); }
      catch { interrupted = true; }
      if (host.current?.running || operationActive.current || interrupted) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [profile]);
  const [readback, setReadback] = useState<EvidenceStatus>("not-tested");
  const [peers, setPeers] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);
  const [restartVerified, setRestartVerified] = useState(false);

  const event = (action: string, more: Event = {}) =>
    setEvidence(old => [...old, redactEvidenceValue({ at: new Date().toISOString(), action, ...more }) as Event]);
  const run = async (label: string, task: () => Promise<void>) => {
    if (operationActive.current) return;
    operationActive.current = true;
    setBusy(true);
    setStatus(`${label}…`);
    try {
      await task();
      setStatus(`${label} completed. Funded-channel recovery remains UNSUPPORTED.`);
    } catch (error) {
      const message = errorMessage(error);
      setStatus(`BLOCKED: ${message}`);
      event("blocked", { operation: label, error: message });
    } finally { operationActive.current = false; setBusy(false); }
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
    if (!Array.isArray(decoded.snapshot.channels) || decoded.snapshot.channels.length !== 0 ||
        decoded.snapshot.capabilities.channels === "unavailable") {
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

  /** Safe automation: new random unfunded profile, never the user's watched wallet.
   * Full cycle deletes ONLY the isolated fresh test DB, after comparing the exact
   * authenticated archive; no funded channels can pass the gate.
   */
  const runHostedSmoke = async (mode: HostedSmokeReport["mode"]) => {
    if (operationActive.current || host.current?.running) return;
    operationActive.current = true; setBusy(true); setLogStatus("Hosted smoke test in progress");
    const report = blankReport("interactive-browser", mode);
    const prefix = `fc-testnet-autosmoke-${crypto.randomUUID()}`;
    let temporaryHost: ManagedFiberTestnetHost | null = null;
    // Machine-readable safe phase/category appear in CI evidence; raw error text
    // stays in the local browser UI and is never sent to the hosted reporter.
    let phase = "browser-readiness";
    try {
      const browser = await inspectBrowserRecoveryReadiness();
      if (!browser.canRun) throw new Error(`Browser readiness failed: ${browser.warnings.join(" ")}`);
      report.checks.browserReady = true;
      phase = "ckb-rpc-preflight";
      const rpc = await verifyCkbTestnetRpc(rpcUrl);
      if (rpc.initialBlockDownload) throw new Error("CKB RPC is not synchronized yet.");
      report.checks.testnetVerified = true;
      const tempHex = () => hex(crypto.getRandomValues(new Uint8Array(32)));
      // Ephemeral secrets and passphrase never enter logs, archives or React state.
      const originalNodeSecret = tempHex(), originalCkbSecret = tempHex(), passphrase = `${tempHex()}${tempHex()}`;
      phase = "fiber-config-create";
      const h = await ManagedFiberTestnetHost.create({prefix, fiberKeyHex:originalNodeSecret,
        ckbKeyHex:originalCkbSecret, ckbRpcUrl:rpcUrl});
      temporaryHost = h;
      phase = "fiber-wasm-start";
      const started = await h.start();
      report.checks.actualWasmNodeStarted = true;
      phase = "fiber-observe";
      const observation = await h.observe();
      if (started.capabilities.channels === "unavailable" || started.channels.length !== 0 ||
          observation.snapshot.capabilities.channels === "unavailable" || observation.snapshot.channels.length !== 0) {
        throw new Error("Node has channels or unknown channel state; browser smoke test BLOCKED.");
      }
      report.checks.zeroChannelsObserved = true;
      phase = "fiber-stop";
      await h.stop();
      report.checks.workersStopped = true;
      phase = "cold-store-export";
      const stable = await h.withColdStore(store => store.exportStableBytes());
      phase = "cold-store-schema";
      assertFiber091StorageContract(stable.dump);
      phase = "archive-encryption";
      const encrypted = await createArchive(h.snapshot!, stable.bytes, passphrase);
      report.checks.encryptedColdBackup = true;
      phase = "archive-decryption";
      const restoredArchive = await decryptArchive(parseArchive(JSON.stringify(encrypted)), passphrase);
      if (restoredArchive.snapshot.nodeId !== started.nodeId) throw new Error("Archive node identity mismatch.");
      report.checks.archiveRoundtrip = true;
      // Negative controls execute in the REAL browser against this run's genuine
      // encrypted archive. A rejection counts only for the expected reason.
      phase = "archive-decryption";
      try {
        await decryptArchive(encrypted, `${passphrase}-incorrect`);
        throw new Error("Unsafe archive authentication: wrong password accepted.");
      } catch (error) {
        if (/Unsafe archive authentication/.test(errorMessage(error))) throw error;
        report.negativeChecks.wrongPasswordRejected = true;
      }
      const altered = structuredClone(encrypted);
      altered.ciphertext = (altered.ciphertext[0] === "A" ? "B" : "A") + altered.ciphertext.slice(1);
      try {
        await decryptArchive(parseArchive(JSON.stringify(altered)), passphrase);
        throw new Error("Unsafe archive authentication: ciphertext tampering accepted.");
      } catch (error) {
        if (/Unsafe archive authentication/.test(errorMessage(error))) throw error;
        report.negativeChecks.tamperedArchiveRejected = true;
      }
      // A genuine, populated Fiber database must reject a restore BEFORE any write.
      // Execute under the same cold lease used by recovery. Do not count unrelated
      // failures as evidence of an occupancy guard.
      await h.withColdStore(async store => {
        if (await store.presence() !== "occupied") throw new Error("Expected a populated test profile before occupied-target negative check.");
        try {
          await store.restoreBytes(restoredArchive.nativeBackup);
          throw new Error("Unsafe occupied target: restore was accepted.");
        } catch (error) {
          if (!/Refusing to replace nonempty IndexedDB node state/.test(errorMessage(error))) throw error;
          report.negativeChecks.occupiedRestoreRejected = true;
        }
      });
      phase = "cold-readback";
      await h.verifyRestoredBytes(restoredArchive.nativeBackup);
      report.checks.stoppedDatabaseReadback = true;
      if (mode === "disposable-full-cycle") {
        if (!h.canSimulateLoss) throw new Error("Disposable profile was not authenticated as newly created and stopped.");
        const meta = {profile:h.prefix, database:h.databaseName, nodeId:h.nodeId,
          backupChecksum:stable.dump.checksum};
        // Authenticated backup and entire live DB are compared UNDER the same
        // exclusive Web Lock as deletion. Any mismatch aborts without deletion.
        phase = "disposable-database-delete";
        await h.simulateLossForZeroChannelProfile(restoredArchive.nativeBackup);
        report.checks.disposableProfileDeleted = true;
        await h.withColdStore(async store => {
          if (await store.presence() !== "absent") throw new Error("Disposable loss did not produce an absent target.");
        });
        beginColdRestore(meta);
        // The journal MUST block any restart between intentional data loss and
        // completed authenticated readback; the test executes this refusal against
        // the actual host, before attempting the recovery write.
        try {
          await h.start(true);
          throw new Error("Unsafe restart: mutating recovery journal was bypassed.");
        } catch (error) {
          if (!/Recovery is mutating/.test(errorMessage(error))) throw error;
          report.negativeChecks.interruptedRestartBlocked = true;
        }
        phase = "cold-profile-restore";
        await h.withColdStore(store => store.restoreBytes(restoredArchive.nativeBackup));
        await h.verifyRestoredBytes(restoredArchive.nativeBackup);
        recordColdReadback(meta);
        report.checks.wholeProfileRestored = true;
        phase = "fiber-wasm-restart";
        const restarted = await h.start(true);
        if (restarted.nodeId !== started.nodeId || restarted.channels.length !== 0 ||
            restarted.capabilities.channels === "unavailable") throw new Error("Restarted identity or zero-channel status differs.");
        const after = await h.observe();
        if (after.snapshot.nodeId !== started.nodeId || after.snapshot.channels.length !== 0 ||
            after.snapshot.capabilities.channels === "unavailable") throw new Error("Post-restart observation mismatch.");
        recordColdRestart(prefix);
        await h.stop();
        report.checks.zeroChannelRestartVerified = true;
        setLogStatus("ISOLATED TEST: whole-node loss → restored full IndexedDB → zero-channel restart verified locally. No real wallet or funded channel touched.");
      } else setLogStatus("Browser smoke passed: actual Fiber WASM + full cold archive/readback. No deletion attempted.");
    } catch (error) {
      report.failurePhase = phase;
      report.failureCategory = classifyHostedFailure(error);
      if (phase === "cold-store-export") report.storageFailureReason = classifyColdExportFailure(error);
      setLogStatus(`Browser smoke incomplete: ${errorMessage(error)}`);
    } finally {
      if (temporaryHost?.running) {
        try { await temporaryHost.stop(); } catch { /* Failed shutdown is a blocked safety outcome. */ }
      }
      setSmokeResult({...report, checks:{...report.checks}});
      setBusy(false); operationActive.current = false;
      // Only disposable full-cycle runs mutate a freshly generated test profile;
      // runner browser contexts are discarded after each hosted CI run.
    }
  };
  const sendSmokeEvidence = async () => {
    if (!smokeResult || !logToken || busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/evidence", {method:"POST", cache:"no-store", credentials:"omit",
        headers:{"content-type":"application/json", "authorization":`Bearer ${logToken}`}, body:JSON.stringify(smokeResult)});
      if (!response.ok) throw new Error(`Vercel endpoint returned HTTP ${response.status}. Check your server-only token.`);
      setLogStatus("Vercel accepted the sanitized smoke summary. Open Vercel → Logs → /api/evidence.");
    } catch (error) { setLogStatus(`Evidence not published: ${errorMessage(error)}`); }
    finally { setBusy(false); }
  };
  const refreshWatchStatus = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const reply = await fetch("/api/watch-status", {cache:"no-store", credentials:"omit"});
      const data = await reply.json() as Record<string, unknown>;
      if (!reply.ok) throw new Error("Testnet monitor unavailable. See Vercel → Logs or try again later.");
      setWatchStatus(data);
    } catch (error) { setWatchStatus({error:errorMessage(error), verified:false}); }
    finally { setBusy(false); }
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
      <section className="panel" id="hosted-automation">
        <h2>Hosted testnet wallet & automatic evidence</h2>
        <p><strong>Watched address (public, read-only):</strong> <code style={{overflowWrap:"anywhere"}}>{publicTestnet.watchedAddress}</code></p>
        <p><a href={`${publicTestnet.explorerOrigin}/address/${publicTestnet.watchedAddress}`} target="_blank" rel="noreferrer">View public address on Pudge Explorer ↗</a></p>
        <p>This address is <strong>not</strong> the signing address generated for the new Fiber node below. Its private key is not available to FiberContinuity. Automated tests use separate disposable <strong>unfunded</strong> profiles.</p>
        <button className="ghost full-width" disabled={busy} onClick={() => void refreshWatchStatus()}>Check watched address on real CKB testnet</button>
        {watchStatus && <p data-testid="watched-address-status"><strong>Chain:</strong> {String(watchStatus.network ?? "unverified")}
          {watchStatus.complete === true ? ` · Capacity: ${String(watchStatus.capacityCKB)} CKB · Live cells: ${String(watchStatus.liveCells)}` : " · Capacity unavailable/incomplete (do not infer zero balance)"}
          {watchStatus.error ? ` · ${String(watchStatus.error)}` : ""}</p>}
        <button className="primary full-width" data-testid="run-hosted-smoke" disabled={busy || host.current?.running} onClick={() => void runHostedSmoke("non-destructive-smoke")}>
          Auto-run safe Fiber testnet smoke (zero-channel, no deletion)
        </button>
        <span hidden data-testid="hosted-build-fingerprint">{__HOSTED_SOURCE_FINGERPRINT__}</span>
        <button className="ghost full-width" data-testid="run-hosted-full-cycle" disabled={busy || host.current?.running} onClick={() => void runHostedSmoke("disposable-full-cycle")}>
          Auto-run isolated zero-channel FULL recovery (deletes ONLY newly-created disposable profile)
        </button>
        <p>Safe smoke: real WASM start → stopped whole-IndexedDB archive → archive serialization/authentication → readback without deletion. Full-cycle test additionally deletes only its own fresh <code>fc-testnet-autosmoke-…</code> database after exact archive comparison, restores it and verifies an explicit restart. The browser also tests wrong passwords, ciphertext tampering, occupied restore refusal and interruption-journal restart refusal. Neither path uses the watched wallet, signs transactions or establishes funded-channel safety.</p>
        <p data-testid="hosted-smoke-status">{logStatus}</p>
        {smokeResult && <>
          <pre data-testid="hosted-smoke-result" style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{JSON.stringify(smokeResult, null, 2)}</pre>
          <button className="ghost full-width" onClick={() => downloadJson(`fiber-hosted-smoke-${smokeResult.runId}.json`,smokeResult)}>Download browser smoke evidence</button>
          <label className="field"><span>Optional Vercel EVIDENCE_INGEST_TOKEN (server configured, never saved)</span>
            <input type="password" autoComplete="off" value={logToken} onChange={e=>setLogToken(e.target.value)} /></label>
          <button className="ghost full-width" disabled={busy || !logToken} onClick={() => void sendSmokeEvidence()}>Send sanitized summary to Vercel Logs</button>
        </>}
        <p>Automatic unattended runs are managed by GitHub Actions on hosted Chromium; daily chain/address checks run in Vercel Cron. You do not need to execute code on your computer.</p>
      </section>
      <div className="two-column">
        <section className="panel">
          <h2>1. Start and stop a dedicated testnet profile</h2>
          <p><strong>Use case reviewed by Fiber maintainers:</strong> a browser-based, self-custodial Testnet app needs to recover its <strong>entire stopped node database</strong> after losing the original browser profile. Keep the exported encrypted archive, original Fiber/CKB testnet keys, profile name and RPC configuration outside the affected browser. Device-to-device funded-channel migration and individual-channel rollback are NOT supported.</p>
          <p><strong>Maintainer workflow:</strong> stop the node → export every IndexedDB record → authenticate the saved archive → restore into an absent or verified-empty database while stopped → restart and inspect. Fiber JS v0.9.1 does not acknowledge completed worker writes on <code>stop()</code>; matching reads are only an experimental zero-channel check, not a guaranteed consistent checkpoint. See <a href="https://github.com/nervosnetwork/fiber/pull/1699" target="_blank" rel="noreferrer">upstream shutdown PR #1699</a> for the proposed fix; use a released, tested implementation before claiming stronger guarantees.</p>
          <label className="field"><span>Unique testnet profile (save with archive)</span><input value={profile} onChange={(e: ChangeEvent<HTMLInputElement>) => setProfile(e.target.value)} disabled={!!host.current || busy} /></label>
          <label className="field"><span>Trusted CKB testnet HTTPS RPC endpoint</span><input value={rpcUrl} onChange={(e: ChangeEvent<HTMLInputElement>) => { setRpcUrl(e.target.value); setRpcCheck(null); }} placeholder="https://your-ckb-testnet-rpc.example" disabled={!!host.current || busy} /></label>
          <button className="ghost full-width" disabled={busy} onClick={() => void run("Checking browser isolation, storage and actual CKB network", async () => {
            const browser = await inspectBrowserRecoveryReadiness(); setBrowserCheck(browser);
            if (!browser.canRun) throw new Error(browser.warnings.join(" "));
            const rpc = await verifyCkbTestnetRpc(rpcUrl); setRpcCheck(rpc);
            event("preflight-ckb-testnet-verified", { chain: rpc.chain, initialBlockDownload: rpc.initialBlockDownload,
              browserStoragePersistence: browser.persistentStorage, freeStorageBytes: browser.estimatedFreeBytes });
          })}>Check browser and testnet RPC</button>
          <p><strong>Browser readiness:</strong> {browserCheck ? browserCheck.canRun ? "usable" : "blocked" : "not checked"};
            <strong> RPC network:</strong> {rpcCheck?.chain ?? "not checked"}.
            {browserCheck?.warnings.map((warning, i) => <span key={i}> {warning}</span>)}
            {rpcCheck?.initialBlockDownload ? " RPC is still in initial-block download; use a synced endpoint." : ""}</p>
          <button className="ghost full-width" disabled={busy} onClick={() => void run("Requesting browser persistent storage", async () => {
            const persisted = await requestDurableBrowserStorage();
            const browser = await inspectBrowserRecoveryReadiness(); setBrowserCheck(browser);
            event("persistent-storage-requested", { granted: persisted });
            setStatus(persisted ? "Browser granted persistent site storage. Keep off-device archives anyway." :
              "Browser did not grant persistence; local state may still be evicted.");
          })}>Request persistent browser storage</button>
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
            // The host checks the RPC again immediately before starting actual workers.
            const h = await ManagedFiberTestnetHost.create({ prefix: profile, fiberKeyHex: nodeKey, ckbKeyHex: ckbKey, ckbRpcUrl: rpcUrl });
            host.current = h;
            try {
              const s = await h.start(); setSnapshot(s);
              setRpcCheck(h.lastRpcCheck);
              event("real-testnet-node-started", { runtime: PINNED_FIBER_VERSION, database: h.databaseName, nodeId: s.nodeId, channels: s.channels.length, rpcChainVerified: h.lastRpcCheck?.chain ?? "not-checked" });
            } catch (error) {
              // A failed Fiber.stop() keeps workers potentially alive. Retain the
              // managed host so the operator can attempt an explicit safe stop.
              if (!h.running) host.current = null;
              throw error;
            }
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
            // A second byte-for-byte check and deletion now occur UNDER ONE Web Lock.
            await recordSource(h, decoded.nativeBackup);
            await h.simulateLossForZeroChannelProfile(decoded.nativeBackup); setApproved(false);
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
          <button className="ghost full-width" disabled={busy || !archiveFromFile || !archive || !stopped || journal?.stage !== "mutating" || !!journalError} onClick={() => void run("Resuming a failed-before-write restore into an ABSENT database", async () => {
            const h = requireHost(); const decoded = await matchingArchive(h);
            const meta = await recordSource(h, decoded.nativeBackup);
            const pending = readColdJournal(h.prefix);
            if (!pending || pending.stage !== "mutating" || pending.backupChecksum !== meta.backupChecksum ||
                pending.nodeId !== meta.nodeId || pending.database !== meta.database) {
              throw new Error("Interrupted recovery marker does not match the authenticated source.");
            }
            // Refuse even a schema-only/empty database; the previous write might
            // have partially initialized it or have completed with no records.
            await h.withColdStore(async store => {
              if (await store.presence() !== "absent") {
                throw new Error("The target is not ABSENT. Do not retry a write; use read-only verification or manual investigation.");
              }
              await store.restoreBytes(decoded.nativeBackup);
            });
            await offlineReadback(h);
            event("absent-target-interrupted-recovery-resumed", { archiveChecksum: meta.backupChecksum, retryCondition: "database-absent-only" });
          })}>Retry interrupted restore ONLY if database is absent</button>
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
        <p><strong>Journal:</strong> {journalError ? `BLOCKED — ${journalError}` : journal?.stage || "No pending recovery"}. An interrupted restore requires read-only verification; a retry is allowed only when its entire target database is absent and the authenticated source matches.</p>
        <p><strong>Local record integrity:</strong> {readback} · <strong>Zero-channel restart:</strong> {restartVerified || journal?.stage === "restart-verified" ? "verified locally" : "not verified"} · <strong>Peers:</strong> {peers ?? "unavailable"}</p>
        <p><strong>Funded channel safety:</strong> not established. <strong>Payment/invoice reconciliation:</strong> unknown. <strong>Peer/chain confirmation:</strong> not established. Normal Fiber reestablishment is not sufficient proof of a safe commitment state.</p>
        <button className="ghost full-width" disabled={!evidence.length || !host.current || busy} onClick={() => void run("Exporting verifiable redacted testnet evidence", async () => {
          const h = host.current!;
          const chain = await buildEvidenceChain(evidence);
          downloadJson("fiber-real-testnet-redacted-evidence.json", {
            schema: "fiber-continuity-testnet-evidence-v0.9", generatedAt: new Date().toISOString(),
            scope: "actual-fiber-js-testnet-zero-channel-experiment", runtime: PINNED_FIBER_VERSION,
            verifiedFundedChannelRecovery: false, verifiedAtomicCheckpoint: false,
            shutdownGuarantee: "fiber-js-0.9.1-does-not-acknowledge-idb-flush",
            credentialMaterialIncluded: false, operatorMustRunOnRealTestnet: true,
            recoveryStages: { storageReadback: readback, zeroChannelRestart: restartVerified ? "matched" : "not-tested",
              peerChannelSafety: "unverified", paymentInvoiceCoverage: "unavailable", journalStage: readColdJournal(profile)?.stage || "none" },
            checks: {
              actualWasmNodeStarted: evidence.some(item => item.action === "real-testnet-node-started"),
              rpcTestnetVerified: h.lastRpcCheck?.chain === "ckb_testnet",
              completeStoppedDatabaseMatched: readback === "matched",
              zeroChannelRestartVerified: restartVerified,
              externalPeerReconciliation: "unverified",
              fundedChannelRecovery: "unsupported",
              atomicCheckpointAndWorkerFlush: "unverified"
            },
            observation: h.evidence(readback === "matched" ? "matched" : "not-run", peers),
            evidenceChain: chain,
            evidenceIntegrityMeaning: "Hash linked after local export. Not cryptographically signed or externally attested. Redacted events may be edited and rehashed by a malicious author."
          });
        })}>Export redacted real-testnet evidence</button>
        <p>This export is a record of locally observed actions, not a fabricated certification. It excludes passwords, secret keys and raw IndexedDB data. Only an actual browser/testnet run can produce genuine runtime evidence.</p>
      </section>
    </>
  );
}
