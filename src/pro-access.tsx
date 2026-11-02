import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";

type RequestRow = {
  id: string;
  user_id?: string;
  reason: string;
  status: "pending" | "approved" | "denied";
  created_at: number;
  decided_at: number | null;
  name?: string;
  email?: string;
  disabled?: number;
};
type Grant = {
  id: string;
  user_id?: string;
  duration: string;
  expires_at: number | null;
  granted_at: number;
  revoked_at: number | null;
  name?: string;
  email?: string;
  revocation_reason?: string;
};
type Person = {
  id: string;
  name: string;
  email: string;
  role: string;
  disabled: number;
};
const terms = [
  { value: "7d", label: "7 days" },
  { value: "30d", label: "30 days" },
  { value: "permanent", label: "Permanent · until revoked" },
];
const date = (ts: number) => new Date(ts * 1000).toLocaleString();
const state = (g: Grant) =>
  g.revoked_at !== null
    ? "revoked"
    : g.expires_at !== null && g.expires_at <= Date.now() / 1000
      ? "expired"
      : "active";
function useAccessAction() {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  async function send(path: string, body: unknown) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await api(path, body);
      setMessage(result.message || "Updated");
      await client.invalidateQueries();
      return result;
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return {
    busy,
    send,
    feedback: (
      <>
        {busy && <p role="status">Saving changes…</p>}
        {message && (
          <p role="status" className="privacy">
            {message}
          </p>
        )}
        {error && <p role="alert">{error}</p>}
      </>
    ),
  };
}
export function ProAccess() {
  const q = useQuery<{ pro: boolean; requests: RequestRow[]; grants: Grant[] }>(
    { queryKey: ["pro-access"], queryFn: () => api("/pro-access"), retry: 1 },
  );
  const action = useAccessAction();
  const [reason, setReason] = useState("");
  if (q.isPending) return <p role="status">Loading Pro access…</p>;
  if (q.error)
    return (
      <div className="panel">
        <p role="alert">{q.error.message}</p>
        <button className="secondary" onClick={() => void q.refetch()}>
          Retry access status
        </button>
      </div>
    );
  const pending = q.data.requests.find((r) => r.status === "pending");
  return (
    <div className="pro-management">
      <div className="panel pro-access-intro">
        <div className="eyebrow">FREE FIRST · NO PAYMENTS</div>
        <h2>
          {q.data.pro
            ? "Your Pro access is active"
            : "A little more room to create."}
        </h2>
        <p>
          All 18 free tools stay available. Pro adds saved workspaces, batch
          tools and advanced exports. Access is manually approved, with no
          payment or subscription required.
        </p>
        <p>
          Grants last 7 days, 30 days, or until revoked. Permanent means no
          scheduled expiry; an administrator can still revoke access.
        </p>
      </div>
      {action.feedback}
      <div className="dashboard-grid">
        <div className="panel">
          <h2>Request Pro access</h2>
          {pending ? (
            <p role="status">
              Your request is pending review. You can have one pending request
              at a time.
            </p>
          ) : q.data.pro ? (
            <p>You already have Pro access. No request is needed.</p>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action
                  .send("/pro-access/requests", { reason })
                  .then((r) => {
                    if (r) setReason("");
                  });
              }}
            >
              <label htmlFor="pro-reason">
                Why would you like Pro?{" "}
                <span className="muted">(optional)</span>
              </label>
              <textarea
                id="pro-reason"
                rows={4}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                aria-describedby="pro-reason-help"
                disabled={action.busy}
              />
              <p id="pro-reason-help" className="muted">
                {reason.length}/500 characters. Only administrators can review
                your reason. Please leave out sensitive information.
              </p>
              <button className="primary" disabled={action.busy}>
                Request Pro access
              </button>
            </form>
          )}
          <h3>Request history</h3>
          {!q.data.requests.length && <p className="muted">No requests yet.</p>}
          {q.data.requests.map((r) => (
            <article className="access-row" key={r.id}>
              <span className={`access-status ${r.status}`}>{r.status}</span>
              <p>
                Requested {date(r.created_at)}
                {r.decided_at ? ` · Reviewed ${date(r.decided_at)}` : ""}
              </p>
              {r.reason && <p className="access-reason">{r.reason}</p>}
            </article>
          ))}
        </div>
        <div className="panel">
          <h2>Access history</h2>
          {!q.data.grants.length && (
            <p className="muted">
              Approved access will appear here. Approval is not guaranteed and
              may take time.
            </p>
          )}
          {q.data.grants.map((g) => (
            <article className="access-row" key={g.id}>
              <span className={`access-status ${state(g)}`}>{state(g)}</span>
              <h3>
                {g.expires_at === null
                  ? "Permanent grant"
                  : `${g.duration === "7d" ? 7 : 30}-day grant`}
              </h3>
              <p>
                {g.expires_at === null
                  ? "No scheduled expiry"
                  : `Expires ${date(g.expires_at)}`}
              </p>
              {g.revoked_at !== null && <p>Revoked {date(g.revoked_at)}</p>}
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
export function AdminProAccess({ users }: { users: Person[] }) {
  const [filter, setFilter] = useState("pending"),
    [recipient, setRecipient] = useState(""),
    [term, setTerm] = useState("30d");
  const action = useAccessAction();
  const q = useQuery<{ requests: RequestRow[]; grants: Grant[] }>({
    queryKey: ["admin-pro-access", filter, recipient],
    queryFn: () =>
      api(
        "/admin/pro-access?status=" +
          filter +
          "&userId=" +
          encodeURIComponent(recipient),
      ),
    retry: 1,
  });
  return (
    <section className="pro-management" aria-labelledby="manage-pro-title">
      <div className="access-heading">
        <div>
          <div className="eyebrow">MANUAL ACCESS · NO BILLING</div>
          <h2 id="manage-pro-title">Pro access management</h2>
          <p>
            Review requests or grant access directly to a friend or tester.
            Every change is recorded in the audit log.
          </p>
        </div>
        <span className="access-status pending">
          {q.data?.requests.filter((r) => r.status === "pending").length ?? "—"}{" "}
          pending in view
        </span>
      </div>
      {action.feedback}
      <div className="dashboard-grid">
        <div className="panel">
          <h3>Grant access directly</h3>
          <p>
            No request is required. Use “Find users” above to narrow the
            recipient list.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void action.send("/admin/pro-access/grants", {
                userId: recipient,
                duration: term,
              });
            }}
          >
            <fieldset disabled={action.busy}>
              <label>
                Pro recipient
                <select
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  required
                >
                  <option value="">Select an account</option>
                  {users.map((u) => (
                    <option value={u.id} key={u.id} disabled={!!u.disabled}>
                      {u.name} · {u.email}
                      {u.disabled ? " · disabled" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Direct grant duration
                <select value={term} onChange={(e) => setTerm(e.target.value)}>
                  {terms.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              {term === "permanent" && (
                <label>
                  <input type="checkbox" required /> I understand this grant has
                  no scheduled expiry.
                </label>
              )}
              <p className="muted">
                A new grant replaces the current grant. Administrators retain
                Pro through their admin role even if a separate grant is
                revoked.
              </p>
              <button
                className="primary"
                disabled={
                  !recipient ||
                  !users.some((u) => u.id === recipient && !u.disabled)
                }
              >
                Grant Pro access
              </button>
            </fieldset>
          </form>
        </div>
        <div className="panel">
          <h3>Access requests</h3>
          <label>
            Request status
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
              <option value="denied">Denied</option>
              <option value="all">All requests</option>
            </select>
          </label>
          {q.isPending && <p role="status">Loading requests…</p>}
          {q.error && (
            <>
              <p role="alert">{q.error.message}</p>
              <button className="secondary" onClick={() => void q.refetch()}>
                Retry requests
              </button>
            </>
          )}
          {q.data && !q.data.requests.length && (
            <p className="muted">
              No {filter === "all" ? "" : "matching "}requests.
            </p>
          )}
          {q.data?.requests.map((r) => (
            <article className="access-row" key={r.id}>
              <span className={`access-status ${r.status}`}>{r.status}</span>
              <h4>{r.name}</h4>
              <p>
                {r.email} · {date(r.created_at)}
              </p>
              <p className="access-reason">
                {r.reason || "No reason provided."}
              </p>
              {r.status === "pending" && (
                <form
                  aria-label={`Review request from ${r.email}`}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void action.send("/admin/pro-access/requests", {
                      id: r.id,
                      decision: "approved",
                      duration: new FormData(e.currentTarget).get("duration"),
                    });
                  }}
                >
                  <fieldset disabled={action.busy}>
                    <label>
                      Approval duration for {r.email}
                      <select name="duration" defaultValue="30d">
                        {terms.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="primary" disabled={!!r.disabled}>
                      Approve request
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() =>
                        void action.send("/admin/pro-access/requests", {
                          id: r.id,
                          decision: "denied",
                        })
                      }
                    >
                      Deny request
                    </button>
                    {!!r.disabled && (
                      <p>Re-enable this account before granting access.</p>
                    )}
                  </fieldset>
                </form>
              )}
            </article>
          ))}
        </div>
      </div>
      <div className="panel" style={{ marginTop: 20 }}>
        <h3>Grant history</h3>
        <p className="muted">
          Most recent 100 grants{recipient ? " for the selected recipient" : ""}
          . Select a recipient above to find their older grants. Expiry is
          enforced by the server; the labels below are informational.
        </p>
        {q.data && !q.data.grants.length && <p>No manual grants yet.</p>}
        {q.data?.grants.map((g) => (
          <article className="access-row access-grant" key={g.id}>
            <div>
              <span className={`access-status ${state(g)}`}>{state(g)}</span>
              <h4>
                {g.name} · {g.email}
              </h4>
              <p>
                {g.expires_at === null
                  ? "Permanent · until revoked"
                  : `Expires ${date(g.expires_at)}`}{" "}
                · Granted {date(g.granted_at)}
              </p>
              {g.revocation_reason && (
                <p>Revocation reason: {g.revocation_reason}</p>
              )}
            </div>
            {g.revoked_at === null && (
              <form
                aria-label={`Revoke grant for ${g.email}`}
                onSubmit={(e) => {
                  e.preventDefault();
                  void action.send("/admin/pro-access/revoke", {
                    id: g.id,
                    reason: new FormData(e.currentTarget).get("reason"),
                  });
                }}
              >
                <fieldset disabled={action.busy}>
                  <label>
                    Revocation reason for {g.email}
                    <input
                      name="reason"
                      required
                      maxLength={200}
                      placeholder="For the audit record"
                    />
                  </label>
                  <button className="secondary">Revoke grant</button>
                </fieldset>
              </form>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
