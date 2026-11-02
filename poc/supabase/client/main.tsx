import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ClerkProvider, SignIn, SignOutButton, useAuth } from "@clerk/react";

const publishableKey = import.meta.env.VITE_POC_CLERK_PUBLISHABLE_KEY || "";
const projectRef = import.meta.env.VITE_POC_PROJECT_REF || "";
const configured =
  /^pk_test_/.test(publishableKey) &&
  /^[a-z]{20}$/.test(projectRef) &&
  location.origin === "http://127.0.0.1:54380";
const endpoint = `https://${projectRef}.supabase.co/functions/v1/randomtools-poc`;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function Tester() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("No requests run.");
  const [report, setReport] = useState("");
  if (!isLoaded)
    return <p role="status">Loading dedicated development authentication…</p>;
  if (!isSignedIn)
    return (
      <>
        <p>
          Use a synthetic account in the separate POC Clerk development
          instance.
        </p>
        <SignIn routing="hash" />
      </>
    );
  async function run(benchmark: boolean) {
    if (busy || !/^[a-f0-9]{64}$/.test(key)) return;
    setBusy(true);
    setMessage("Running bounded requests…");
    setReport("");
    const rows: {
      status: number;
      elapsedMs: number;
      handlerWallMs: number | null;
    }[] = [];
    const started = new Date().toISOString();
    let completed = false;
    async function call(operation: string, body = {}) {
      // Normal Clerk SDK refresh; never export or persist bearer tokens.
      const token = await getToken();
      if (!token) throw Error("Signed out");
      const start = performance.now();
      let r: Response;
      try {
        r = await fetch(endpoint, {
          method: "POST",
          redirect: "error",
          headers: {
            authorization: `Bearer ${token}`,
            "x-poc-access": key,
            "content-type": "application/json",
          },
          body: JSON.stringify({ operation, body }),
          signal: AbortSignal.timeout(20000),
        });
      } catch {
        rows.push({
          status: 0,
          elapsedMs: performance.now() - start,
          handlerWallMs: null,
        });
        throw Error("Transport unavailable");
      }
      let result;
      let malformed = false;
      try {
        result = await r.json();
      } catch {
        malformed = true;
      }
      rows.push({
        status: r.status,
        elapsedMs: performance.now() - start,
        handlerWallMs:
          Number(
            /dur=([\d.]+)/.exec(r.headers.get("server-timing") || "")?.[1],
          ) || null,
      });
      if (!r.ok || malformed) throw Error("Request denied");
      return result;
    }
    try {
      await call("me");
      if (benchmark) {
        for (let i = 0; i < 10; i++) {
          await wait(650);
          await call("me");
        }
        for (let i = 0; i < 6; i++) {
          await wait(3500);
          const batch = await Promise.allSettled(
            ["me", "workspace", "workspace", "workspace", "me"].map((op) =>
              call(op),
            ),
          );
          if (batch.some((r) => r.status === "rejected"))
            throw Error("Batch failed");
        }
        for (let i = 0; i < 3; i++) {
          await wait(3500);
          const saved = await call("save", {
            name: "POC browser disposable",
            data: "x".repeat(2048),
          });
          if (
            !saved ||
            typeof saved !== "object" ||
            !("id" in saved) ||
            typeof saved.id !== "string"
          )
            throw Error("Invalid save response");
          await call("delete", { id: saved.id });
        }
      }
      completed = true;
      setMessage(
        benchmark
          ? "Bounded workload completed."
          : "Authenticated account check passed.",
      );
    } catch {
      setMessage(
        "Stopped on denial, expiry, throttling or dependency failure. No further batches sent.",
      );
    } finally {
      const sorted = rows.map((r) => r.elapsedMs).sort((a, b) => a - b);
      const p = (n: number) =>
        sorted.length ? sorted[Math.ceil(n * sorted.length) - 1] : null;
      setReport(
        JSON.stringify(
          {
            kind: "hosted-poc-wall-latency",
            start: started,
            end: new Date().toISOString(),
            completed,
            requests: rows.length,
            statuses: rows.reduce<Record<string, number>>(
              (s, r) => ({ ...s, [r.status]: (s[r.status] || 0) + 1 }),
              {},
            ),
            firstObservedMs: rows[0]?.elapsedMs,
            medianMs: p(0.5),
            p95Ms: p(0.95),
            p99Ms: p(0.99),
            cpuMs: null,
            note: "Wall latency only; establish actual cold starts and CPU from provider execution events.",
          },
          null,
          2,
        ),
      );
      setBusy(false);
    }
  }
  return (
    <>
      <p>
        Server checks the synthetic subject allowlist, live Clerk status and
        current Postgres permissions on every request.
      </p>
      <label>
        Prototype-only access key{" "}
        <input
          type="password"
          autoComplete="off"
          value={key}
          disabled={busy}
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      <p>
        <button
          disabled={busy || key.length !== 64}
          onClick={() => void run(false)}
        >
          Check account
        </button>{" "}
        <button
          disabled={busy || key.length !== 64}
          onClick={() => void run(true)}
        >
          Run 47-request bounded workload
        </button>{" "}
        <button
          disabled={busy}
          onClick={() => {
            setKey("");
            setReport("");
          }}
        >
          Clear local key and report
        </button>
      </p>
      {!busy && <SignOutButton />}
      <p role="status">{message}</p>
      <pre aria-label="Sanitized measurement report">{report}</pre>
      <p>
        No account bodies, credentials or tokens are included in the report. The
        key lives only in this page's memory.
      </p>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <main
    style={{
      fontFamily: "system-ui",
      maxWidth: 800,
      margin: "2rem auto",
      padding: "1rem",
    }}
  >
    <h1>RandomTools isolated backend POC</h1>
    <p>
      Local synthetic testing only. Cloudflare staging is unchanged. Payments
      are absent.
    </p>
    {configured ? (
      <ClerkProvider publishableKey={publishableKey}>
        <Tester />
      </ClerkProvider>
    ) : (
      <p role="alert">
        Not configured. Use a new POC development publishable key and isolated
        project reference. This harness runs only on http://127.0.0.1:54380.
      </p>
    )}
  </main>,
);
