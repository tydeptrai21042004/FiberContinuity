import type { RecoveryArchive, RecoveryReport } from "../core/types";

export function downloadJson(filename: string, value: RecoveryArchive | RecoveryReport | unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export async function readTextFile(file: File): Promise<string> {
  return file.text();
}
