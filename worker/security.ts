import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import {
  pbkdf2 as nativePbkdf2,
  sha256 as nativeSha256,
} from "@noble/hashes/webcrypto.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils.js";
export const now = () => Math.floor(Date.now() / 1000);
export const token = () =>
  bytesToHex(crypto.getRandomValues(new Uint8Array(32)));
export const digest = (value: string) =>
  bytesToHex(sha256(new TextEncoder().encode(value)));
export async function hashPassword(password: string, salt = token()) {
  let hash: Uint8Array;
  try {
    hash = await nativePbkdf2(nativeSha256, password, salt, {
      c: 600000,
      dkLen: 32,
    });
  } catch (e) {
    // Some Workers runtimes cap native PBKDF2 at 100k. Preserve the
    // reviewed work factor using the audited implementation, never lower it.
    if (!(e instanceof Error) || e.name !== "NotSupportedError") throw e;
    hash = await pbkdf2Async(sha256, password, salt, { c: 600000, dkLen: 32 });
  }
  return `pbkdf2-sha256$600000$${salt}$${bytesToHex(hash)}`;
}
export function equal(a: string, b: string) {
  const encoder = new TextEncoder();
  const ah = sha256(encoder.encode(a)),
    bh = sha256(encoder.encode(b));
  let n = 0;
  for (let i = 0; i < ah.length; i++) n |= ah[i] ^ bh[i];
  return n === 0;
}
export async function verifyPassword(password: string, stored: string) {
  const [algorithm, c, salt, hash] = stored.split("$");
  if (algorithm !== "pbkdf2-sha256" || c !== "600000" || !salt || !hash)
    return false;
  hexToBytes(hash);
  return equal(await hashPassword(password, salt), stored);
}
