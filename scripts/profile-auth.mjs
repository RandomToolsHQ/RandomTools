// Local synthetic provider/D1 profiling only; never reads real credentials.
/* global Request, Response */
import { Buffer } from "node:buffer";
import console from "node:console";
import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Session } from "node:inspector/promises";
import { performance } from "node:perf_hooks";
import fs from "node:fs/promises";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
await fs.mkdir(".wrangler/profiling", { recursive: true });
const originalSource = execFileSync(
  "git",
  ["show", "6651d9a:worker/clerk.ts"],
  { encoding: "utf8" },
).replace('"./security"', JSON.stringify(resolve("worker/security.ts")));
await fs.writeFile(".wrangler/profiling/baseline.ts", originalSource);
for (const [entry, out] of [
  [".wrangler/profiling/baseline.ts", "baseline"],
  ["worker/clerk.ts", "clerk"],
])
  await build({
    entryPoints: [entry],
    outfile: ".wrangler/profiling/" + out + ".mjs",
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
  });
const { privateKey, publicKey } = await generateKeyPair("RS256");
const jwk = { ...(await exportJWK(publicKey)), kid: "fixture", alg: "RS256" };
const origin = "https://private.example.test",
  issuer = "https://fixture.clerk.accounts.dev",
  now = Date.now();
const bearer = await new SignJWT({
  sid: "sess_fixture",
  azp: origin,
  fva: [0, -1],
  v: 2,
})
  .setProtectedHeader({ alg: "RS256", kid: "fixture", typ: "JWT" })
  .setIssuer(issuer)
  .setSubject("user_fixture")
  .setIssuedAt()
  .setExpirationTime("10m")
  .sign(privateKey);
const counts = { session: 0, profile: 0, jwks: 0, d1: 0 };
globalThis.fetch = async (input) => {
  const url = String(input?.url || input);
  let body;
  if (url.endsWith("/jwks")) {
    counts.jwks++;
    body = { keys: [jwk] };
  } else if (url.includes("/sessions/sess_fixture")) {
    counts.session++;
    body = {
      object: "session",
      id: "sess_fixture",
      user_id: "user_fixture",
      status: "active",
      expire_at: now + 3600000,
    };
  } else if (url.includes("/users/user_fixture")) {
    counts.profile++;
    body = {
      object: "user",
      id: "user_fixture",
      first_name: "Fixture",
      last_name: "Tester",
      primary_email_address_id: "email_fixture",
      email_addresses: [
        {
          id: "email_fixture",
          email_address: "fixture@example.test",
          linked_to: [],
          verification: { status: "verified" },
        },
      ],
      banned: false,
      locked: false,
    };
  } else throw Error("Unexpected profile fetch");
  return Response.json(body);
};
const user = {
  id: "fixture",
  email: "fixture@example.test",
  name: "Fixture",
  role: "free",
  verified: 1,
  disabled: 0,
  password_hash: "managed:clerk",
};
const env = {
  CLERK_SECRET_KEY: "sk_test_fixture_not_a_credential",
  CLERK_PUBLISHABLE_KEY:
    "pk_test_" + Buffer.from("fixture.clerk.accounts.dev$").toString("base64"),
  CLERK_ISSUER: issuer,
  APP_ORIGIN: origin,
  ENVIRONMENT: "staging",
  CLERK_TESTER_IDS: '["user_fixture"]',
  DB: {
    prepare(sql) {
      counts.d1++;
      return {
        bind() {
          return this;
        },
        async first() {
          return sql.includes("AS identity_user_id")
            ? { ...user, identity_user_id: "fixture", identity_state: "active" }
            : sql.includes("SELECT user_id,state")
            ? { user_id: "fixture", state: "active" }
            : user;
        },
      };
    },
  },
};
const request = () =>
  new Request(origin + "/api/me", {
    headers: { authorization: "Bearer " + bearer },
  });
const { managedCurrent: original } = await import(
  pathToFileURL(resolve(".wrangler/profiling/baseline.mjs")).href
);
const { managedCurrent: optimized } = await import(
  pathToFileURL(resolve(".wrangler/profiling/clerk.mjs")).href
);
const inspector = new Session();
inspector.connect();
await inspector.post("Profiler.enable");
const results = [];
for (const [phase, handler] of [
  ["original-full-auth", original],
  ["optimized-full-auth", optimized],
]) {
  await handler(request(), env, "fixture@example.test");
  const before = { ...counts };
  await inspector.post("Profiler.start");
  const start = performance.now();
  for (let i = 0; i < 400; i++)
    await handler(request(), env, "fixture@example.test");
  const elapsed = performance.now() - start;
  const { profile } = await inspector.post("Profiler.stop");
  await fs.writeFile(
    ".wrangler/profiling/" + phase + ".cpuprofile",
    JSON.stringify(profile),
  );
  const hits = new Map();
  for (const id of profile.samples || []) hits.set(id, (hits.get(id) || 0) + 1);
  results.push({
    phase,
    iterations: 400,
    elapsedLocalMilliseconds: elapsed,
    providerChecks: {
      session: counts.session - before.session,
      profile: counts.profile - before.profile,
      d1Reads: counts.d1 - before.d1,
    },
    hot: profile.nodes
      .map((n) => ({
        function: n.callFrame.functionName || "(anonymous)",
        file: n.callFrame.url.split("/").slice(-2).join("/"),
        samples: hits.get(n.id) || 0,
      }))
      .sort((a, b) => b.samples - a.samples)
      .slice(0, 12),
  });
}
inspector.disconnect();
await fs.writeFile(
  ".wrangler/profiling/request-summary.json",
  JSON.stringify(results, null, 2),
);
console.log(
  JSON.stringify(
    {
      localOnly: true,
      syntheticProviderAndD1: true,
      realRSAVerification: true,
      results,
    },
    null,
    2,
  ),
);
