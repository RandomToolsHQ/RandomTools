import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Vault } from "./controller";
import { LocalStore } from "./store";
import type { Entry } from "./crypto";
import "./style.css";
const blank = (): Entry => ({
  id: crypto.randomUUID(),
  title: "",
  username: "",
  password: "",
  url: "",
  notes: "",
  folder: "",
});
function App() {
  const vault = useRef<Vault | null>(null);
  if (!vault.current) vault.current = new Vault(new LocalStore());
  const v = vault.current;
  const [unlocked, setUnlocked] = useState(false),
    [exists, setExists] = useState<boolean | null>(null),
    [master, setMaster] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [entries, setEntries] = useState<Entry[]>([]),
    [edit, setEdit] = useState<Entry | null>(null),
    [search, setSearch] = useState(""),
    [folder, setFolder] = useState("All"),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function lock() {
    v.lock();
    setUnlocked(false);
    setEntries([]);
    setEdit(null);
    setMaster("");
    setSearch("");
    setFolder("All");
    setNotice(
      "Vault locked. Plaintext removed from the interface; JavaScript memory erasure cannot be guaranteed.",
    );
    if (timer.current) clearTimeout(timer.current);
  }
  useEffect(() => {
    void v
      .exists()
      .then(setExists, () =>
        setNotice(
          "Encrypted storage is unavailable or corrupt. Preserve any backup; do not overwrite data.",
        ),
      );
    const activity = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(lock, 60000);
    };
    const hidden = () => {
      if (document.hidden) lock();
    };
    for (const event of ["pointerdown", "keydown"])
      window.addEventListener(event, activity);
    document.addEventListener("visibilitychange", hidden);
    activity();
    return () => {
      v.lock();
      if (timer.current) clearTimeout(timer.current);
      for (const event of ["pointerdown", "keydown"])
        window.removeEventListener(event, activity);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);
  async function act(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setNotice(
        e instanceof Error
          ? e.message
          : "Operation failed. Preserve your encrypted backup.",
      );
    } finally {
      setBusy(false);
      void v.exists().then(setExists, () => {});
    }
  }
  function refresh() {
    setEntries(v.entries);
    setUnlocked(true);
    setExists(true);
    setMaster("");
  }
  return (
    <main>
      <p className="badge">LOCAL ONLY · SYNTHETIC CREDENTIALS ONLY</p>
      <h1>Synthetic vault prototype</h1>
      <div className="warning">
        <strong>Do not store real passwords.</strong>
        <p>
          This experimental build has not had independent security review. No
          public access, autofill, server or synchronization exists. Browser
          storage can be deleted or evicted. Losing the master passphrase or
          encrypted backup means permanent data loss; there is no reset or
          recovery key.
        </p>
      </div>
      <p>
        PBKDF2-SHA256 (600,000 iterations), AES-256-GCM. Keys and plaintext stay
        in this tab. Locks after 60 seconds of inactivity or when the tab
        becomes hidden. These design choices are not a security certification.
      </p>
      <p role="status" aria-live="polite">
        {busy ? "Working locally…" : notice}
      </p>
      {!unlocked ? (
        <>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const value = master;
              setMaster("");
              void act(async () => {
                if (exists) await v.unlock(value);
                else await v.create(value);
                refresh();
              });
            }}
          >
            <label>
              Synthetic master passphrase
              <input
                type="password"
                value={master}
                onChange={(e) => setMaster(e.target.value)}
                minLength={16}
                maxLength={1024}
                required
                autoComplete="off"
                spellCheck={false}
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                required
              />
              I will use synthetic credentials only and understand that lost
              data cannot be recovered.
            </label>
            <button disabled={busy || exists === null || !confirmed}>
              {exists ? "Unlock synthetic vault" : "Create synthetic vault"}
            </button>
          </form>
          {exists === false && (
            <label>
              Import encrypted backup into empty storage
              <input
                type="file"
                accept=".json,application/json"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file)
                    void act(async () => {
                      if (file.size > 2000000)
                        throw Error("Backup is too large");
                      await v.importEmpty(await file.text());
                      setExists(true);
                      setNotice(
                        "Encrypted backup imported. Unlock to verify its authenticity. Storage rollback cannot be detected offline.",
                      );
                    });
                }}
              />
            </label>
          )}
        </>
      ) : (
        <>
          <div className="actions">
            <button onClick={lock}>Lock vault</button>
            <button disabled={busy} onClick={() => setEdit(blank())}>
              Add synthetic entry
            </button>
          </div>
          <div className="filters">
            <label>
              Search entries
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                maxLength={300}
              />
            </label>
            <label>
              Folder
              <select
                aria-label="Folder filter"
                value={folder}
                onChange={(e) => setFolder(e.target.value)}
              >
                <option>All</option>
                {[...new Set(entries.map((e) => e.folder || "Unfiled"))]
                  .filter((f) => f !== "All")
                  .map((f) => (
                    <option key={f}>{f}</option>
                  ))}
              </select>
            </label>
          </div>
          {!entries.length && (
            <p>No entries. Add synthetic data to exercise the prototype.</p>
          )}
          <div className="cards">
            {entries
              .filter(
                (e) =>
                  (folder === "All" || (e.folder || "Unfiled") === folder) &&
                  (e.title + " " + e.username + " " + e.folder)
                    .toLowerCase()
                    .includes(search.toLowerCase()),
              )
              .map((e) => (
                <article key={e.id}>
                  <h2>{e.title}</h2>
                  <p>
                    {e.username} · {e.folder || "Unfiled"}
                  </p>
                  <p className="url">{e.url}</p>
                  <div className="actions">
                    <button disabled={busy} onClick={() => setEdit({ ...e })}>
                      Edit {e.title}
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(`Delete synthetic entry “${e.title}”?`)
                        )
                          void act(async () => {
                            await v.save(entries.filter((x) => x.id !== e.id));
                            refresh();
                            setEdit(null);
                            setNotice("Entry deleted.");
                          });
                      }}
                    >
                      Delete {e.title}
                    </button>
                  </div>
                </article>
              ))}
          </div>
          {edit && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const value = edit;
                void act(async () => {
                  await v.save([
                    ...entries.filter((x) => x.id !== value.id),
                    value,
                  ]);
                  refresh();
                  setEdit(null);
                  setNotice("Synthetic entry encrypted and saved.");
                });
              }}
            >
              <h2>Edit synthetic entry</h2>
              {(
                [
                  "title",
                  "username",
                  "password",
                  "url",
                  "folder",
                  "notes",
                ] as const
              ).map((field) => (
                <label key={field}>
                  {field}
                  <input
                    aria-label={`Entry ${field}`}
                    type={field === "password" ? "password" : "text"}
                    value={edit[field]}
                    required={field === "title"}
                    maxLength={
                      field === "notes"
                        ? 4000
                        : field === "password"
                          ? 1024
                          : field === "url"
                            ? 500
                            : field === "folder"
                              ? 80
                              : field === "title"
                                ? 120
                                : 300
                    }
                    onChange={(e) =>
                      setEdit({ ...edit, [field]: e.target.value })
                    }
                    autoComplete="off"
                    spellCheck={false}
                  />
                </label>
              ))}
              <div className="actions">
                <button disabled={busy}>Save encrypted entry</button>
                <button type="button" onClick={() => setEdit(null)}>
                  Cancel editing
                </button>
              </div>
            </form>
          )}
        </>
      )}
      {exists && (
        <button
          disabled={busy}
          onClick={() =>
            void act(async () => {
              const text = await v.backup(),
                url = URL.createObjectURL(
                  new Blob([text], { type: "application/json" }),
                ),
                a = document.createElement("a");
              a.href = url;
              a.download = "synthetic-vault-encrypted.json";
              a.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
              setNotice(
                "Encrypted backup exported. Keep it and your master passphrase separately; neither can be recovered.",
              );
            })
          }
        >
          Export encrypted backup
        </button>
      )}
      <p>
        Threats not solved: XSS or compromised browser/extensions/device;
        plaintext visible while unlocked; memory inspection; offline guessing;
        deletion or rollback of encrypted backups. Password strings cannot be
        reliably zeroed in JavaScript. Independent security review is mandatory
        before any real credential use.
      </p>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
