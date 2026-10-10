import { useRef, useState, type ChangeEvent } from "react";
import { ManagedFiberTestnetHost, PINNED_FIBER_VERSION } from "../adapters/ManagedFiberTestnetHost";
import { createArchive, decryptArchive, parseArchive } from "../core/archive";
import type { RecoveryArchive, FiberSnapshot } from "../core/types";
import { downloadJson } from "../browser/files";
import { assertFiber091StorageContract } from "../adapters/Fiber091StorageContract";

const prefix = () => `fc-testnet-${crypto.randomUUID()}`;
const hex = (bytes: Uint8Array) => [...bytes].map(v => v.toString(16).padStart(2, "0")).join("");
const errorMessage = (e: unknown) => e instanceof Error ? e.message : String(e);

/** A deliberately limited real-node TESTNET lab: no sendPayment/openChannel UI. */
export default function RealFiberTestnetLab() {
  const host = useRef<ManagedFiberTestnetHost | null>(null);
  const [profile, setProfile] = useState(prefix);
  const [nodeKey, setNodeKey] = useState("");
  const [ckbKey, setCkbKey] = useState("");
  const [rpcUrl, setRpcUrl] = useState("");
  const [peerAddress, setPeerAddress] = useState("");
  const [peerPubkey, setPeerPubkey] = useState("");
  const [password, setPassword] = useState("");
  const [archive, setArchive] = useState<RecoveryArchive | null>(null);
  const [snapshot, setSnapshot] = useState<FiberSnapshot | null>(null);
  const [status, setStatus] = useState("No live node initialized. This is a restricted testnet experiment.");
  const [evidence, setEvidence] = useState<Array<Record<string, unknown>>>([]);
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [readback, setReadback] = useState<"not-run" | "matched">("not-run");
  const [peers, setPeers] = useState<number | null>(null);
  const [restored, setRestored] = useState(false);
  const event = (action: string, more: Record<string, unknown> = {}) => setEvidence(old => [...old, { at: new Date().toISOString(), action, ...more }]);
  async function run(name: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setStatus(`${name}...`);
    try { await fn(); setStatus(`${name} completed. Safety of funded channels is NOT established.`); }
    catch (err) { setStatus(`BLOCKED: ${errorMessage(err)}`); event("blocked", { operation: name, error: errorMessage(err) }); }
    finally { setBusy(false); }
  }
  const requireHost = () => {
    if (!host.current) throw new Error("Initialize and start the node first.");
    return host.current;
  };
  const matchingArchive = async (h: ManagedFiberTestnetHost) => {
    if (!archive || password.length < 12) throw new Error("Import/select an archive and enter its password (12+ characters).");
    const decoded = await decryptArchive(archive, password);
    if (decoded.snapshot.adapter !== "fiber-js" || decoded.snapshot.network !== "testnet" ||
        decoded.snapshot.networkIdentity !== h.networkIdentity || decoded.snapshot.nodeId !== h.nodeId ||
        decoded.snapshot.fiberVersion !== PINNED_FIBER_VERSION) throw new Error("Archive does not match the pinned network, configuration, version and original Fiber node identity.");
    if (decoded.snapshot.channels.length !== 0 || decoded.snapshot.capabilities.channels === "unavailable") {
      throw new Error("Funded or uninspectable channel backups are not restorable in this experimental browser lab.");
    }
    return decoded;
  };
  return (
    <>
      <div className="demo-banner"><strong>REAL FIBER JS 0.9.1 · TESTNET ONLY</strong><span>Actual WASM node, actual IndexedDB and optional WSS peer observation. No funds/channels, no guaranteed flush barrier or live-channel recovery.</span></div>
      <div className="page-heading compact"><div><div className="eyebrow">OPT-IN REAL NODE EXPERIMENT</div><h1>Verify an actual Fiber browser profile.</h1><p>This lab connects to a real fiber-js testnet node, discovers its IndexedDB database, exports an encrypted cold backup, and permits restoration of a zero-channel, lab-owned profile. It intentionally does not claim safe restoration of funded channels.</p></div></div>
      <div className="two-column">
        <section className="panel">
          <h2>1. Set up isolated testnet profile</h2>
          <label className="field"><span>Unique testnet profile (save with archive)</span><input value={profile} onChange={(e: ChangeEvent<HTMLInputElement>)=>setProfile(e.target.value)} disabled={!!host.current || busy} /></label>
          <label className="field"><span>CKB testnet RPC endpoint (HTTPS)</span><input value={rpcUrl} onChange={(e: ChangeEvent<HTMLInputElement>)=>setRpcUrl(e.target.value)} placeholder="https://your-testnet-ckb-rpc.example" disabled={!!host.current || busy}/></label>
          <label className="field"><span>Original Fiber secret identity (64 hex characters — never shared)</span><input type="password" autoComplete="off" value={nodeKey} onChange={(e: ChangeEvent<HTMLInputElement>)=>setNodeKey(e.target.value)} disabled={!!host.current || busy}/></label>
          <label className="field"><span>Original CKB signing secret (64 hex characters, testnet key only)</span><input type="password" autoComplete="off" value={ckbKey} onChange={(e: ChangeEvent<HTMLInputElement>)=>setCkbKey(e.target.value)} disabled={!!host.current || busy}/></label>
          <button className="ghost full-width" disabled={busy || !!host.current} onClick={()=>{
            setNodeKey(hex(crypto.getRandomValues(new Uint8Array(32))));
            setCkbKey(hex(crypto.getRandomValues(new Uint8Array(32))));
          }}>Generate two independent testnet-only keys</button>
          <button className="ghost full-width" disabled={!nodeKey} onClick={()=>void navigator.clipboard.writeText(nodeKey).then(()=>setStatus("Fiber identity key copied; keep it private.")).catch(()=>setStatus("Clipboard denied; select/copy key manually."))}>Copy Fiber identity key (secret!)</button>
          <button className="ghost full-width" disabled={!ckbKey} onClick={()=>void navigator.clipboard.writeText(ckbKey).then(()=>setStatus("CKB signing key copied; keep it private.")).catch(()=>setStatus("Clipboard denied; select/copy key manually."))}>Copy CKB signing key (secret!)</button>
          <p>Save BOTH original keys securely outside this page. The archive intentionally excludes them; the same two keys must be provided after reload. Do not enter mainnet keys.</p>
          <button className="primary full-width" disabled={busy || !!host.current} onClick={()=>void run("Starting actual Fiber WASM node", async()=>{
            const h=await ManagedFiberTestnetHost.create({prefix:profile,fiberKeyHex:nodeKey,ckbKeyHex:ckbKey,ckbRpcUrl:rpcUrl});
            host.current=h;
            try { const s=await h.start(); setSnapshot(s); event("real-node-start", {nodeId:s.nodeId,channels:s.channels.length,database:h.databaseName,version:PINNED_FIBER_VERSION}); }
            catch(e){host.current=null;throw e;}
          })}>Start real Fiber testnet node (no bootnodes)</button>
          <label className="field"><span>Optional public Fiber WSS multiaddr</span><input value={peerAddress} onChange={(e: ChangeEvent<HTMLInputElement>)=>setPeerAddress(e.target.value)} placeholder="/dns4/.../tcp/443/wss" disabled={busy}/></label>
          <label className="field"><span>Peer compressed public key (66 hex characters)</span><input value={peerPubkey} onChange={(e: ChangeEvent<HTMLInputElement>)=>setPeerPubkey(e.target.value)} disabled={busy}/></label>
          <button className="ghost full-width" disabled={busy || !host.current?.running} onClick={()=>void run("Connecting real testnet peer",async()=>{
            const h=requireHost();await h.connectPeer(peerAddress,peerPubkey);
            const info=await h.observe();setSnapshot(info.snapshot);setPeers(info.peers);
            event("testnet-peer-observed",{connectedPeers:info.peers,channelCount:info.snapshot.channels.length});
          })}>Connect peer and observe</button>
          <button className="ghost full-width" disabled={busy || !host.current?.running} onClick={()=>void run("Inspecting live node",async()=>{
            const info=await requireHost().observe();setSnapshot(info.snapshot);setPeers(info.peers);
            event("real-rpc-inspection",{channels:info.snapshot.channels.length,peers:info.peers});
          })}>Inspect real node and list channels/peers</button>
          <button className="primary full-width" disabled={busy || !host.current?.running} onClick={()=>void run("Stopping Fiber workers",async()=>{
            const h=requireHost();await h.stop();setSnapshot(h.snapshot);
            event("fiber-stop-terminated-workers",{upstreamFlushBarrier:"not-documented"});
          })}>Stop node before cold storage access</button>
        </section>
        <section className="panel">
          <h2>2. Cold backup, loss and restore</h2>
          <label className="field"><span>Recovery archive password (12+ characters)</span><input type="password" autoComplete="new-password" value={password} onChange={(e: ChangeEvent<HTMLInputElement>)=>setPassword(e.target.value)} /></label>
          <button className="primary full-width" disabled={busy || !host.current || host.current.running || password.length<12} onClick={()=>void run("Creating actual cold Fiber backup",async()=>{
            const h=requireHost();
            const snap=h.snapshot;
            if(!snap || snap.channels.length!==0 || snap.capabilities.channels==="unavailable") throw new Error("No validated zero-channel snapshot from before the worker stop.");
            const bytes=await h.withColdStore(async store=>{
              const output=await store.exportBytes();
              assertFiber091StorageContract(await store.validateBytes(output));
              return output;
            });
            // Worker stop is NOT an acknowledged flush barrier, so this lab never
            // treats the snapshot as an upstream-guaranteed atomic checkpoint.
            const saved=await createArchive(snap,bytes,password);
            setArchive(saved);setReadback("not-run");setRestored(false);
            event("real-cold-backup",{database:h.databaseName,realFiber:true,sourceChannels:h.snapshot?.channels.length,workerFlushGuarantee:"unverified"});
          })}>Create authenticated Fiber IndexedDB archive</button>
          <button className="ghost full-width" disabled={!archive} onClick={()=>archive&&downloadJson(`fiber-cold-testnet-${profile}.fcr.json`,archive)}>Export encrypted .fcr.json archive</button>
          <label className="field"><span>Import previously exported archive (same original profile)</span><input type="file" accept=".json,application/json" disabled={busy} onChange={(e: ChangeEvent<HTMLInputElement>)=>void (async()=>{
            const file=e.target.files?.[0]; if(!file)return;
            try {setArchive(parseArchive(await file.text()));setReadback("not-run");setStatus("Imported archive; verify credentials and original profile before restore.");}
            catch(err){setStatus(`Archive rejected: ${errorMessage(err)}`);}
          })()} /></label>
          <button className="ghost full-width" disabled={busy || !!host.current || !archive || password.length < 12} onClick={()=>void run("Preparing offline recovery profile without starting Fiber",async()=>{
            if (!archive) throw new Error("Import a recovery archive first.");
            const decoded=await decryptArchive(archive,password);
            const h=await ManagedFiberTestnetHost.create({prefix:profile,fiberKeyHex:nodeKey,ckbKeyHex:ckbKey,ckbRpcUrl:rpcUrl});
            await h.adoptColdRecoveryProfile(decoded.nativeBackup,decoded.snapshot);
            host.current=h;setSnapshot(decoded.snapshot);
            event("offline-recovery-profile-adopted",{database:h.databaseName,nodeId:h.nodeId,runtime:PINNED_FIBER_VERSION});
          })}>Prepare offline recovery after refresh (never starts Fiber first)</button>
          <label className="field"><span><input type="checkbox" checked={approved} onChange={(e: ChangeEvent<HTMLInputElement>)=>setApproved(e.target.checked)} /> I understand this DELETES the owned testnet-profile database after saving the archive, and I have no funded channels.</span></label>
          <button className="danger full-width" disabled={busy || !archive || !approved || !host.current || host.current.running} onClick={()=>void run("Simulating data loss in isolated empty-channel profile",async()=>{
            const h=requireHost();await matchingArchive(h);
            const check=await h.withColdStore(async store=>{const bytes=await store.exportBytes();return store.validateBytes(bytes);});
            assertFiber091StorageContract(check);
            await h.simulateLossForZeroChannelProfile();event("deliberate-zero-channel-profile-deletion",{database:h.databaseName});
          })}>Simulate local-state loss (ONLY owned lab profile)</button>
          <button className="primary full-width" disabled={busy || !archive || !host.current || host.current.running} onClick={()=>void run("Restoring complete real Fiber database and verifying readback",async()=>{
            const h=requireHost();const decoded=await matchingArchive(h);
            // Journal committed before any write, fail closed on interruption.
            const marker=`fiber-continuity-v07-testnet-quarantine:${h.prefix}`;
            const previous=localStorage.getItem(marker);
            if(previous)throw new Error("An earlier interrupted restore remains quarantined. Investigate it before continuing.");
            try {
              await h.withColdStore(async store=>{
                if(await store.presence()!=="absent" && await store.presence()!=="empty")throw new Error("Target database is occupied; cannot overwrite.");
                const verified=await store.validateBytes(decoded.nativeBackup);
                assertFiber091StorageContract(verified);
                localStorage.setItem(marker,JSON.stringify({at:new Date().toISOString(),stage:"mutating"}));
                await store.restoreBytes(decoded.nativeBackup);
              });
            } catch(e){throw e;}
            // Data restored and read-back verified; retain quarantine until an explicit restart.
            setReadback("matched");setRestored(true);
            event("whole-real-idb-restored-readback",{status:"local-integrity-matched",nodeId:decoded.snapshot.nodeId,channelSafety:"unverified",restart:"pending"});
          })}>Restore whole profile (strict empty target)</button>
          <button className="ghost full-width" disabled={busy || !restored || !host.current || host.current.running} onClick={()=>void run("Restarting restored zero-channel node",async()=>{
            const h=requireHost();const decoded=await matchingArchive(h);
            const after=await h.start();
            if(after.nodeId!==decoded.snapshot.nodeId || after.channels.length!==0)throw new Error("Post-restart state mismatches the restored node identity/channel count. Profile remains quarantined.");
            const info=await h.observe();setSnapshot(info.snapshot);setPeers(info.peers);
            localStorage.removeItem(`fiber-continuity-v07-testnet-quarantine:${h.prefix}`);
            event("restarted-real-fiber-zero-channel-profile",{identityMatched:true,localStorageVerified:true,peerCount:info.peers,channelSafety:"not-established"});
          })}>Explicitly restart and inspect (no automatic peers)</button>
        </section>
      </div>
      <section className="panel">
        <h2>3. Reviewable evidence</h2>
        <p><strong>Status:</strong> {status}</p>
        <p><strong>Actual IndexedDB:</strong> {host.current?.databaseName||"not discovered"} · <strong>Node:</strong> {snapshot?.nodeId||"not observed"}</p>
        <p><strong>Channel records:</strong> {snapshot?.channels.length??"unavailable"} · <strong>Connected peers:</strong> {peers??"unavailable"} · <strong>Readback:</strong> {readback}</p>
        <p><strong>Safety limitation:</strong> real Fibers' stop() has no documented flush barrier. Normal peer reconnection cannot prove a restored commitment is safe. This lab BLOCKS funded channel recovery, and does not expose payment or funding operations.</p>
        <button className="ghost full-width" disabled={!evidence.length || !host.current} onClick={()=>{
          const h=host.current!;downloadJson("fiber-real-testnet-redacted-evidence.json", {scope:"experimental-real-testnet-zero-channel", version:PINNED_FIBER_VERSION,
            notes:"No channel safety or crash-consistent checkpoint guarantee", credentialsIncluded:false,
            observation:h.evidence(readback,peers),events:evidence});
        }}>Download redacted real-Fiber evidence</button>
      </section>
    </>
  );
}
