// Execute the emitted Deno entry in a restricted local test host, no network.
/* global Request */
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
let handler;
globalThis.Deno = {
  env: { get: () => undefined },
  serve: (value) => {
    handler = value;
  },
};
await import(
  pathToFileURL(
    resolve(
      ".wrangler/phase11/supabase/functions/randomtools-phase11/index.js",
    ),
  )
);
assert.equal(typeof handler, "function");
const r = await handler(
  new Request("https://synthetic.invalid", {
    method: "POST",
    headers: {
      origin: "http://127.0.0.1:54381",
      "content-type": "application/json",
    },
    body: '{"operation":"me"}',
  }),
);
assert.equal(r.status, 503);
assert.match(r.headers.get("cache-control"), /no-store/);
assert.equal(r.headers.get("access-control-allow-origin"), null);
assert.equal(await r.text(), '{"error":"Dependency unavailable"}');
// Custom secrets cannot use Supabase's reserved SUPABASE_ prefix. Verify the
// deployable POC_* configuration reaches the gate without making network calls.
const values = {
  POC_ENABLED: "phase11-synthetic-only",
  POC_PROJECT_REF: "a".repeat(20),
  POC_ORIGIN: "http://127.0.0.1:54381",
  POC_ACCESS_KEY: "b".repeat(64),
  FIREBASE_PROJECT_ID: "randomtools-supabase-auth-poc",
  FIREBASE_WEB_API_KEY: "synthetic-public",
  POC_RATE_SECRET: "r".repeat(32),
  POC_TESTERS: JSON.stringify({
    member: "phase11-00000000-member@example.com",
  }),
  SUPABASE_SERVICE_ROLE_KEY: "synthetic-runtime-key",
  POC_TEST_EXPIRES_AT: String(Math.floor(Date.now() / 1000) + 3600),
};
globalThis.Deno.env.get = (name) => values[name];
await import(
  pathToFileURL(
    resolve(
      ".wrangler/phase11/supabase/functions/randomtools-phase11/index.js",
    ),
  ).href + "?configured"
);
const configured = await handler(
  new Request("https://synthetic.invalid", {
    method: "POST",
    headers: {
      origin: values.POC_ORIGIN,
      "content-type": "application/json",
      "x-poc-access": "wrong",
    },
    body: '{"operation":"me"}',
  }),
);
assert.equal(configured.status, 403);
delete globalThis.Deno;
