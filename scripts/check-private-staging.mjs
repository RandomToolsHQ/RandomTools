import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import console from "node:console";
/* global fetch, URL, URLSearchParams */

// Explicit opt-in: reads only an ignored local gateway credential file.
// Never logs response bodies, cookies, credentials or tester identifiers.
const origin = "https://randomtools-web-staging.pages.dev";
const results = [];
function check(name, passed, status) {
  results.push({ name, passed: !!passed, status });
}
for (const path of [
  "/",
  "/login",
  "/register",
  "/admin",
  "/assets/private.js",
  "/api/me",
  "/api/admin",
  "/api/pro/presets",
  "/api/pro-access",
  "/api/pro-access/requests",
  "/api/admin/pro-access",
  "/api/webhooks/kofi",
]) {
  const response = await fetch(origin + path, { redirect: "manual" });
  check("anonymous denial: " + path, response.status === 403, response.status);
}
const gate = await fetch(origin + "/__staging");
check(
  "public gateway has no account SDK",
  gate.status === 200 &&
    !/<script|accounts\.dev|pk_test_/.test(await gate.text()),
  gate.status,
);
const unsigned = await fetch(origin + "/api/webhooks/clerk", {
  method: "POST",
  body: "{}",
});
check("unsigned deletion rejected", unsigned.status === 401, unsigned.status);
if (process.env.PRIVATE_GATE_CREDENTIAL_FILE) {
  const credentials = JSON.parse(
    await readFile(process.env.PRIVATE_GATE_CREDENTIAL_FILE, "utf8"),
  );
  const login = await fetch(origin + "/__staging", {
    method: "POST",
    redirect: "manual",
    headers: { origin, "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      email: credentials.email,
      key: credentials.raw,
    }),
  });
  check("named gateway login", login.status === 303, login.status);
  const setCookie = login.headers.get("set-cookie") || "";
  check(
    "bounded host-only cookie",
    /^__Host-rt_staging=/.test(setCookie) &&
      /Secure; HttpOnly; SameSite=Lax; Max-Age=1800/.test(setCookie) &&
      !setCookie.includes("Domain="),
    login.status,
  );
  const cookie = setCookie.split(";")[0];
  for (const path of ["/", "/login/", "/register/"]) {
    const response = await fetch(origin + path, {
      headers: { cookie },
      redirect: "manual",
    });
    check(
      "authorized asset: " + path,
      response.status === 200,
      response.status,
    );
    check(
      "asset CSP and private caching: " + path,
      !!response.headers
        .get("content-security-policy")
        ?.includes("quiet-civet-8782.clerk.accounts.dev") &&
        !!response.headers
          .get("content-security-policy")
          ?.includes("https://*.protect.clerk.com:*") &&
        response.headers.get("cache-control") === "private, no-store",
      response.status,
    );
  }
  const response = await fetch(origin + "/api/me", { headers: { cookie } });
  const me = await response.json();
  check(
    "gateway alone grants no account",
    response.status === 200 && me.user === null && me.pro === false,
    response.status,
  );
  for (const path of [
    "/api/admin",
    "/api/pro/presets",
    "/api/pro-access",
    "/api/admin/pro-access",
  ]) {
    const response = await fetch(origin + path, { headers: { cookie } });
    check("Clerk required: " + path, response.status === 401, response.status);
  }
  const payment = await fetch(origin + "/api/webhooks/kofi", {
    method: "POST",
    headers: { cookie },
    body: "{}",
  });
  check("live payments disabled", payment.status === 404, payment.status);
  if (process.env.PRIVATE_IMMUTABLE_URL) {
    const immutable = new URL(process.env.PRIVATE_IMMUTABLE_URL);
    if (
      immutable.protocol !== "https:" ||
      !immutable.hostname.endsWith(".randomtools-web-staging.pages.dev")
    )
      throw Error("Unexpected immutable hostname");
    for (const path of ["/login/", "/assets/private.js", "/api/me"]) {
      const response = await fetch(immutable.origin + path, {
        headers: { cookie },
        redirect: "manual",
      });
      check(
        "immutable origin denied: " + path,
        response.status === 403,
        response.status,
      );
    }
  }
  const crossOrigin = await fetch(origin + "/__staging/logout", {
    method: "POST",
    headers: {
      cookie,
      origin: "https://example.invalid",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "",
    redirect: "manual",
  });
  check(
    "cross-origin logout rejected",
    crossOrigin.status === 403,
    crossOrigin.status,
  );
  const logout = await fetch(origin + "/__staging/logout", {
    method: "POST",
    headers: {
      cookie,
      origin,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: "",
    redirect: "manual",
  });
  check(
    "logout clears host cookie",
    logout.status === 303 &&
      !!logout.headers.get("set-cookie")?.includes("Max-Age=0"),
    logout.status,
  );
}
const report = { time: new Date().toISOString(), results };
await writeFile(
  ".wrangler/phase3-hosted-private-report.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
if (results.some((result) => !result.passed)) process.exitCode = 1;
