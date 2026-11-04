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
delete globalThis.Deno;
