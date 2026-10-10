/**
 * Cold, WHOLE-DATABASE IndexedDB transport. Does not understand Fiber internal layouts.
 * Caller MUST stop/quiesce Fiber and fence every other writer before calling this module.
 * This is intentionally not a hot database backup or a channel-state safety protocol.
 *
 * Stored values are losslessly encoded for the explicitly supported structured-clone
 * types. Unsupported types fail closed instead of silently changing a Fiber record.
 */
import { ContinuityError } from "../core/errors";

const MAX_RECORDS = 250_000;
const MAX_BYTES = 72 * 1024 * 1024; // JSON + base64 + outer authenticated archive must fit its limit
const FORMAT = "fiber-continuity-indexeddb-cold";
type Primitive = null | boolean | string;
type Encoded = Primitive | { t: "number"; v: number } | { t: "undefined" } |
  { t: "bigint"; v: string } | { t: "date"; v: string } |
  { t: "binary"; type: string; v: string } |
  { t: "array"; v: Encoded[] } | { t: "object"; v: [string, Encoded][] } |
  { t: "map"; v: [Encoded, Encoded][] } | { t: "set"; v: Encoded[] };
interface StoreSchema {
  name: string;
  keyPath: string | string[] | null;
  autoIncrement: false;
  indexes: { name: string; keyPath: string | string[]; unique: boolean; multiEntry: boolean }[];
  entries: { key: Encoded; value: Encoded }[];
}
export interface ColdDatabaseDump {
  format: typeof FORMAT;
  version: 1;
  database: string;
  databaseVersion: number;
  stores: StoreSchema[];
  checksum: string;
}
type CoreDump = Omit<ColdDatabaseDump, "checksum">;

