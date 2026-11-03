import { initializeApp } from "firebase/app";
import {
  initializeAuth,
  inMemoryPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  applyActionCode,
  verifyPasswordResetCode,
  confirmPasswordReset,
} from "firebase/auth";
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";

const config = JSON.parse(import.meta.env.VITE_FIREBASE_POC_CONFIG || "null");
const app = config ? initializeApp(config) : null;
const auth = app
  ? initializeAuth(app, {
      persistence: inMemoryPersistence,
      popupRedirectResolver: browserPopupRedirectResolver,
    })
  : null;
// No emulator URL, unsigned token mode or authentication bypass exists in this build.
async function api(path: string, body?: unknown, method?: string) {
  if (!auth?.currentUser) throw Error("Sign in to continue");
  const token = await auth.currentUser.getIdToken();
  const r = await fetch("/api" + path, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      authorization: "Bearer " + token,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    credentials: "same-origin",
    body: body ? JSON.stringify(body) : undefined,
  });
  let data: any;
  try {
    data = await r.json();
  } catch {
    throw Error("The testing service is unavailable");
  }
  if (!r.ok) throw Error(data.error || "Request failed");
  return data;
}
function Experiment() {
  const [signed, setSigned] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [me, setMe] = useState<any>(null),
    [access, setAccess] = useState<any>(null),
    [admin, setAdmin] = useState<any>(null),
    [presets, setPresets] = useState<any[]>([]);
  const params = new URLSearchParams(location.search),
    mode = params.get("mode"),
    code = params.get("oobCode");
  useEffect(
    () =>
      auth
        ? onAuthStateChanged(auth, (u) => {
            setSigned(!!u);
            setMe(null);
            setAccess(null);
            setAdmin(null);
            setPresets([]);
          })
        : undefined,
    [],
  );
  async function action(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
    } catch (e) {
      const code = (e as { code?: string }).code;
      setError(
        code
          ? (
              {
                "auth/invalid-credential": "Sign-in details were not accepted.",
                "auth/too-many-requests":
                  "Too many attempts. Please wait before trying again.",
                "auth/popup-blocked":
                  "Allow the Google sign-in popup, then try again.",
                "auth/unauthorized-domain":
                  "This testing hostname is not authorized in Firebase.",
                "auth/requires-recent-login":
                  "Sign in again before this sensitive action.",
              } as Record<string, string>
            )[code] ||
              "Firebase could not complete this action. Please try again or contact the test operator."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  async function refresh() {
    const d = await api("/me");
    setMe(d);
    setAccess(await api("/pro-access"));
    if (d.pro) setPresets(await api("/pro/presets"));
    if (d.user.role === "admin") setAdmin(await api("/admin"));
  }
  async function start() {
    await auth!.currentUser!.reload();
    await auth!.currentUser!.getIdToken(true);
    await api("/session", {});
    await refresh();
    setMessage("Verified private workspace connected.");
  }
  if (!auth)
    return (
      <main>
        <h1>Firebase experiment is not configured</h1>
        <p>
          No account requests will be sent. Configure the isolated project
          before testing.
        </p>
      </main>
    );
  return (
    <main>
      <header>
        <p className="eyebrow">RANDOMTOOLS · PRIVATE PROOF OF CONCEPT</p>
        <h1>Firebase account testing</h1>
        <p>
          Synthetic accounts only. Existing Clerk accounts and the public 21
          tools are unchanged. Payments are disabled.
        </p>
      </header>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {busy && <p role="status">Working securely…</p>}
      {mode && code && (
        <section>
          <h2>
            {mode === "resetPassword"
              ? "Choose a new test password"
              : "Verify test email"}
          </h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const password = new FormData(e.currentTarget).get(
                "password",
              ) as string;
              void action(async () => {
                if (mode === "resetPassword") {
                  await verifyPasswordResetCode(auth, code);
                  await confirmPasswordReset(auth, code, password);
                } else if (mode === "verifyEmail")
                  await applyActionCode(auth, code);
                else throw Error("Unsupported recovery action");
                history.replaceState(null, "", location.pathname);
                setMessage("Recovery action completed. Sign in again.");
              });
            }}
          >
            {mode === "resetPassword" && (
              <label>
                New test password
                <input
                  name="password"
                  type="password"
                  autoComplete="new-password"
                  minLength={12}
                  required
                />
              </label>
            )}
            <button disabled={busy}>Confirm recovery action</button>
          </form>
        </section>
      )}
      {!signed ? (
        <div className="grid">
          <section>
            <h2>Sign in or register</h2>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget),
                  email = String(f.get("email")),
                  password = String(f.get("password")),
                  register = f.get("register") === "on";
                void action(async () => {
                  if (register) {
                    await createUserWithEmailAndPassword(auth, email, password);
                    await sendEmailVerification(auth.currentUser!, {
                      url: location.origin,
                      handleCodeInApp: false,
                    });
                    setMessage(
                      "Verification sent. Verify your test email before opening a workspace.",
                    );
                  } else {
                    await signInWithEmailAndPassword(auth, email, password);
                    setMessage(
                      "Signed in. Verify the private workspace connection next.",
                    );
                  }
                });
              }}
            >
              <label>
                Test email
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </label>
              <label>
                Test password
                <input
                  name="password"
                  type="password"
                  required
                  minLength={12}
                  autoComplete="current-password"
                />
              </label>
              <label className="check">
                <input type="checkbox" name="register" />
                Create a new synthetic account
              </label>
              <button disabled={busy}>Continue with email</button>
            </form>
            <button
              disabled={busy}
              onClick={() =>
                void action(async () => {
                  await signInWithPopup(auth, new GoogleAuthProvider());
                  setMessage(
                    "Google sign-in completed. Connect the private workspace next.",
                  );
                })
              }
            >
              Sign in with Google
            </button>
          </section>
          <section>
            <h2>Recover a test account</h2>
            <p>
              If eligible, Firebase sends a recovery link. Never share recovery
              codes with support.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const email = String(
                  new FormData(e.currentTarget).get("email"),
                );
                void action(async () => {
                  try {
                    await sendPasswordResetEmail(auth, email, {
                      url: location.origin,
                      handleCodeInApp: false,
                    });
                  } catch (e) {
                    if ((e as { code?: string }).code !== "auth/user-not-found")
                      throw e;
                  }
                  setMessage(
                    "If eligible, recovery instructions have been sent.",
                  );
                });
              }}
            >
              <label>
                Recovery email
                <input
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                />
              </label>
              <button disabled={busy}>Send recovery instructions</button>
            </form>
          </section>
        </div>
      ) : (
        <>
          <section>
            <h2>Verify and connect</h2>
            <p>
              A verified Firebase email, authorized tester ID, private gateway
              and server-side session are all required.
            </p>
            <div className="actions">
              <button disabled={busy} onClick={() => void action(start)}>
                Connect private workspace
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await sendEmailVerification(auth.currentUser!, {
                      url: location.origin,
                    });
                    setMessage("Verification instructions sent.");
                  })
                }
              >
                Resend verification
              </button>
              <button
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    if (me) await api("/logout", {});
                    await signOut(auth);
                    setMe(null);
                    setMessage("Signed out.");
                  })
                }
              >
                Sign out
              </button>
            </div>
          </section>
          {me && (
            <>
              <section>
                <h2>
                  {me.user.name} · {me.pro ? "Pro" : "Free"}
                </h2>
                <p>Permissions are checked by the server on every request.</p>
                <button disabled={busy} onClick={() => void action(refresh)}>
                  Refresh account
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      const data = await api("/account/export"),
                        url = URL.createObjectURL(
                          new Blob([JSON.stringify(data, null, 2)], {
                            type: "application/json",
                          }),
                        ),
                        a = document.createElement("a");
                      a.href = url;
                      a.download = "synthetic-account.json";
                      a.click();
                      setTimeout(() => URL.revokeObjectURL(url), 1000);
                      setMessage("Owned account export downloaded.");
                    })
                  }
                >
                  Export test data
                </button>
              </section>
              <section>
                <h2>Manual Pro access</h2>
                <p>
                  Current access: {me.pro ? "Active" : "Free"}. Latest request:{" "}
                  {access?.requests?.[0]?.status || "Not requested"}.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const reason = String(
                      new FormData(e.currentTarget).get("reason") || "",
                    );
                    void action(async () => {
                      await api("/pro-access/requests", { reason });
                      await refresh();
                      setMessage("Pro request submitted.");
                    });
                  }}
                >
                  <label>
                    Reason (optional)
                    <textarea name="reason" maxLength={500} />
                  </label>
                  <button
                    disabled={
                      busy ||
                      me.pro ||
                      access?.requests?.some((r: any) => r.status === "pending")
                    }
                  >
                    Request Pro
                  </button>
                </form>
              </section>
              {me.pro && (
                <section>
                  <h2>Populated workspace</h2>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void action(async () => {
                        await api("/pro/presets", {
                          name: String(f.get("name")),
                          data: { text: String(f.get("data")) },
                        });
                        await refresh();
                      });
                    }}
                  >
                    <label>
                      Preset name
                      <input name="name" maxLength={80} required />
                    </label>
                    <label>
                      Synthetic content
                      <textarea name="data" maxLength={10000} required />
                    </label>
                    <button disabled={busy}>Save owned preset</button>
                  </form>
                  <ul>
                    {presets.map((p) => (
                      <li key={p.id}>
                        {p.name}
                        <button
                          disabled={busy}
                          onClick={() =>
                            void action(async () => {
                              await api("/pro/presets", { id: p.id }, "DELETE");
                              await refresh();
                            })
                          }
                        >
                          Remove {p.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {admin && (
                <section>
                  <h2>Synthetic administration</h2>
                  <p>
                    There is no role promotion endpoint. Temporary test roles
                    are configured by a scoped operator.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      void action(async () => {
                        await api("/admin/pro-access/grants", {
                          userId: String(f.get("userId")),
                          duration: String(f.get("duration")),
                        });
                        await refresh();
                        setMessage("Synthetic grant audited.");
                      });
                    }}
                  >
                    <label>
                      Test recipient
                      <select name="userId">
                        {admin.users
                          .filter((u: any) => u.role !== "admin" && !u.disabled)
                          .map((u: any) => (
                            <option key={u.id} value={u.id}>
                              {u.name} · {u.id}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      Duration
                      <select name="duration">
                        <option value="7d">7 days</option>
                        <option value="30d">30 days</option>
                        <option value="permanent">
                          Permanent until revoked
                        </option>
                      </select>
                    </label>
                    <button disabled={busy}>Grant synthetic Pro</button>
                  </form>
                  <p>{admin.audit.length} recent audit events.</p>
                </section>
              )}
              <section>
                <h2>Delete synthetic account</h2>
                {me.user.role === "admin" ? (
                  <p>Administrator self-deletion is blocked by the server.</p>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const confirmation = String(
                        new FormData(e.currentTarget).get("confirmation"),
                      );
                      void action(async () => {
                        await api("/account", { confirmation }, "DELETE");
                        await signOut(auth);
                        setMessage(
                          "Synthetic account and owned records deleted.",
                        );
                      });
                    }}
                  >
                    <p>
                      Sign in again within five minutes. This removes the
                      Firebase identity and owned experiment data. Minimal
                      audit/tombstone evidence remains.
                    </p>
                    <label>
                      Type DELETE
                      <input
                        name="confirmation"
                        required
                        pattern="DELETE"
                        autoComplete="off"
                      />
                    </label>
                    <button disabled={busy}>
                      Delete synthetic account permanently
                    </button>
                  </form>
                )}
              </section>
            </>
          )}
        </>
      )}
      <footer>
        <a href="/__staging/logout">Exit private testing gateway</a>
        <p>No public signup release. No payments.</p>
      </footer>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Experiment />);
