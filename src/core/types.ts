export type NetworkName = "testnet" | "mainnet" | "unknown";

export type CheckStatus = "pass" | "warn" | "fail" | "unknown";

export interface ChannelSnapshot {
  id: string;
  peer?: string;
  state: string;
  localBalance?: string;
  remoteBalance?: string;
}

export interface PaymentSnapshot {
  id: string;
  status: string;
  amount?: string;
}

export interface InvoiceSnapshot {
  id: string;
  status: string;
  amount?: string;
}

export interface FiberSnapshot {
  capturedAt: string;
  adapter: string;
  fiberVersion: string;
  network: NetworkName;
  networkIdentity: string;
  nodeId: string;
  channels: ChannelSnapshot[];
  payments: PaymentSnapshot[];
  invoices: InvoiceSnapshot[];
}

export interface BackupManifest {
  format: "fiber-continuity";
  formatVersion: 1;
  createdAt: string;
  source: {
    adapter: string;
    fiberVersion: string;
    network: NetworkName;
    networkIdentity: string;
    nodeId: string;
  };
  snapshotDigest: string;
  payload: {
    cipher: "AES-GCM";
    kdf: "PBKDF2-SHA256";
    iterations: number;
    salt: string;
    iv: string;
    ciphertextDigest: string;
  };
}

export interface RecoveryArchive {
  manifest: BackupManifest;
  ciphertext: string;
  snapshot: FiberSnapshot;
}

export interface RecoveryCheck {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface RecoveryReport {
  overall: "healthy" | "degraded" | "unsafe";
  checkedAt: string;
  checks: RecoveryCheck[];
  before: FiberSnapshot;
  after: FiberSnapshot;
}

export interface CompatibilityDecision {
  status: "supported" | "blocked" | "review";
  reason: string;
}
