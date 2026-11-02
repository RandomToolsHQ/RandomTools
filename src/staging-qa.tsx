import { useAuth } from "@clerk/react";
import { useState } from "react";

type Check = { name: string; passed: boolean; status?: number };
type Mode = "free" | "pro" | "admin" | "cpu" | "expired" | "revoked";
// Compiled only into private staging. This is an ordinary Clerk client, with no
// extra API privilege, secrets, account deletion or token-export functionality.
export default function StagingQA() {
  const { getToken, isSignedIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState(() => {
    try {
      return sessionStorage.getItem("rt-staging-verification") || "";
    } catch {
      return "";
    }
  });
  async function run(mode: Mode) {
    setBusy(true);
    setReport("");
    const started = new Date().toISOString();
    const checks: Check[] = [];
    const check = (name: string, passed: boolean, status?: number) => {
      checks.push({ name, passed, status });
      if (!passed) throw Error("Verification failed: " + name);
    };
    async function request(path: string, method = "GET", body?: unknown) {
      const bearer = await getToken();
      if (!bearer) throw Error("A real Clerk session is required");
      const response = await fetch("/api" + path, {
        method,
        credentials: "same-origin",
        headers: {
          Authorization: "Bearer " + bearer,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      return { status: response.status, data: (await response.json()) as any };
    }
    const expected = async (
      name: string,
      path: string,
      status: number,
      method = "GET",
      body?: unknown,
    ) => {
      const result = await request(path, method, body);
      check(name, result.status === status, result.status);
      return result.data;
    };
    try {
      const me = await expected("real Clerk account", "/me", 200);
      check("mapped account exists", !!me.user?.id);
      if (mode === "free") {
        check(
          "ordinary member without entitlement",
          me.user.role === "free" && !me.pro,
        );
        const denied: [string, string, unknown?][] = [
          ["/pro/preferences", "GET"],
          [
            "/pro/preferences",
            "PUT",
            {
              data: { role: "admin" },
              retentionDays: 7,
              role: "admin",
              pro: true,
            },
          ],
          ["/pro/presets", "GET"],
          [
            "/pro/presets",
            "POST",
            { kind: "preset", name: "denied", data: {} },
          ],
          ["/pro/presets", "DELETE", { id: "phase3-nonexistent" }],
          ["/pro/history", "GET"],
          ["/pro/history", "POST", { tool: "case", data: "denied" }],
          ["/pro/history", "DELETE", {}],
          ["/admin", "GET"],
          ["/admin/users", "POST", { id: me.user.id, disabled: true }],
          ["/admin/tools", "POST", { tool: "json", enabled: false }],
          [
            "/admin/reconcile",
            "POST",
            {
              claimId: "phase3-missing",
              eventId: "phase3-missing",
              ownershipVerified: true,
              paidThrough: Math.floor(Date.now() / 1000) + 300,
            },
          ],
          [
            "/admin/subscriptions/revoke",
            "POST",
            { id: "phase3-nonexistent", reason: "manual" },
          ],
          ["/admin/mock-payment", "POST", {}],
        ];
        for (const [path, method, body] of denied)
          await expected(
            method + " " + path + " denied",
            path,
            403,
            method,
            body,
          );
        const membership = await expected(
          "membership readable",
          "/subscription",
          200,
        );
        check(
          "checkout remains disabled",
          membership.checkoutEnabled === false,
        );
        const after = await expected(
          "role injection changes nothing",
          "/me",
          200,
        );
        check(
          "server role and Pro remain free",
          after.user.role === "free" && !after.pro,
        );
      }
      if (mode === "pro") {
        check(
          "temporary Pro, ordinary role",
          me.user.role === "free" && me.pro === true,
        );
        const original = await expected(
          "read preferences",
          "/pro/preferences",
          200,
        );
        const names = [
          "Phase3 preset " + crypto.randomUUID(),
          "Phase3 workflow " + crypto.randomUUID(),
        ];
        const created: string[] = [];
        try {
          await expected(
            "save preferences with ignored role injection",
            "/pro/preferences",
            200,
            "PUT",
            {
              data: { favorites: ["json"], phase3: true },
              retentionDays: 7,
              role: "admin",
              userId: "phase3-other",
            },
          );
          const prefs = await expected(
            "restore cloud preferences",
            "/pro/preferences",
            200,
          );
          check(
            "preferences round trip",
            prefs.retention_days === 7 &&
              JSON.parse(prefs.data).favorites[0] === "json",
          );
          for (const [i, kind] of ["preset", "workflow"].entries())
            await expected("save " + kind, "/pro/presets", 200, "POST", {
              kind,
              name: names[i],
              data: { operation: "case", steps: "trim,lower,slug" },
            });
          const records = await expected(
            "load saved configurations",
            "/pro/presets",
            200,
          );
          created.push(
            ...records
              .filter((r: any) => names.includes(r.name))
              .map((r: any) => r.id),
          );
          check(
            "both configurations owned by current user",
            created.length === 2 &&
              records
                .filter((r: any) => created.includes(r.id))
                .every((r: any) => r.user_id === me.user.id),
          );
          await expected(
            "foreign fixture delete is scoped",
            "/pro/presets",
            200,
            "DELETE",
            { id: "phase3_foreign_preset" },
          );
          await expected("save private history", "/pro/history", 200, "POST", {
            tool: "case",
            data: "Phase3 disposable result",
          });
          const history = await expected(
            "load private history",
            "/pro/history",
            200,
          );
          check(
            "history owned by current user",
            history.some((r: any) => r.data === "Phase3 disposable result") &&
              history.every((r: any) => r.user_id === me.user.id),
          );
          const exported = await expected(
            "account data export",
            "/account/export",
            200,
          );
          check(
            "export identity and ownership",
            exported.profile.id === me.user.id &&
              exported.authentication.provider === "clerk" &&
              exported.saved_presets.every(
                (r: any) => r.user_id === me.user.id,
              ),
          );
          check(
            "export omits credentials",
            !/password_hash|CLERK_SECRET_KEY|STAGING_GATE_SIGNING_KEY/.test(
              JSON.stringify(exported),
            ),
          );
          await expected("disable retention", "/pro/preferences", 200, "PUT", {
            data: { phase3: true },
            retentionDays: 0,
          });
          const disabled = await expected(
            "retention-off write",
            "/pro/history",
            200,
            "POST",
            { tool: "case", data: "must not persist" },
          );
          check(
            "retention-off enforced",
            disabled.message === "History is disabled" &&
              (await expected("retention-off history", "/pro/history", 200))
                .length === 0,
          );
          const after = await expected(
            "entitlement cannot grant admin",
            "/me",
            200,
          );
          check("role remains free", after.user.role === "free");
        } finally {
          for (const id of created)
            await expected(
              "remove only QA configuration",
              "/pro/presets",
              200,
              "DELETE",
              { id },
            );
          await expected(
            "restore original preferences",
            "/pro/preferences",
            200,
            "PUT",
            {
              data: JSON.parse(original.data),
              retentionDays: original.retention_days,
            },
          );
        }
      }
      if (mode === "admin") {
        check("explicit temporary server admin", me.user.role === "admin");
        const before = await expected("admin dashboard read", "/admin", 200);
        const searched = await expected(
          "parameterized admin search",
          "/admin?search=" + encodeURIComponent("' OR 1=1 --"),
          200,
        );
        check("search cannot broaden results", searched.users.length === 0);
        await expected("self-disable blocked", "/admin/users", 400, "POST", {
          id: me.user.id,
          disabled: true,
        });
        await expected("missing user rejected", "/admin/users", 404, "POST", {
          id: "phase3-missing",
          disabled: true,
        });
        await expected(
          "unknown catalogue tool rejected",
          "/admin/tools",
          400,
          "POST",
          { tool: "phase3-unknown", enabled: true },
        );
        await expected(
          "live mock payment unavailable",
          "/admin/mock-payment",
          404,
          "POST",
          {},
        );
        await expected(
          "unmatched reconciliation rejected",
          "/admin/reconcile",
          400,
          "POST",
          {
            claimId: "phase3-missing",
            eventId: "phase3-missing",
            ownershipVerified: true,
            paidThrough: Math.floor(Date.now() / 1000) + 300,
          },
        );
        await expected(
          "missing subscription rejected",
          "/admin/subscriptions/revoke",
          404,
          "POST",
          { id: "phase3-missing", reason: "manual" },
        );
        try {
          await expected(
            "disable staging JSON tool",
            "/admin/tools",
            200,
            "POST",
            { tool: "json", enabled: false },
          );
        } finally {
          await expected(
            "restore staging JSON tool",
            "/admin/tools",
            200,
            "POST",
            { tool: "json", enabled: true },
          );
        }
        await expected(
          "revoke only QA subscription",
          "/admin/subscriptions/revoke",
          200,
          "POST",
          { id: "phase3_authorized_subscription", reason: "manual" },
        );
        const after = await expected("read scoped audit events", "/admin", 200);
        check(
          "audit records actual admin actor",
          after.audit
            .filter((a: any) => !before.audit.some((b: any) => b.id === a.id))
            .some(
              (a: any) =>
                a.actor_id === me.user.id &&
                a.action === "tool.availability:true",
            ),
        );
      }
      if (mode === "cpu") {
        check(
          "ordinary entitled workload",
          me.user.role === "free" && me.pro === true,
        );
        for (let i = 0; i < 20; i++)
          await expected("sequential me " + i, "/me", 200);
        const paths = [
          "/me",
          "/subscription",
          "/pro/preferences",
          "/pro/presets",
          "/pro/history",
          "/account/export",
        ];
        for (let batch = 0; batch < 20; batch++) {
          await Promise.all(
            Array.from({ length: 5 }, (_, i) =>
              expected(
                "bounded read " + (batch * 5 + i),
                paths[(batch * 5 + i) % paths.length],
                200,
              ),
            ),
          );
          // Development BAPI is limited to 100 calls/10 s; each normal auth
          // request checks both session and profile. Keep the load below that.
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
        }
      }
      if (mode === "expired" || mode === "revoked") {
        const bearer = await getToken({ skipCache: true });
        if (!bearer) throw Error("A real Clerk session is required");
        const claims = JSON.parse(
          atob(bearer.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
        );
        const wait =
          mode === "expired" ? claims.exp * 1000 - Date.now() + 6000 : 15000;
        check("bounded session-test interval", wait > 0 && wait < 90000);
        await new Promise((resolve) => window.setTimeout(resolve, wait));
        if (mode === "revoked")
          check(
            "revoked bearer still within JWT lifetime",
            claims.exp * 1000 > Date.now(),
          );
        const denied = await fetch("/api/me", {
          credentials: "same-origin",
          headers: { Authorization: "Bearer " + bearer },
        });
        check(mode + " bearer rejected", denied.status === 401, denied.status);
        if (mode === "expired")
          await expected("fresh session after token expiry", "/me", 200);
      }
    } catch (error) {
      checks.push({
        name:
          error instanceof Error &&
          error.message.startsWith("Verification failed: ")
            ? error.message
            : "Verification unavailable",
        passed: false,
      });
    } finally {
      const completed = JSON.stringify(
        { mode, started, ended: new Date().toISOString(), checks },
        null,
        2,
      );
      // Diagnostics only, never credentials: retain the result when Clerk
      // unmounts this component on session revocation. Reload to read it.
      try {
        sessionStorage.setItem("rt-staging-verification", completed);
      } catch {
        /* The visible report remains usable if browser storage is blocked. */
      }
      setReport(completed);
      setBusy(false);
    }
  }
  return (
    <section className="text-page">
      <h1>Private staging verification</h1>
      <p>
        Authorized disposable test account only. Uses the current Clerk session
        and normal server permissions. No live payments or account deletion.
      </p>
      {(["free", "pro", "admin", "cpu", "expired", "revoked"] as const).map(
        (mode) => (
          <button
            key={mode}
            disabled={busy || !isSignedIn}
            onClick={() => void run(mode)}
          >
            Run {mode} checks
          </button>
        ),
      )}
      {busy && <p role="status">Running bounded staging checks…</p>}
      <pre aria-label="Verification report" role="status">
        {report}
      </pre>
    </section>
  );
}
