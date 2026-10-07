export function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/** Strict RFC 4648-style base64 decoder for untrusted archive fields. */
export function base64ToBytesStrict(value: string, label = "base64 value"): Uint8Array {
  if (typeof value !== "string") throw new Error(`${label} must be a base64 string.`);
  if (value.length === 0) return new Uint8Array();
  if (value.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error(`${label} is not valid canonical base64.`);
  }
  let bytes: Uint8Array;
  try {
    bytes = base64ToBytes(value);
  } catch {
    throw new Error(`${label} is not valid canonical base64.`);
  }
  if (bytesToBase64(bytes) !== value) throw new Error(`${label} is not valid canonical base64.`);
  return bytes;
}

export function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

export function text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}
