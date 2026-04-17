/**
 * Device-bound PIN helpers.
 * - device_id: stable random id stored in localStorage per browser/device.
 * - pin_hash: SHA-256(pin + ":" + device_id + ":" + user_id)
 * - On login with PIN: client looks up cached email + device_id, hashes pin, verifies via DB.
 *   If valid, signs in using stored credentials hash? No — we cannot recover password from PIN.
 *   Instead we cache an opaque "unlock_token" = the access key encrypted with PIN-derived key.
 */
import { supabase } from "@/integrations/supabase/client";

const DEVICE_KEY = "bcrt_device_id";
const VAULT_KEY = "bcrt_pin_vault"; // { user_id, email, ciphertext, iv, salt }

export function getDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function deriveKey(pin: string, salt: Uint8Array): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 200_000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin);
}
function b64decode(str: string): Uint8Array {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface Vault {
  user_id: string;
  email: string;
  ciphertext: string; // b64
  iv: string;
  salt: string;
}

export function getVault(): Vault | null {
  const raw = localStorage.getItem(VAULT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Vault;
  } catch {
    return null;
  }
}

export function clearVault() {
  localStorage.removeItem(VAULT_KEY);
}

/** Setup PIN: encrypts current access key locally + stores a hash record in DB for admin reset. */
export async function setupPin(opts: {
  userId: string;
  email: string;
  accessKey: string;
  pin: string;
}) {
  if (!/^\d{6}$/.test(opts.pin)) throw new Error("PIN ต้องเป็นตัวเลข 6 หลัก");
  const deviceId = getDeviceId();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(opts.pin, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(opts.accessKey)
  );

  const vault: Vault = {
    user_id: opts.userId,
    email: opts.email,
    ciphertext: b64encode(ciphertext),
    iv: b64encode(iv),
    salt: b64encode(salt),
  };
  localStorage.setItem(VAULT_KEY, JSON.stringify(vault));

  // Register a fingerprint (for admin to see / reset)
  const pinHash = await sha256Hex(`${opts.pin}:${deviceId}:${opts.userId}`);
  await supabase.from("device_pins").upsert(
    {
      user_id: opts.userId,
      device_id: deviceId,
      pin_hash: pinHash,
      device_label: navigator.userAgent.slice(0, 80),
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "user_id,device_id" }
  );
}

/** Login with PIN: decrypt vault + sign in. */
export async function loginWithPin(pin: string) {
  if (!/^\d{6}$/.test(pin)) throw new Error("PIN ต้องเป็นตัวเลข 6 หลัก");
  const vault = getVault();
  if (!vault) throw new Error("ยังไม่ได้ตั้ง PIN บนเครื่องนี้");
  const salt = b64decode(vault.salt);
  const iv = b64decode(vault.iv);
  const key = await deriveKey(pin, salt);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      b64decode(vault.ciphertext)
    );
  } catch {
    throw new Error("PIN ไม่ถูกต้อง");
  }
  const accessKey = new TextDecoder().decode(plain);
  const { error } = await supabase.auth.signInWithPassword({
    email: vault.email,
    password: accessKey,
  });
  if (error) {
    clearVault();
    throw new Error("Access Key ใช้ไม่ได้แล้ว — กรุณา login ด้วย Key ใหม่");
  }
  // Update last_used_at
  const deviceId = getDeviceId();
  await supabase
    .from("device_pins")
    .update({ last_used_at: new Date().toISOString() })
    .eq("user_id", vault.user_id)
    .eq("device_id", deviceId);
}

export function hasPinOnDevice(): boolean {
  return !!getVault();
}
