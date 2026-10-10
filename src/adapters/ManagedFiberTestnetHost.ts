/**
 * Experimental, opt-in REAL @nervosnetwork/fiber-js 0.9.1 browser node host.
 * Deliberately testnet-only, isolated (no automatic bootnodes), without payment
 * or channel-writing UI. This is NOT a channel-safe restoration implementation:
 * Fiber.stop() terminates workers but does not document a flush/commit barrier.
 * Do not remove the zero-channel guard without an upstream checkpoint protocol.
 */
import type { Fiber } from "@nervosnetwork/fiber-js";
import { parseDocument } from "yaml";
import type { FiberSnapshot } from "../core/types";
import type { FiberLike } from "./FiberJsAdapter";
import { FiberJsAdapter } from "./FiberJsAdapter";
import { IndexedDbColdStore } from "./IndexedDbColdStore";
import { assertFiber091StorageContract } from "./Fiber091StorageContract";
import { createIndexedDbColdHooks, type ColdFiberHost } from "./createIndexedDbColdHooks";

export const PINNED_FIBER_VERSION = "0.9.1";
const PREFIX_RE = /^fc-testnet-[a-z0-9-]{8,90}$/;
const secret = (hex: string, label: string) => {
  if (!/^(?:0x)?[0-9a-fA-F]{64}$/.test(hex)) throw new Error(`${label} must be 32 bytes of hexadecimal.`);
  const chars = hex.replace(/^0x/, "");
  const n = BigInt(`0x${chars}`);
  if (n <= 0n || n >= BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141")) {
    throw new Error(`${label} is not a valid secp256k1 scalar.`);
  }
  return Uint8Array.from({ length: 32 }, (_, i) => parseInt(chars.slice(i * 2, i * 2 + 2), 16));
};
const sha = async (value: string) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)))].map(x => x.toString(16).padStart(2, "0")).join("");
const owned = (prefix: string, name: string) => name.includes(prefix);
function requireBrowser(): void {
  if (!globalThis.crossOriginIsolated || typeof SharedArrayBuffer !== "function") throw new Error("Fiber WASM requires a cross-origin-isolated browser with SharedArrayBuffer.");
  if (!navigator.locks?.request || !indexedDB.databases) throw new Error("Browser must support Web Locks and IndexedDB.databases() for exclusive testnet recovery.");
}
async function databases(): Promise<string[]> {
  return (await indexedDB.databases()).flatMap(db => db.name ? [db.name] : []);
}
/** Browser Web Lock held across an ACTIVE node lifetime, or across a COLD operation. */
async function exclusiveProfile(name: string): Promise<() => void> {
  requireBrowser();
  let unlock!: () => void;
  const untilRelease = new Promise<void>(resolve => { unlock = resolve; });
  let acquired!: (release: () => void) => void;
  let denied!: (error: Error) => void;
  const ready = new Promise<() => void>((resolve, reject) => { acquired = resolve; denied = reject; });
  void navigator.locks.request(`fiber-continuity-profile:${name}`, { mode: "exclusive", ifAvailable: true }, async lock => {
    if (!lock) { denied(new Error("This profile is in use by another cooperating browser tab.")); return; }
    acquired(unlock);
    await untilRelease;
  }).catch(error => denied(error instanceof Error ? error : new Error(String(error))));
  return ready;
}
export interface ManagedProfileOptions {
  prefix: string;
  fiberKeyHex: string;
  ckbRpcUrl: string;
  /** Required stable CKB signing key; never silently generate on restart. */
  ckbKeyHex: string;
}
export interface RealNodeEvidence {
  kind: "fiber-js-0.9.1-testnet-observation";
  at: string;
  prefix: string;
  databaseName: string | null;
  networkIdentity: string;
  nodeId: string | null;
  channelCount: number | null;
  peerCount: number | null;
  storageReadback: "not-run" | "matched";
  workerFlushGuarantee: "not-provided-by-upstream";
  channelSafety: "not-established";
}