function b64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}
function unb64(value: string): Uint8Array {
  if (typeof value !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error("Invalid base64 in cold backup.");
  }
  const binary = atob(value);
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
}
function encode(value: unknown, ancestors = new Set<object>(), depth = 0): Encoded {
  if (depth > 64) throw new Error("IndexedDB value nesting limit exceeded.");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Non-finite IndexedDB number is unsupported.");
    return { t: "number", v: value };
  }
  if (typeof value === "undefined") return { t: "undefined" };
  if (typeof value === "bigint") return { t: "bigint", v: value.toString() };
  if (!value || typeof value !== "object") throw new Error("Unsupported IndexedDB value type.");
  if (ancestors.has(value)) throw new Error("Cyclic IndexedDB values are unsupported.");
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) throw new Error("Invalid IndexedDB date.");
    return { t: "date", v: value.toISOString() };
  }
  if (value instanceof ArrayBuffer) return { t: "binary", type: "ArrayBuffer", v: b64(new Uint8Array(value)) };
  if (ArrayBuffer.isView(value)) {
    if (value instanceof DataView) return { t: "binary", type: "DataView", v: b64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
    const name = value.constructor.name;
    if (!["Uint8Array", "Uint8ClampedArray", "Int8Array", "Uint16Array", "Int16Array", "Uint32Array", "Int32Array", "Float32Array", "Float64Array", "BigInt64Array", "BigUint64Array"].includes(name)) {
      throw new Error(`Unsupported IndexedDB binary view: ${name}`);
    }
    return { t: "binary", type: name, v: b64(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)) };
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return { t: "array", v: Array.from(value, (item) => encode(item, ancestors, depth + 1)) };
    if (value instanceof Map) return { t: "map", v: [...value].map(([key, val]) => [encode(key, ancestors, depth + 1), encode(val, ancestors, depth + 1)]) };
    if (value instanceof Set) return { t: "set", v: [...value].map((item) => encode(item, ancestors, depth + 1)) };
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new Error(`Unsupported IndexedDB structured-clone class: ${value.constructor?.name ?? "unknown"}`);
    }
    return { t: "object", v: Object.keys(value).sort().map((key) => [key, encode((value as Record<string, unknown>)[key], ancestors, depth + 1)]) };
  } finally { ancestors.delete(value); }
}
function decode(value: Encoded, depth = 0): unknown {
  if (depth > 64) throw new Error("Cold backup nesting limit exceeded.");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (!value || typeof value !== "object") throw new Error("Malformed backup encoded value.");
  switch (value.t) {
    case "number": if (!Number.isFinite(value.v)) throw new Error("Invalid number."); return value.v;
    case "undefined": return undefined;
    case "bigint": if (!/^-?\d+$/.test(value.v)) throw new Error("Invalid bigint."); return BigInt(value.v);
    case "date": { const date = new Date(value.v); if (!Number.isFinite(date.getTime())) throw new Error("Invalid date."); return date; }
    case "binary": {
      const bytes = unb64(value.v);
      const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
      if (value.type === "ArrayBuffer") return buffer;
      if (value.type === "DataView") return new DataView(buffer);
      const constructors: Record<string, { new (buffer: ArrayBuffer): ArrayBufferView }> = {
        Uint8Array, Uint8ClampedArray, Int8Array, Uint16Array, Int16Array, Uint32Array, Int32Array,
        Float32Array, Float64Array, BigInt64Array, BigUint64Array
      };
      const Ctor = constructors[value.type];
      if (!Ctor) throw new Error("Unknown binary type.");
      return new Ctor(buffer);
    }
    case "array": if (!Array.isArray(value.v)) throw new Error("Invalid array."); return value.v.map((item) => decode(item, depth + 1));
    case "object": {
      if (!Array.isArray(value.v)) throw new Error("Invalid object.");
      const result: Record<string, unknown> = Object.create(null);
      for (const [key, item] of value.v) {
        if (typeof key !== "string" || Object.hasOwn(result, key)) throw new Error("Invalid object field.");
        Object.defineProperty(result, key, { value: decode(item, depth + 1), enumerable: true, writable: true, configurable: true });
      }
      return result;
    }
    case "map": if (!Array.isArray(value.v)) throw new Error("Invalid map."); return new Map(value.v.map(([key, item]) => [decode(key, depth + 1), decode(item, depth + 1)]));
    case "set": if (!Array.isArray(value.v)) throw new Error("Invalid set."); return new Set(value.v.map((item) => decode(item, depth + 1)));
    default: throw new Error("Unknown encoded value type.");
  }
}
function strings(list: DOMStringList): string[] { return Array.from(list).sort(); }
function keyPath(path: string | string[] | null): string | string[] | null {
  return Array.isArray(path) ? [...path] : path;
}
function schema(store: IDBObjectStore): StoreSchema {
  if (store.autoIncrement) throw new Error(`IndexedDB store '${store.name}' has autoIncrement: key-generator state cannot be faithfully checkpointed.`);
  return {
    name: store.name, keyPath: keyPath(store.keyPath), autoIncrement: false,
    indexes: strings(store.indexNames).map((name) => {
      const index = store.index(name);
      return { name, keyPath: keyPath(index.keyPath) as string | string[], unique: index.unique, multiEntry: index.multiEntry };
    }), entries: []
  };
}
function normalizedSchema(store: StoreSchema): string {
  return JSON.stringify({ name: store.name, keyPath: store.keyPath, autoIncrement: false, indexes: store.indexes });
}
function waitTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("IndexedDB transaction aborted."));
    tx.onerror = () => reject(tx.error ?? new Error("IndexedDB transaction failed."));
  });
}
function iterate(store: IDBObjectStore, entry: StoreSchema, counter: { value: number }): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = store.openCursor();
    request.onerror = () => reject(request.error ?? new Error("IndexedDB cursor failed."));
    request.onsuccess = () => {
      try {
        const cursor = request.result;
        if (!cursor) { resolve(); return; }
        if (++counter.value > MAX_RECORDS) throw new Error("IndexedDB backup exceeds record limit.");
        entry.entries.push({ key: encode(cursor.primaryKey), value: encode(cursor.value) });
        cursor.continue();
      } catch (error) { try { store.transaction.abort(); } catch { /* already stopped */ } reject(error); }
    };
  });
}
async function sha256(value: string): Promise<string> {
  return b64(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))));
}
function assertName(name: string): void {
  if (!/^[A-Za-z0-9_.:-]{1,150}$/.test(name)) throw new Error("A stable, explicit IndexedDB name is required.");
}
function connect(name: string, version?: number, upgrade?: (db: IDBDatabase, tx: IDBTransaction) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = version === undefined ? indexedDB.open(name) : indexedDB.open(name, version);
    request.onblocked = () => reject(new ContinuityError("DATABASE_BLOCKED", "Another browser connection holds this IndexedDB open. Close all other tabs/processes.", true));
    request.onerror = () => reject(request.error ?? new Error("Cannot open IndexedDB."));
    request.onupgradeneeded = () => {
      if (!upgrade || !request.transaction) {
        request.transaction?.abort(); return;
      }
      try { upgrade(request.result, request.transaction); }
      catch { request.transaction.abort(); }
    };
    request.onsuccess = () => resolve(request.result);
  });
}
function validateCore(dump: CoreDump, expectedName: string): void {
  if (dump.format !== FORMAT || dump.version !== 1 || dump.database !== expectedName ||
      !Number.isSafeInteger(dump.databaseVersion) || dump.databaseVersion < 1 || !Array.isArray(dump.stores) || dump.stores.length < 1 || dump.stores.length > 100) {
    throw new Error("Wrong IndexedDB database identity, format or version.");
  }
  const names = new Set<string>(); let records = 0;
  for (const store of dump.stores) {
    if (typeof store.name !== "string" || !store.name || names.has(store.name) || store.autoIncrement !== false ||
        !Array.isArray(store.entries) || !Array.isArray(store.indexes) || store.indexes.length > 100) throw new Error("Invalid IndexedDB store schema.");
    names.add(store.name);
    if (store.keyPath !== null && typeof store.keyPath !== "string" &&
        !(Array.isArray(store.keyPath) && store.keyPath.every((key) => typeof key === "string"))) throw new Error("Invalid store key path.");
    for (const index of store.indexes) {
      if (!index || typeof index.name !== "string" || !index.name || typeof index.unique !== "boolean" || typeof index.multiEntry !== "boolean" ||
          !(typeof index.keyPath === "string" || (Array.isArray(index.keyPath) && index.keyPath.every((key) => typeof key === "string")))) throw new Error("Invalid index schema.");
    }
    records += store.entries.length;
    if (records > MAX_RECORDS) throw new Error("Cold backup record limit exceeded.");
    for (const entry of store.entries) { decode(entry.key); decode(entry.value); }
  }
}
export class IndexedDbColdStore {
  constructor(readonly databaseName: string, private readonly assertOffline: () => Promise<void>) { assertName(databaseName); }
  private async existing(): Promise<boolean> {
    if (typeof indexedDB.databases !== "function") throw new Error("Browser does not support IndexedDB.databases(); safe absent-database detection is unavailable.");
    const databases = await indexedDB.databases();
    return databases.some((item) => item.name === this.databaseName);
  }
  async presence(): Promise<"absent" | "empty" | "occupied"> {
    await this.assertOffline();
    if (!await this.existing()) return "absent";
    const db = await connect(this.databaseName);
    try {
      const names = strings(db.objectStoreNames);
      if (!names.length) return "occupied"; // unknown schema is not a verified clean target
      const tx = db.transaction(names, "readonly");
      const finished = waitTransaction(tx);
      const counts = names.map((name) => new Promise<number>((resolve, reject) => {
        const req = tx.objectStore(name).count();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error("Count failed."));
      }));
      const result = await Promise.all(counts);
      await finished;
      return result.every((count) => count === 0) ? "empty" : "occupied";
    } finally { db.close(); }
  }
  async exportBytes(): Promise<Uint8Array> {
    await this.assertOffline();
    if (!await this.existing()) throw new Error("Cannot back up a missing IndexedDB database.");
    const db = await connect(this.databaseName);
    try {
      const names = strings(db.objectStoreNames);
      if (!names.length) throw new Error("Database has no object stores.");
      const tx = db.transaction(names, "readonly");
      const finished = waitTransaction(tx);
      const stores = names.map((name) => schema(tx.objectStore(name)));
      const count = { value: 0 };
      const work = Promise.all(stores.map((entry) => iterate(tx.objectStore(entry.name), entry, count)));
      await work;
      await finished;
      const core: CoreDump = { format: FORMAT, version: 1, database: this.databaseName, databaseVersion: db.version, stores };
      const json = JSON.stringify(core);
      if (new TextEncoder().encode(json).byteLength > MAX_BYTES) throw new Error("Cold database export exceeds safe size limit.");
      const dump: ColdDatabaseDump = { ...core, checksum: await sha256(json) };
      const output = new TextEncoder().encode(JSON.stringify(dump));
      if (output.byteLength > MAX_BYTES) throw new Error("Cold database export exceeds safe size limit.");
      return output;
    } finally { db.close(); }
  }
  async validateBytes(bytes: Uint8Array): Promise<ColdDatabaseDump> {
    if (!(bytes instanceof Uint8Array) || bytes.length < 40 || bytes.length > MAX_BYTES) throw new Error("Invalid cold database backup size.");
    const dump: ColdDatabaseDump = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (!dump || typeof dump !== "object" || typeof dump.checksum !== "string") throw new Error("Invalid database dump structure.");
    const { checksum, ...core } = dump;
    if (await sha256(JSON.stringify(core)) !== checksum) throw new Error("Cold database dump checksum mismatch.");
    validateCore(core, this.databaseName);
    return dump;
  }
  /**
   * Only absent or EMPTY profiles can be replaced. This method is not a rollback
   * mechanism and never deletes an occupied database. The host must independently
   * fence writers during the entire call, including the post-write verification.
   */
  async restoreBytes(bytes: Uint8Array): Promise<void> {
    await this.assertOffline();
    const dump = await this.validateBytes(bytes); // validate *before* any mutation
    const existed = await this.existing();
    if (existed && await this.presence() !== "empty") throw new Error("Refusing to replace nonempty IndexedDB node state.");
    const db = await connect(this.databaseName, dump.databaseVersion, existed ? undefined : (created) => {
      for (const entry of dump.stores) {
        const store = created.createObjectStore(entry.name, { keyPath: entry.keyPath, autoIncrement: false });
        for (const index of entry.indexes) store.createIndex(index.name, index.keyPath, { unique: index.unique, multiEntry: index.multiEntry });
      }
    });
    try {
      if (db.version !== dump.databaseVersion || JSON.stringify(strings(db.objectStoreNames)) !== JSON.stringify(dump.stores.map((store) => store.name).sort())) {
        throw new Error("Target IndexedDB schema/version differs; existing database cannot be replaced.");
      }
      const names = dump.stores.map((item) => item.name);
      const tx = db.transaction(names, "readwrite");
      const finished = waitTransaction(tx);
      // No asynchronous delay is allowed between zero-count verification and writes.
      // All checks and writes share one readwrite transaction on every object store.
      let checked = 0;
      try {
        for (const entry of dump.stores) {
          const store = tx.objectStore(entry.name);
          if (normalizedSchema(schema(store)) !== normalizedSchema(entry)) throw new Error(`Schema mismatch for ${entry.name}.`);
          const req = store.count();
          req.onerror = () => { try { tx.abort(); } catch { /* aborted */ } };
          req.onsuccess = () => {
            if (req.result !== 0) { try { tx.abort(); } catch { /* aborted */ } return; }
            checked++;
            if (checked === dump.stores.length) {
              try {
                for (const item of dump.stores) {
                  const target = tx.objectStore(item.name);
                  for (const record of item.entries) {
                    const value = decode(record.value);
                    if (item.keyPath === null) target.put(value, decode(record.key) as IDBValidKey);
                    else target.put(value);
                  }
                }
              } catch { try { tx.abort(); } catch { /* aborted */ } }
            }
          };
        }
      } catch (error) { tx.abort(); throw error; }
      await finished;
    } finally { db.close(); }
    // Perform a fresh readback and compare authenticated logical contents.
    const restored = await this.exportBytes();
    const check = await this.validateBytes(restored);
    if (check.checksum !== dump.checksum) {
      throw new ContinuityError("POST_RESTORE_MISMATCH", "IndexedDB restore completed but a fresh full-database checksum differs. Keep node offline and quarantined.", true);
    }
  }
}
