import type { RecoveryArchive, RecoveryPreflight } from "../core/types";
import StatusPill from "./StatusPill";

function shortDigest(value: string) {
  return `${value.slice(0, 12)}…${value.slice(-8)}`;
}

export default function ArchiveStatusCard({
  archive,
  authenticated,
  preflight,
  localCopyStatus,
  onDownload
}: {
  archive: RecoveryArchive;
  authenticated: boolean;
  preflight: RecoveryPreflight | null;
  localCopyStatus: "not-verified" | "download-requested" | "imported-file";
  onDownload?: () => void;
}) {
  const safe = Boolean(preflight && preflight.networkMatches && preflight.compatibility.status === "supported" && preflight.targetSafety.status === "safe");
  return (
    <section className="archive-card" aria-label="Recovery archive status">
      <div className="archive-state">
        <span className="archive-icon" aria-hidden="true">◆</span>
        <div>
          <strong>{authenticated ? "Archive authenticated" : "Archive loaded and integrity checked"}</strong>
          <small>Created {new Date(archive.manifest.createdAt).toLocaleString()}</small>
        </div>
        <StatusPill status={safe ? "pass" : authenticated ? "pass" : "unknown"} />
      </div>

      <div className="archive-progress" aria-label="Archive validation progress">
        <span className="done">Loaded</span>
        <span className="done">Integrity valid</span>
        <span className={authenticated ? "done" : "pending"}>Authenticated</span>
        <span className={preflight ? (safe ? "done" : "blocked") : "pending"}>Target safe</span>
      </div>

      <div className="archive-summary">
        <div><span>Format</span><strong>v{archive.manifest.formatVersion}</strong></div>
        <div><span>Encryption</span><strong>{archive.manifest.payload.cipher}</strong></div>
        <div><span>Local copy</span><strong>{localCopyStatus === "imported-file" ? "File selected (integrity checked)" : localCopyStatus === "download-requested" ? "Download requested · unverified" : "Not verified"}</strong></div>
      </div>

      <details className="technical-details">
        <summary>Technical details</summary>
        <dl>
          <div><dt>KDF</dt><dd>{archive.manifest.payload.kdf}</dd></div>
          <div><dt>Iterations</dt><dd>{archive.manifest.payload.iterations.toLocaleString()}</dd></div>
          <div><dt>Digest</dt><dd className="mono">{shortDigest(archive.manifest.payload.ciphertextDigest)}</dd></div>
          <div><dt>AAD schema</dt><dd>v{archive.manifest.payload.aadVersion}</dd></div>
        </dl>
      </details>

      {onDownload && <button type="button" className={localCopyStatus === "download-requested" ? "ghost" : "primary"} onClick={onDownload}>{localCopyStatus === "download-requested" ? "Request another download" : "Download recovery archive"}</button>}
    </section>
  );
}
