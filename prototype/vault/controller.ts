import {
  deriveKey,
  newMetadata,
  open,
  parseEnvelope,
  seal,
  validateData,
  type Entry,
  type Envelope,
  type VaultData,
} from "./crypto";
import type { Store } from "./store";
export class Vault {
  #key: CryptoKey | null = null;
  #envelope: Envelope | null = null;
  #data: VaultData | null = null;
  #epoch = 0;
  #busy = false;
  constructor(private store: Store) {}
  async exists() {
    return !!(await this.store.read());
  }
  get unlocked() {
    return this.#key !== null;
  }
  get entries() {
    if (!this.#data) throw Error("Vault is locked");
    return structuredClone(this.#data.entries);
  }
  lock() {
    this.#epoch++;
    this.#key = null;
    this.#data = null;
    this.#envelope = null;
  }
  private live(epoch: number) {
    if (epoch !== this.#epoch)
      throw Error("Operation cancelled because the vault locked");
  }
  private async run<T>(fn: (epoch: number) => Promise<T>) {
    if (this.#busy) throw Error("Another vault operation is in progress");
    this.#busy = true;
    try {
      return await fn(this.#epoch);
    } finally {
      this.#busy = false;
    }
  }
  async create(master: string) {
    return this.run(async (epoch) => {
      if (await this.store.read())
        throw Error("A vault already exists. Unlock it; do not overwrite it.");
      const metadata = newMetadata(),
        key = await deriveKey(master, metadata.salt);
      this.live(epoch);
      const data = { entries: [] },
        e = await seal(key, data, metadata);
      this.live(epoch);
      await this.store.compareAndSwap(null, e);
      this.live(epoch);
      this.#key = key;
      this.#envelope = e;
      this.#data = data;
    });
  }
  async unlock(master: string) {
    return this.run(async (epoch) => {
      const e = await this.store.read();
      if (!e) throw Error("No local vault exists");
      const key = await deriveKey(master, e.salt);
      this.live(epoch);
      let data: VaultData;
      try {
        data = await open(key, e);
      } catch (e) {
        throw Error(
          "Cannot unlock: wrong master passphrase, corrupt or modified data.",
          { cause: e },
        );
      }
      this.live(epoch);
      this.#key = key;
      this.#envelope = e;
      this.#data = data;
    });
  }
  async save(entries: Entry[]) {
    return this.run(async (epoch) => {
      if (!this.#key || !this.#envelope) throw Error("Vault is locked");
      const data = validateData({ entries }),
        old = this.#envelope;
      const e = await seal(this.#key, data, {
        ...old,
        revision: old.revision + 1,
      });
      this.live(epoch);
      await this.store.compareAndSwap(old, e);
      this.live(epoch);
      this.#envelope = e;
      this.#data = data;
    });
  }
  async backup() {
    const e = await this.store.read();
    if (!e) throw Error("No vault exists");
    return JSON.stringify(e);
  }
  async importEmpty(text: string) {
    if (text.length > 2000000) throw Error("Backup is too large");
    const e = parseEnvelope(JSON.parse(text));
    await this.store.compareAndSwap(null, e);
    this.lock();
  }
}
