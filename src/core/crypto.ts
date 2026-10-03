import { base64ToBytes, bytesToBase64, utf8 } from "./encoding";

export const DEFAULT_KDF_ITERATIONS = 310_000;
export const MIN_KDF_ITERATIONS = 100_000;
export const MAX_KDF_ITERATIONS = 2_000_000;

function assertIterations(iterations: number): void {
  if (!Number.isInteger(iterations) || iterations < MIN_KDF_ITERATIONS || iterations > MAX_KDF_ITERATIONS) {
    throw new Error(`Unsupported PBKDF2 iteration count: ${iterations}.`);
  }
}

async function deriveKey(
  password: string,
  salt: Uint8Array,
  iterations: number,
  usage: KeyUsage[]
): Promise<CryptoKey> {
  assertIterations(iterations);
  const material = await crypto.subtle.importKey("raw", bufferSource(utf8(password)), "PBKDF2", false, ["deriveKey"]);

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt: bufferSource(salt), iterations },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    usage
  );
}

function bufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const bytes = typeof data === "string" ? utf8(data) : data;
  const digest = await crypto.subtle.digest("SHA-256", bufferSource(bytes));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function encryptBytes(
  data: Uint8Array,
  password: string,
  additionalData?: Uint8Array,
  iterations = DEFAULT_KDF_ITERATIONS
) {
  if (password.length < 12) {
    throw new Error("Use a recovery password with at least 12 characters.");
  }
  assertIterations(iterations);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations, ["encrypt"]);
  const algorithm: AesGcmParams = {
    name: "AES-GCM",
    iv: bufferSource(iv),
    tagLength: 128
  };
  if (additionalData) algorithm.additionalData = bufferSource(additionalData);

  const encrypted = await crypto.subtle.encrypt(algorithm, key, bufferSource(data));
  return {
    ciphertext: new Uint8Array(encrypted),
    salt,
    iv,
    iterations
  };
}

export async function decryptBytes(
  ciphertext: Uint8Array,
  password: string,
  saltB64: string,
  ivB64: string,
  iterations: number,
  additionalData?: Uint8Array
): Promise<Uint8Array> {
  const salt = base64ToBytes(saltB64);
  const iv = base64ToBytes(ivB64);
  if (salt.length !== 16 || iv.length !== 12) {
    throw new Error("Recovery archive has invalid cryptographic parameters.");
  }
  const key = await deriveKey(password, salt, iterations, ["decrypt"]);
  const algorithm: AesGcmParams = {
    name: "AES-GCM",
    iv: bufferSource(iv),
    tagLength: 128
  };
  if (additionalData) algorithm.additionalData = bufferSource(additionalData);

  try {
    const plain = await crypto.subtle.decrypt(algorithm, key, bufferSource(ciphertext));
    return new Uint8Array(plain);
  } catch {
    throw new Error("Recovery password is wrong or the archive authentication check failed.");
  }
}

export { bytesToBase64 };
