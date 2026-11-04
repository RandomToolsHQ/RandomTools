import { beforeAll, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { SignJWT } from "jose";
import { digest } from "../worker/security";
let worker: { fetch(req: Request, env: any): Promise<Response> };
let pages: { fetch(req: Request, env: any): Promise<Response> };
beforeAll(async () => {
  execFileSync(process.execPath, ["scripts/phase111-build.mjs"], {
    windowsHide: true,
  });
  const modulePath = pathToFileURL(
    resolve(".wrangler/phase111/reference/api.js"),
  ).href;
  worker = (await import(modulePath)).default;
  pages = (
    await import(
      pathToFileURL(resolve(".wrangler/phase111/reference/dist/_worker.js"))
        .href
    )
  ).default;
}, 30000);
it("reference preserves original code apart from declared isolation/CSP substitutions", async () => {
  const report = JSON.parse(
    await readFile(".wrangler/phase111/build.json", "utf8"),
  );
  expect(report.substitutions.map((x: any) => x.count)).toEqual([
    1, 1, 2, 1, 1,
  ]);
  const api = await readFile(".wrangler/phase111/reference/api.js", "utf8");
  expect(api).toContain("randomtools-phase11-reference-v1");
  expect(
    await readFile(".wrangler/phase111/reference/wrangler.toml", "utf8"),
  ).toContain("workers_dev=false");
  expect(
    await readFile(".wrangler/phase111/reference/wrangler.toml", "utf8"),
  ).toContain("00000000-0000-0000-0000-000000000000");
});
it("reference credential form retains its restrictive CSP and exact-origin POST guard", async () => {
  const origin = "https://randomtools-phase11-baseline.pages.dev";
  const env: any = {
    STAGING_GATE_ORIGIN: origin,
    STAGING_GATE_SIGNING_KEY: "a".repeat(64),
    STAGING_GATE_TESTERS: JSON.stringify([
      {
        email: "phase11-00000000-member@example.com",
        keyHash: digest("c".repeat(64)),
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      },
    ]),
    GATE_DB: {
      prepare: () => ({
        first: async () => "randomtools-phase11-reference-v1",
      }),
    },
  };
  const form = await pages.fetch(new Request(origin + "/__staging"), env);
  expect(form.status).toBe(200);
  expect(form.headers.get("referrer-policy")).toBe("same-origin");
  expect(form.headers.get("content-security-policy")).toContain(
    "default-src 'none'",
  );
  expect(form.headers.get("content-security-policy")).toContain(
    "form-action 'self'",
  );
  const denied = await pages.fetch(
    new Request(origin + "/__staging", {
      method: "POST",
      headers: {
        origin: "null",
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "email=synthetic&key=invalid",
    }),
    env,
  );
  expect(denied.status).toBe(403);
});
it("compiled reference refuses existing Firebase D1 marker and accepts only new isolation before auth", async () => {
  const origin = "https://randomtools-phase11-baseline.pages.dev",
    email = "phase11-00000000-member@example.com",
    key = "a".repeat(64),
    now = Math.floor(Date.now() / 1000),
    keyHash = digest("c".repeat(64));
  const jwt = await new SignJWT({ keyHash })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(origin)
    .setAudience("randomtools-private-staging")
    .setSubject(digest(email))
    .setIssuedAt(now)
    .setExpirationTime(now + 1800)
    .sign(Uint8Array.from(key.match(/../g)!, (x) => parseInt(x, 16)));
  const env: any = {
    ENVIRONMENT: "firebase-poc",
    APP_ORIGIN: origin,
    STAGING_GATE_ORIGIN: origin,
    STAGING_GATE_SIGNING_KEY: key,
    STAGING_GATE_TESTERS: JSON.stringify([
      { email, keyHash, expiresAt: now + 3600 },
    ]),
    FIREBASE_PROJECT_ID: "randomtools-supabase-auth-poc",
    FIREBASE_WEB_API_KEY: "synthetic-public-key",
    FIREBASE_TESTER_IDS: '["synthetic-member"]',
    RATE_LIMIT_SECRET: "r".repeat(32),
  };
  for (const [marker, status] of [
    ["randomtools-firebase-poc-v1", 503],
    ["randomtools-phase11-reference-v1", 401],
  ]) {
    env.DB = {
      prepare: (sql: string) => ({
        bind() {
          return this;
        },
        first: async () =>
          sql.includes("poc_metadata") ? marker : { count: 1 },
      }),
    };
    const r = await worker.fetch(
      new Request(origin + "/api/me", {
        headers: { cookie: "__Host-rt_staging=" + jwt },
      }),
      env,
    );
    expect(r.status).toBe(status);
  }
});