export class ManagedFiberTestnetHost implements ColdFiberHost {
  readonly network = "testnet" as const;
  readonly fiberVersion = PINNED_FIBER_VERSION;
  readonly networkIdentity: string;
  readonly prefix: string;
  databaseName = "";
  nodeId = "";
  private fiber: Fiber | null = null;
  private activeRelease: (() => void) | null = null;
  private coldLeaseRelease: (() => void) | null = null;
  private lastSnapshot: FiberSnapshot | null = null;
  private readonly config: string;
  private readonly fiberKey: Uint8Array;
  private readonly ckbKey: Uint8Array;
  private readonly rpc: FiberLike = { invokeCommand: async (method, params) => {
    if (!this.fiber) throw new Error("Fiber is stopped; no RPC inspection is possible.");
    return this.fiber.invokeCommand(method, params);
  }};
  private adapter: FiberJsAdapter;
  private constructor(options: ManagedProfileOptions, config: string, identity: string) {
    this.prefix = options.prefix;
    this.config = config;
    this.networkIdentity = identity;
    this.fiberKey = secret(options.fiberKeyHex, "Fiber node identity key");
    this.ckbKey = secret(options.ckbKeyHex, "CKB secret");
    // No configured bootnodes: start and recovery restart cannot automatically contact peers.
    this.adapter = new FiberJsAdapter({ fiber: this.rpc, version: PINNED_FIBER_VERSION,
      network: "testnet", networkIdentity: identity,
      recoveryResourceId: `fiber-cold:${options.prefix}` });
  }
  static async create(options: ManagedProfileOptions): Promise<ManagedFiberTestnetHost> {
    requireBrowser();
    if (!PREFIX_RE.test(options.prefix)) throw new Error("Use a unique profile identifier beginning fc-testnet- (8-90 safe suffix characters).");
    if (!/^https:\/\//.test(options.ckbRpcUrl)) throw new Error("Provide a HTTPS CKB testnet RPC URL.");
    secret(options.ckbKeyHex, "CKB secret");
    secret(options.fiberKeyHex, "Fiber node identity key");
    // A Fiber object must only be created on a cross-origin-isolated page.
    const { Fiber } = await import("@nervosnetwork/fiber-js");
    const fiber = new Fiber(8 << 20, 8 << 20);
    try {
      const yaml = parseDocument(fiber.getDefaultConfig("testnet", options.ckbRpcUrl));
      yaml.setIn(["fiber", "bootnode_addrs"], []);
      yaml.setIn(["fiber", "announce_listening_addr"], false);
      const config = yaml.toString({ lineWidth: 0 });
      return new ManagedFiberTestnetHost(options, config, `testnet:fiber-js-0.9.1:config-sha256:${await sha(config)}`);
    } finally { await fiber.stop(); }
  }
  get running(): boolean { return this.fiber !== null; }
  get storageKnown(): boolean { return this.databaseName.length > 0; }
  get snapshot(): FiberSnapshot | null { return this.lastSnapshot; }
  private ensureNoChannels(snapshot: FiberSnapshot): void {
    if (snapshot.capabilities.channels === "unavailable" || snapshot.channels.length > 0) {
      throw new Error("LIVE CHANNEL STATE: cold recovery is disabled without an upstream verified atomic checkpoint and channel-safe reestablishment protocol.");
    }
  }
  /** Discover only an unambiguously new, solely host-owned IndexedDB profile. */
  async start(): Promise<FiberSnapshot> {
    requireBrowser();
    if (this.fiber) throw new Error("Node already running.");
    if (this.coldLeaseRelease) throw new Error("Cold recovery lease is active.");
    const release = await exclusiveProfile(this.prefix);
    this.activeRelease = release;
    let before: string[];
    try { before = await databases(); }
    catch (error) { this.activeRelease?.(); this.activeRelease = null; throw error; }
    if (!this.databaseName && before.some(name => owned(this.prefix, name))) {
      this.activeRelease?.(); this.activeRelease = null;
      throw new Error("Existing IndexedDB namespace found for this profile. Fresh experimental profiles must not attach to unreviewed pre-existing state.");
    }
    const { Fiber } = await import("@nervosnetwork/fiber-js");
    const instance = new Fiber();
    try {
      await instance.start(this.config, this.fiberKey, this.ckbKey, undefined, "error", this.prefix);
      this.fiber = instance;
      const snapshot = await this.adapter.inspect();
      if (this.nodeId && snapshot.nodeId !== this.nodeId) throw new Error("Persistent key returned a different Fiber node identity.");
      this.nodeId = snapshot.nodeId;
      const after = await databases();
      const candidates = after.filter(name => owned(this.prefix, name));
      const novel = after.filter(name => !before.includes(name));
      const scoped = this.databaseName && after.includes(this.databaseName)
        ? [this.databaseName] : candidates.length ? candidates : novel;
      if (scoped.length !== 1 || (this.databaseName && !scoped.includes(this.databaseName))) {
        throw new Error(`Cannot identify exactly one Fiber IndexedDB database for this isolated profile (candidates=${scoped.length}). Refusing to guess.`);
      }
      this.databaseName = scoped[0];
      this.ensureNoChannels(snapshot);
      this.lastSnapshot = snapshot;
      return snapshot;
    } catch (error) {
      await instance.stop().catch(() => {});
      this.fiber = null;
      this.activeRelease?.(); this.activeRelease = null;
      throw error;
    }
  }
  async observe(): Promise<{ snapshot: FiberSnapshot; peers: number | null }> {
    if (!this.fiber) throw new Error("Start the node first.");
    const snapshot = await this.adapter.inspect();
    const peers = await this.fiber.listPeers().catch(() => null);
    this.lastSnapshot = snapshot;
    const items = Array.isArray(peers) ? peers : peers && typeof peers === "object" && "peers" in peers ? (peers as { peers: unknown }).peers : null;
    return { snapshot, peers: Array.isArray(items) ? items.length : null };
  }
  async connectPeer(address: string, pubkey: string): Promise<void> {
    if (!this.fiber) throw new Error("Node is stopped.");
    if (!/\/wss(?:\/|$)/.test(address) || !/^[0-9a-fA-F]{66}$/.test(pubkey.replace(/^0x/, ""))) {
      throw new Error("Provide an explicit WSS multiaddr and a valid 33-byte compressed peer pubkey.");
    }
    // Only peer connect is exposed to the real testnet lab. No payments/channel writes.
    await this.fiber.connectPeer({ address: address.replace(/\/p2p\/[^/]+$/, ""), pubkey: pubkey.replace(/^0x/, ""), addr_type: "wss" });
  }
  async stop(): Promise<void> {
    if (!this.fiber) return;
    // Capture observable state BEFORE worker termination. No live channel state is accepted.
    const observed = await this.adapter.inspect();
    // Stop remains possible even if the node unexpectedly acquires channels.
    // Such state is explicitly excluded from the cold-backup/restore experiment.
    this.lastSnapshot = observed;
    const fiber = this.fiber;
    this.fiber = null;
    try { await fiber.stop(); }
    finally { this.activeRelease?.(); this.activeRelease = null; }
    // Upstream stop() does NOT guarantee a flush barrier; verified funded restores stay disabled.
  }
  /** Quiescent cold mode is never entered implicitly by preflight. */
  async acquireExclusiveRecoveryLease(): Promise<() => void> {
    if (this.fiber || this.activeRelease || this.coldLeaseRelease) throw new Error("Stop the node and finish active operations before cold recovery.");
    const release = await exclusiveProfile(this.prefix);
    this.coldLeaseRelease = release;
    return () => { if (this.coldLeaseRelease === release) { this.coldLeaseRelease = null; release(); } };
  }
  async assertOfflineAndExclusive(): Promise<void> {
    if (this.fiber || this.activeRelease || !this.coldLeaseRelease) throw new Error("Cold IndexedDB access requires an explicitly stopped node and exclusive recovery lease.");
    if (!this.databaseName) throw new Error("Real Fiber database name has not been discovered.");
  }
  async quiesceAndInspect(): Promise<FiberSnapshot> {
    await this.assertOfflineAndExclusive();
    if (!this.lastSnapshot) throw new Error("No captured pre-stop node snapshot available.");
    this.ensureNoChannels(this.lastSnapshot);
    return this.lastSnapshot;
  }
  async stopAndFence(): Promise<void> { await this.assertOfflineAndExclusive(); }
  async resumeAfterBackup(): Promise<void> { /* intentionally stopped: explicit operator action required */ }
  async startRestoredForIsolatedInspection(): Promise<void> {
    await this.assertOfflineAndExclusive();
    // Require the known source snapshot to contain ZERO channels before any worker starts.
    if (!this.lastSnapshot) throw new Error("Missing last-known source snapshot.");
    this.ensureNoChannels(this.lastSnapshot);
    // Cannot start under an exclusive cold lease in the same runtime; the experiment
    // starts only after an explicit operator release and uses no bootnode connections.
    throw new Error("Restored database remains offline for manual review. Release the cold lease, then explicitly start and inspect. A safe automatic restart is not documented by upstream.");
  }
  /** Used by the browser lab, not by the live engine: stopped complete DB transport. */
  async withColdStore<T>(task: (store: IndexedDbColdStore) => Promise<T>): Promise<T> {
    const release = await this.acquireExclusiveRecoveryLease();
    try { return await task(new IndexedDbColdStore(this.databaseName, () => this.assertOfflineAndExclusive())); }
    finally { release(); }
  }
  async simulateLossForZeroChannelProfile(): Promise<void> {
    await this.withColdStore(async store => {
      const state = await store.presence();
      if (state === "absent") throw new Error("No profile database exists.");
      const last = this.lastSnapshot;
      if (!last) throw new Error("Missing pre-loss state.");
      this.ensureNoChannels(last);
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.deleteDatabase(this.databaseName);
        req.onblocked = () => reject(new Error("Open IndexedDB connection blocks test-profile deletion."));
        req.onerror = () => reject(req.error ?? new Error("IndexedDB deletion failed."));
        req.onsuccess = () => resolve();
      });
    });
  }
  /** Cold recovery bootstrap after a page refresh, WITHOUT starting an empty new node. */
  async adoptColdRecoveryProfile(bytes: Uint8Array, snapshot: FiberSnapshot): Promise<void> {
    if (this.fiber || this.databaseName || this.nodeId) throw new Error("Recovery profile already initialized.");
    if (snapshot.network !== "testnet" || snapshot.adapter !== "fiber-js" ||
        snapshot.networkIdentity !== this.networkIdentity || snapshot.fiberVersion !== PINNED_FIBER_VERSION ||
        typeof snapshot.nodeId !== "string" || !snapshot.nodeId) throw new Error("Cold recovery source is incompatible with this pinned testnet configuration.");
    this.ensureNoChannels(snapshot);
    // Validation does not touch storage; no Fiber worker is started here.
    const json = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as { database?: string };
    if (typeof json.database !== "string" || !owned(this.prefix, json.database)) {
      throw new Error("Archive database name does not belong to the explicitly named dedicated testnet profile.");
    }
    const store = new IndexedDbColdStore(json.database, async () => {});
    const dump = await store.validateBytes(bytes);
    assertFiber091StorageContract(dump);
    this.databaseName = dump.database;
    this.nodeId = snapshot.nodeId;
    this.lastSnapshot = snapshot;
  }
  makeRecoveryAdapter(): FiberJsAdapter {
    if (!this.nodeId || !this.databaseName) throw new Error("Start/inspect a real node before using recovery adapters.");
    const hooks = createIndexedDbColdHooks(this);
    return new FiberJsAdapter({ fiber: this.rpc, version: PINNED_FIBER_VERSION, network: "testnet",
      networkIdentity: this.networkIdentity, recoveryResourceId: `fiber-cold:${this.prefix}`,
      recovery: hooks.recovery, assessRestoreTarget: hooks.assessRestoreTarget,
      waitForRecoveryStable: async () => this.adapter.inspect() });
  }
  evidence(storageReadback: "not-run" | "matched", peerCount: number | null): RealNodeEvidence {
    return { kind: "fiber-js-0.9.1-testnet-observation", at: new Date().toISOString(), prefix: this.prefix,
      databaseName: this.databaseName || null, networkIdentity: this.networkIdentity,
      nodeId: this.nodeId || null, channelCount: this.lastSnapshot?.channels.length ?? null,
      peerCount, storageReadback, workerFlushGuarantee: "not-provided-by-upstream", channelSafety: "not-established" };
  }
}
