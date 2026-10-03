export type NetworkName = "testnet" | "mainnet" | "unknown";

export type CheckStatus = "pass" | "warn" | "fail" | "unknown";
export type RecordCoverage = "full" | "metadata" | "unavailable";

export interface SnapshotCapabilities {
  channels: RecordCoverage;
  payments: RecordCoverage;
  invoices: RecordCoverage;
}

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
  capabilities: SnapshotCapabilities;
  channels: ChannelSnapshot[];
  payments: PaymentSnapshot[];
  invoices: InvoiceSnapshot[];
}

/**
 * v2 deliberately keeps node/network/session metadata out of the public manifest.
 * The recovery snapshot and native backup live together inside the AES-GCM payload.
 */
export interface BackupManifest {
  format: "fiber-continuity";
  formatVersion: 2;
  createdAt: string;
  payload: {
    cipher: "AES-GCM-256";
    kdf: "PBKDF2-SHA256";
    iterations: number;
    salt: string;
    iv: string;
    aadVersion: 1;
    /** Fast accidental-corruption check only. Authenticity comes from AES-GCM. */
    ciphertextDigest: string;
  };
}

export interface RecoveryArchive {
  manifest: BackupManifest;
  ciphertext: string;
}

export interface RecoveryEnvelope {
  schemaVersion: 1;
  snapshot: FiberSnapshot;
  nativeBackup: string;
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

export interface RestoreTargetAssessment {
  status: "safe" | "blocked" | "review";
  reason: string;
}

export interface RecoveryPreflight {
  networkMatches: boolean;
  compatibility: CompatibilityDecision;
  targetSafety: RestoreTargetAssessment;
  sourceNodeId: string;
  targetNodeId: string;
  source: FiberSnapshot;
  target: FiberSnapshot;
}
