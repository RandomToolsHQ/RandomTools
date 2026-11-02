import { parseEnvelope, type Envelope } from "./crypto";
export interface Store {
  read(): Promise<Envelope | null>;
  compareAndSwap(
    expected: { id: string; revision: number } | null,
    value: Envelope,
  ): Promise<void>;
}
export class LocalStore implements Store {
  private db: Promise<IDBDatabase>;
  constructor() {
    this.db = new Promise((resolve, reject) => {
      const r = indexedDB.open("randomtools-synthetic-vault-v1", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("vault");
      r.onsuccess = () => {
        r.result.onversionchange = () => r.result.close();
        resolve(r.result);
      };
      r.onerror = () => reject(Error("Encrypted storage unavailable"));
      r.onblocked = () => reject(Error("Close other prototype tabs first"));
    });
  }
  async read() {
    const db = await this.db;
    return new Promise<Envelope | null>((resolve, reject) => {
      const tx = db.transaction("vault", "readonly"),
        r = tx.objectStore("vault").get("encrypted");
      r.onsuccess = () => {
        try {
          resolve(r.result ? parseEnvelope(r.result) : null);
        } catch (e) {
          reject(e);
        }
      };
      r.onerror = () => reject(Error("Encrypted storage read failed"));
    });
  }
  async compareAndSwap(
    expected: { id: string; revision: number } | null,
    value: Envelope,
  ) {
    const db = await this.db;
    const safe = parseEnvelope(value);
    return new Promise<void>((resolve, reject) => {
      let conflict = false;
      const tx = db.transaction("vault", "readwrite"),
        store = tx.objectStore("vault"),
        r = store.get("encrypted");
      r.onsuccess = () => {
        const old = r.result;
        if (
          expected
            ? !old ||
              old.id !== expected.id ||
              old.revision !== expected.revision
            : !!old
        ) {
          conflict = true;
          tx.abort();
          return;
        }
        store.put(safe, "encrypted");
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(Error("Encrypted storage write failed"));
      tx.onabort = () =>
        reject(
          Error(
            conflict
              ? "Vault changed in another tab. Lock and unlock again."
              : "Encrypted storage write aborted",
          ),
        );
    });
  }
}
