import {
  managedAuth,
  managedSignOut,
  ManagedSignIn,
  ManagedSecurity,
} from "./auth";
import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import { download } from "./engines";
import { tools } from "./catalog";
import ProWorkspace from "./workspace";
import { ProAccess, AdminProAccess } from "./pro-access";
export default function Account({ page }: { page: string }) {
  const client = useQueryClient();
  const [params] = useSearchParams();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api("/me") });
  const [message, setMessage] = useState("");
  const [devLink, setDevLink] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setMessage("");
    setDevLink("");
  }, [page]);
  async function action(fn: () => Promise<any>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setDevLink("");
    try {
      const data = await fn();
      setMessage(data?.message || "Done");
      if (data?.developmentLink) setDevLink(data.developmentLink);
      await client.invalidateQueries();
      return data;
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const auth = [
    "login",
    "register",
    "forgot-password",
    "resend-verification",
    "reset-password",
    "verify-email",
  ].includes(page);
  if (auth && managedAuth) return <ManagedSignIn page={page} />;
  if (auth)
    return (
      <section className="form-page">
        <div className="eyebrow">YOUR RANDOMTOOLS ACCOUNT</div>
        <h1>
          {
            {
              login: "Welcome back.",
              register: "Make yourself at home.",
              "forgot-password": "Forgot your password?",
              "resend-verification": "A new verification link.",
              "reset-password": "A fresh start.",
              "verify-email": "Verify your email.",
            }[page]
          }
        </h1>
        <p>
          {page === "register"
            ? "Save your workspace. Keep the essentials free."
            : page === "verify-email"
              ? "Choose your final account password to activate this verified email address. You can use the password you chose during registration."
              : "Your tools are right where you left them."}
        </p>
        <form
          className="panel"
          onSubmit={(e) => {
            e.preventDefault();
            const b = Object.fromEntries(new FormData(e.currentTarget));
            if (page === "reset-password" || page === "verify-email")
              b.token = params.get("token") || "";
            void action(async () => {
              const data = await api("/auth/" + page, b);
              if (page === "login") window.location.assign("/dashboard");
              return data;
            });
          }}
        >
          {page === "register" && (
            <label>
              Display name
              <input name="name" autoComplete="name" required maxLength={80} />
            </label>
          )}
          {[
            "login",
            "register",
            "forgot-password",
            "resend-verification",
          ].includes(page) && (
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
              />
            </label>
          )}
          {["login", "register", "reset-password", "verify-email"].includes(
            page,
          ) && (
            <>
              <label htmlFor="account-password">
                Password
                <input
                  id="account-password"
                  aria-describedby="password-help"
                  name="password"
                  type="password"
                  autoComplete={
                    page === "login" ? "current-password" : "new-password"
                  }
                  minLength={12}
                  maxLength={128}
                  required
                />
              </label>
              <small id="password-help">
                At least 12 characters. Password managers welcome.
              </small>
            </>
          )}
          <button disabled={busy} className="primary">
            {busy
              ? "Please wait…"
              : page === "verify-email"
                ? "Verify email"
                : page === "login"
                  ? "Log in"
                  : page === "register"
                    ? "Create account"
                    : "Continue"}
          </button>
          {message && <p role="status">{message}</p>}
          {devLink && (
            <p className="error">
              Development adapter — no email sent.{" "}
              <a href={devLink}>Open testing link</a>
            </p>
          )}
        </form>
        <div className="links">
          <Link to="/login">Log in</Link>
          <Link to="/register">Create account</Link>
          <Link to="/forgot-password">Reset password</Link>
          <Link to="/resend-verification">Resend verification</Link>
        </div>
      </section>
    );
  if (me.isPending)
    return (
      <p className="loading" role="status">
        Loading account…
      </p>
    );
  if (!me.data?.user)
    return (
      <section className="form-page">
        <h1>Your workspace awaits.</h1>
        <p role={me.error ? "alert" : undefined}>
          {me.error
            ? me.error.message ||
              "Your account could not be loaded. Please try again."
            : "Sign in to access your account."}
        </p>
        {me.error && (
          <button className="secondary" onClick={() => void me.refetch()}>
            Try again
          </button>
        )}
        <Link className="primary" to="/login">
          Log in
        </Link>
      </section>
    );
  const user = me.data.user;
  return (
    <section className="dashboard">
      <div className="eyebrow">
        YOUR WORKSPACE · {me.data.pro ? "PRO" : "FREE"}
      </div>
      <h1>
        {page === "settings"
          ? "Account settings"
          : page === "subscription"
            ? "Your Pro access"
            : page === "admin"
              ? "Administration"
              : `Hello, ${user.name}.`}
      </h1>
      <div className="tabs">
        <Link className="secondary" to="/dashboard">
          Workspace
        </Link>
        <Link className="secondary" to="/settings">
          Settings
        </Link>
        <Link className="secondary" to="/subscription">
          Pro access
        </Link>
        {user.role === "admin" && (
          <Link className="secondary" to="/admin">
            Admin
          </Link>
        )}
        <button
          disabled={busy}
          onClick={() =>
            void action(async () => {
              const r = await api("/auth/logout", {});
              if (managedAuth) await managedSignOut();
              window.location.assign("/");
              return r;
            })
          }
        >
          Log out
        </button>
      </div>
      {message && (
        <p role="status" className="privacy">
          {message}
        </p>
      )}
      {busy && <p role="status">Working…</p>}
      {page === "settings" ? (
        <div className="dashboard-grid">
          <div className="panel">
            <h2>Profile</h2>
            <p>
              {user.email} · {user.verified ? "Verified" : "Unverified"}
            </p>
            {managedAuth && (
              <p className="muted">
                This display name belongs to your RandomTools workspace. Manage
                sign-in methods and recovery in Account security. Changing an
                email never transfers ownership of another account.
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action(() =>
                  api(
                    "/account",
                    { name: new FormData(e.currentTarget).get("name") },
                    "PATCH",
                  ),
                );
              }}
            >
              <label>
                Display name
                <input
                  name="name"
                  defaultValue={user.name}
                  required
                  maxLength={80}
                />
              </label>
              <button disabled={busy} className="primary">
                {busy ? "Saving…" : "Save profile"}
              </button>
            </form>
          </div>
          {managedAuth ? (
            <ManagedSecurity />
          ) : (
            <div className="panel">
              <h2>Change password</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void action(() =>
                    api(
                      "/account/password",
                      Object.fromEntries(new FormData(e.currentTarget)),
                    ),
                  );
                }}
              >
                <label>
                  Current password
                  <input
                    name="currentPassword"
                    type="password"
                    required
                    autoComplete="current-password"
                  />
                </label>
                <label>
                  New password
                  <input
                    name="password"
                    type="password"
                    minLength={12}
                    maxLength={128}
                    required
                    autoComplete="new-password"
                  />
                </label>
                <button className="secondary">
                  Change and revoke sessions
                </button>
              </form>
            </div>
          )}
          <div className="panel">
            <h2>Your data</h2>
            <p>
              Export your profile, preferences, presets, history and membership
              records.
            </p>
            <button
              disabled={busy}
              className="secondary"
              onClick={() =>
                void action(async () => {
                  download(
                    JSON.stringify(await api("/account/export"), null, 2),
                    "randomtools-account.json",
                  );
                  return { message: "Export downloaded" };
                })
              }
            >
              Download data export
            </button>
          </div>
          <div className="panel">
            <h2>Delete account</h2>
            {user.role === "admin" ? (
              <p>
                Administrator accounts are protected from self-deletion. Contact
                the owner for a reviewed recovery or deletion process. Your
                Admin and inherent Pro access have no scheduled expiry.
              </p>
            ) : (
              <>
                <p>
                  Permanently deletes your account, sessions, saved work and
                  manual Pro access records. Payments are disabled.
                </p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action(async () => {
                      const r = await api(
                        "/account",
                        managedAuth
                          ? {
                              confirmation: new FormData(e.currentTarget).get(
                                "confirmation",
                              ),
                            }
                          : Object.fromEntries(new FormData(e.currentTarget)),
                        "DELETE",
                      );
                      if (managedAuth) await managedSignOut();
                      client.clear();
                      window.location.assign("/");
                      return r;
                    });
                  }}
                >
                  {managedAuth ? (
                    <>
                      <p id="delete-help">
                        Sign in again within five minutes before deleting. This
                        also deletes your Clerk identity. Export your data
                        first. If deletion is interrupted, access stays disabled
                        while support completes cleanup.
                      </p>
                      <label>
                        Type DELETE to confirm
                        <input
                          name="confirmation"
                          autoComplete="off"
                          required
                          pattern="DELETE"
                          aria-describedby="delete-help"
                        />
                      </label>
                    </>
                  ) : (
                    <label>
                      Confirm password
                      <input
                        name="password"
                        type="password"
                        required
                        autoComplete="current-password"
                      />
                    </label>
                  )}
                  <label>
                    <input type="checkbox" required /> I understand that
                    deletion is permanent.
                  </label>
                  <button disabled={busy} className="secondary">
                    Permanently delete account
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      ) : page === "subscription" ? (
        <ProAccess />
      ) : page === "admin" ? (
        user.role === "admin" ? (
          <Admin action={action} busy={busy} />
        ) : (
          <p role="alert">Administrator access required.</p>
        )
      ) : me.data.pro ? (
        <ProWorkspace action={action} busy={busy} />
      ) : (
        <div className="panel" style={{ marginTop: 24 }}>
          <h2>Your essentials, ready to go.</h2>
          <p>
            All tools are free. Favourites and your theme are saved on this
            device. Pro adds a synced workspace, saved presets and workflows.
          </p>
          <Link className="primary" to="/tools">
            Explore free tools
          </Link>{" "}
          <Link className="secondary" to="/pro">
            Explore Pro
          </Link>
        </div>
      )}
    </section>
  );
}
type Action = (fn: () => Promise<any>) => Promise<any>;
function Admin({ action, busy }: { action: Action; busy: boolean }) {
  const [search, setSearch] = useState("");
  const q = useQuery({
    queryKey: ["admin", search],
    queryFn: () => api("/admin?search=" + encodeURIComponent(search)),
  });
  return (
    <>
      <div className="panel" style={{ marginTop: 24 }}>
        <h2>Overview</h2>
        <p>
          {q.data?.stats?.users ?? "—"} registered users ·{" "}
          {q.data?.stats?.pro ?? "—"} active Pro users
        </p>
        <label>
          Find users
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or email"
          />
        </label>
        {q.isPending && <p role="status">Loading administration…</p>}
        {q.data?.users?.length === 0 && <p>No matching accounts.</p>}
        {q.data?.users?.map((u: any) => (
          <div key={u.id}>
            <span>
              {u.name} · {u.email} · {u.role}
            </span>
            <button
              disabled={busy || u.role === "admin"}
              className="secondary"
              onClick={() =>
                void action(() =>
                  api("/admin/users", { id: u.id, disabled: !u.disabled }),
                )
              }
            >
              {u.role === "admin"
                ? "Protected administrator"
                : u.disabled
                  ? "Enable account"
                  : "Disable account"}
            </button>
          </div>
        ))}
      </div>
      <AdminProAccess users={q.data?.users || []} />
      <div className="dashboard-grid" style={{ marginTop: 20 }}>
        <div className="panel">
          <h2>Tool availability</h2>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const b = new FormData(e.currentTarget);
              void action(() =>
                api("/admin/tools", {
                  tool: b.get("tool"),
                  enabled: b.get("enabled") === "on",
                }),
              );
            }}
          >
            <label>
              Tool
              <select name="tool">
                {tools.map((t) => (
                  <option value={t.id} key={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input type="checkbox" name="enabled" defaultChecked /> Enabled
            </label>
            <button disabled={busy} className="secondary">
              Save availability
            </button>
          </form>
        </div>
        {["audit", "usage"].map((key) => (
          <div key={key} className="panel">
            <h2>{key === "audit" ? "Audit logs" : "Anonymous usage"}</h2>
            {key === "audit" ? (
              q.isPending ? (
                <p role="status">Loading audit events…</p>
              ) : q.data?.audit?.length ? (
                <ol
                  className="audit-events"
                  aria-label="Recent administrative and account events"
                >
                  {q.data.audit.map(
                    (event: {
                      id: string;
                      action: string;
                      created_at: number;
                      actor_id: string | null;
                      target_id: string | null;
                    }) => (
                      <li key={event.id}>
                        <strong>{event.action}</strong>
                        <time
                          dateTime={new Date(
                            event.created_at * 1000,
                          ).toISOString()}
                        >
                          {new Date(event.created_at * 1000).toLocaleString()}
                        </time>
                        <small>
                          Actor: {event.actor_id || "System"}
                          <br />
                          Target: {event.target_id || "None"}
                          <br />
                          Event: {event.id}
                        </small>
                      </li>
                    ),
                  )}
                </ol>
              ) : (
                <p>No recent audit events.</p>
              )
            ) : (
              <pre>{JSON.stringify(q.data?.[key] || [], null, 2)}</pre>
            )}
          </div>
        ))}
      </div>
      {q.error && <p role="alert">{q.error.message}</p>}
    </>
  );
}
