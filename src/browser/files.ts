import type { RecoveryArchive, RecoveryReport } from "../core/types";
import { MAX_ARCHIVE_JSON_BYTES } from "../core/archive";

export function downloadJson(filename: string, value: RecoveryArchive | RecoveryReport | unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  try { a.click(); }
  finally {
    a.remove();
    // Some browsers defer their download handoff beyond the click event.
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
}

export async function readTextFile(file: File): Promise<string> {
  if (file.size > MAX_ARCHIVE_JSON_BYTES) throw new Error("Recovery archive exceeds safe browser memory limits.");
  return file.text();
}
