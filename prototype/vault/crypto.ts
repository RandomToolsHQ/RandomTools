import { z } from "zod";
export const ITERATIONS = 600000;
export const entrySchema = z
  .object({
    id: z.string().uuid(),
    title: z.string().min(1).max(120),
    username: z.string().max(300),
    password: z.string().max(1024),
    url: z.string().max(500),
    notes: z.string().max(4000),
    folder: z.string().max(80),
  })
  .strict();
export type Entry = z.infer<typeof entrySchema>;
const dataSchema = z
  .object({ entries: z.array(entrySchema).max(1000) })
  .strict()
  .superRefine((v, c) => {
    if (new Set(v.entries.map((e) => e.id)).size !== v.entries.length)
      c.addIssue({ code: "custom", message: "Duplicate entry ID" });
  });
export type VaultData = z.infer<typeof dataSchema>;
const envelopeSchema = z
  .object({
    version: z.literal(1),
    id: z.string().uuid(),
    revision: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
    kdf: z.literal("PBKDF2-SHA256"),
    iterations: z.literal(ITERATIONS),
    salt: z.string().regex(/^[A-Za-z0-9+/]{22}==$/),
    iv: z.string().regex(/^[A-Za-z0-9+/]{16}$/),
    ciphertext: z
      .string()
      .min(24)
      .max(1500000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
export type Envelope = z.infer<typeof envelopeSchema>;
const encoder = new TextEncoder();
function b64(bytes: Uint8Array) {
  let s = "";
  for (let i = 0; i < bytes.length; i += 8192)
    s += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(s);
}
function bytes(value: string) {
  const result = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  if (b64(result) !== value) throw Error("Noncanonical encoding");
  return result;
}
function aad(
  e: Pick<
    Envelope,
    "version" | "id" | "revision" | "kdf" | "iterations" | "salt"
  >,
) {
  return encoder.encode(
    JSON.stringify([e.version, e.id, e.revision, e.kdf, e.iterations, e.salt]),
  );
}
export function parseEnvelope(value: unknown): Envelope {
  const e = envelopeSchema.parse(value);
  if (
    bytes(e.salt).length !== 16 ||
    bytes(e.iv).length !== 12 ||
    bytes(e.ciphertext).length < 16
  )
    throw Error("Invalid envelope");
  return e;
}
export function validateData(value: unknown) {
  const data = dataSchema.parse(value);
  if (encoder.encode(JSON.stringify(data)).length > 1000000)
    throw Error("Prototype storage limit reached");
  return data;
}
export async function deriveKey(master: string, salt: string) {
  if (master.length < 16 || master.length > 1024)
    throw Error("Use a synthetic master passphrase of 16–1,024 characters.");
  const raw = encoder.encode(master);
  try {
    const material = await crypto.subtle.importKey(
      "raw",
      raw,
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return await crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        hash: "SHA-256",
        iterations: ITERATIONS,
        salt: bytes(salt),
      },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"],
    );
  } finally {
    raw.fill(0);
  }
}
export function newMetadata(): Pick<
  Envelope,
  "version" | "id" | "revision" | "kdf" | "iterations" | "salt"
> {
  return {
    version: 1 as const,
    id: crypto.randomUUID(),
    revision: 1,
    kdf: "PBKDF2-SHA256" as const,
    iterations: ITERATIONS,
    salt: b64(crypto.getRandomValues(new Uint8Array(16))),
  };
}
export async function seal(
  key: CryptoKey,
  data: VaultData,
  metadata: ReturnType<typeof newMetadata>,
): Promise<Envelope> {
  const plain = encoder.encode(JSON.stringify(validateData(data))),
    iv = crypto.getRandomValues(new Uint8Array(12));
  try {
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, additionalData: aad(metadata), tagLength: 128 },
      key,
      plain,
    );
    return parseEnvelope({
      ...metadata,
      iv: b64(iv),
      ciphertext: b64(new Uint8Array(encrypted)),
    });
  } finally {
    plain.fill(0);
  }
}
export async function open(key: CryptoKey, value: unknown) {
  const e = parseEnvelope(value);
  const plain = new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: bytes(e.iv),
        additionalData: aad(e),
        tagLength: 128,
      },
      key,
      bytes(e.ciphertext),
    ),
  );
  try {
    return validateData(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plain)),
    );
  } finally {
    plain.fill(0);
  }
}
