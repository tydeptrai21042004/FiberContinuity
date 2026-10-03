import { base64ToBytes, bytesToBase64, utf8 } from "./encoding";

const ITERATIONS = 310_000;

async function deriveKey(password: string, salt: Uint8Array, usage: KeyUsage[]): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    "raw",
    utf8(password),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: BufferSourceFrom(salt), iterations: ITERATIONS },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usage
  );
}

function BufferSourceFrom(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? utf8(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", BufferSourceFrom(bytes));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function encryptBytes(data: Uint8Array, password: string) {
  if (password.length < 10) {
    throw new Error("Use a recovery password with at least 10 characters.");
  }
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, ["encrypt"]);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: BufferSourceFrom(iv) },
    key,
    BufferSourceFrom(data)
  );
  return {
    ciphertext: new Uint8Array(encrypted),
    salt,
    iv,
    iterations: ITERATIONS
  };
}

export async function decryptBytes(
  ciphertext: Uint8Array,
  password: string,
  saltB64: string,
  ivB64: string
): Promise<Uint8Array> {
  const salt = base64ToBytes(saltB64);
  const iv = base64ToBytes(ivB64);
  const key = await deriveKey(password, salt, ["decrypt"]);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: BufferSourceFrom(iv) },
      key,
      BufferSourceFrom(ciphertext)
    );
    return new Uint8Array(plain);
  } catch {
    throw new Error("Recovery password is wrong or the encrypted payload is corrupted.");
  }
}

export { bytesToBase64 };
