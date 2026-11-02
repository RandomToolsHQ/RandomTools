import { it, expect } from "vitest";
import {
  deriveKey,
  newMetadata,
  seal,
  open,
  parseEnvelope,
  ITERATIONS,
  type Envelope,
  type Entry,
} from "../prototype/vault/crypto";
import { Vault } from "../prototype/vault/controller";
import type { Store } from "../prototype/vault/store";
const master = "synthetic master fixture only";
const entry = (): Entry => ({
  id: crypto.randomUUID(),
  title: "Synthetic service",
  username: "fixture@example.test",
  password: "synthetic-password-only",
  folder: "Tests",
  url: "https://example.test",
  notes: "Not a real credential",
});
class MemoryStore implements Store {
  value: Envelope | null = null;
  async read() {
    return this.value ? structuredClone(this.value) : null;
  }
  async compareAndSwap(
    expected: { id: string; revision: number } | null,
    value: Envelope,
  ) {
    if (
      expected
        ? !this.value ||
          this.value.id !== expected.id ||
          this.value.revision !== expected.revision
        : !!this.value
    )
      throw Error("Conflict");
    this.value = structuredClone(value);
  }
}
it("preserves the previous encrypted commit on a storage write failure", async () => {
  const store = new MemoryStore(),
    v = new Vault(store);
  await v.create(master);
  const record = entry();
  await v.save([record]);
  const before = await v.backup();
  store.compareAndSwap = async () => {
    throw Error("Synthetic storage quota failure");
  };
  await expect(v.save([])).rejects.toThrow("quota");
  expect(await v.backup()).toBe(before);
  expect(v.entries).toEqual([record]);
});
it("uses nonextractable AES keys, full KDF strength and randomized authenticated ciphertext", async () => {
  const metadata = newMetadata(),
    key = await deriveKey(master, metadata.salt),
    data = { entries: [entry()] };
  expect(ITERATIONS).toBe(600000);
  expect(key.extractable).toBe(false);
  await expect(crypto.subtle.exportKey("raw", key)).rejects.toThrow();
  const a = await seal(key, data, metadata),
    b = await seal(key, data, metadata);
  expect(a.iv).not.toBe(b.iv);
  expect(a.ciphertext).not.toBe(b.ciphertext);
  expect(newMetadata().salt).not.toBe(metadata.salt);
  expect(await open(key, a)).toEqual(data);
  expect(JSON.stringify(a)).not.toContain(data.entries[0].title);
});
it("rejects wrong masters, metadata, IV and ciphertext tampering", async () => {
  const metadata = newMetadata(),
    key = await deriveKey(master, metadata.salt),
    e = await seal(key, { entries: [entry()] }, metadata),
    wrong = await deriveKey("another synthetic fixture master", metadata.salt);
  await expect(open(wrong, e)).rejects.toThrow();
  for (const change of [
    { revision: 2 },
    { id: crypto.randomUUID() },
    { salt: newMetadata().salt },
    {
      iv: btoa(
        String.fromCharCode(...crypto.getRandomValues(new Uint8Array(12))),
      ),
    },
    { ciphertext: e.ciphertext.slice(0, -5) + "AAAA=" },
  ])
    await expect(open(key, { ...e, ...change })).rejects.toThrow();
});
it("bounds import and KDF work before processing untrusted envelopes", async () => {
  const metadata = newMetadata(),
    key = await deriveKey(master, metadata.salt),
    e = await seal(key, { entries: [] }, metadata);
  for (const change of [
    { iterations: 1 },
    { iterations: 999999999 },
    { version: 2 },
    { revision: 0 },
    { salt: "bad" },
    { iv: "bad" },
    { ciphertext: "x" },
    { extra: "no" },
  ])
    expect(() => parseEnvelope({ ...e, ...change })).toThrow();
  await expect(deriveKey("short", metadata.salt)).rejects.toThrow();
  await expect(deriveKey("x".repeat(1025), metadata.salt)).rejects.toThrow();
  const v = new Vault(new MemoryStore());
  await expect(v.importEmpty("x".repeat(2000001))).rejects.toThrow();
});
it("locks, rejects stale writes and never overwrites an existing imported vault", async () => {
  const store = new MemoryStore(),
    a = new Vault(store),
    b = new Vault(store);
  await a.create(master);
  await b.unlock(master);
  const record = entry();
  await a.save([record]);
  await expect(b.save([entry()])).rejects.toThrow("Conflict");
  expect(a.entries).toEqual([record]);
  a.lock();
  expect(a.unlocked).toBe(false);
  expect(() => a.entries).toThrow();
  await expect(a.save([])).rejects.toThrow("locked");
  await a.unlock(master);
  expect(a.entries).toEqual([record]);
  const backup = await a.backup();
  expect(backup).not.toContain(record.password);
  const imported = new Vault(new MemoryStore());
  await imported.importEmpty(backup);
  await imported.unlock(master);
  expect(imported.entries).toEqual([record]);
  await expect(imported.importEmpty(backup)).rejects.toThrow("Conflict");
});
it("locking cancels an in-flight unlock and prevents an in-flight save from reopening state", async () => {
  const store = new MemoryStore(),
    v = new Vault(store);
  await v.create(master);
  v.lock();
  const unlocking = v.unlock(master);
  v.lock();
  await expect(unlocking).rejects.toThrow("cancelled");
  expect(v.unlocked).toBe(false);
  await v.unlock(master);
  const saving = v.save([entry()]);
  v.lock();
  await expect(saving).rejects.toThrow("cancelled");
  expect(v.unlocked).toBe(false);
  await v.unlock(master);
  expect(v.entries).toEqual([]);
});
it("rejects duplicate entries and oversized records without persisting plaintext", async () => {
  const store = new MemoryStore(),
    v = new Vault(store);
  await v.create(master);
  const record = entry();
  await expect(v.save([record, record])).rejects.toThrow();
  await expect(
    v.save([{ ...record, password: "x".repeat(1025) }]),
  ).rejects.toThrow();
  expect(JSON.stringify(store.value)).not.toContain(record.password);
  expect(v.entries).toEqual([]);
});
