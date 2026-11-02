import { readFile, access } from "node:fs/promises";
import process from "node:process";
import { URL } from "node:url";
const origin = process.argv[2];
const paths = [
  "/",
  "/tools",
  "/pro",
  "/privacy",
  "/terms",
  "/contact",
  ...[
    "json",
    "base64",
    "url",
    "unix",
    "uuid",
    "diff",
    "regex",
    "html",
    "password",
    "qr",
    "counter",
    "case",
    "colour",
    "random",
    "image",
    "hash",
    "discord",
    "snowflake",
    "minecraft",
    "roblox-usernames",
    "test-identities",
  ].map((id) => "/tools/" + id),
];
const titles = new Set();
for (const path of paths) {
  const html = await readFile(
    "dist" + (path === "/" ? "" : path) + "/index.html",
    "utf8",
  );
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  if (!title || titles.has(title))
    throw Error("Missing or duplicate title: " + path);
  titles.add(title);
  if (!html.includes("<h1>") || !html.includes("<noscript>"))
    throw Error("Missing static fallback content: " + path);
  if (path === "/tools/json" && !html.includes("<h1>JSON formatter</h1>"))
    throw Error("Incorrect tool fallback content");
  if (origin) {
    const canonical = new URL(path, origin).href;
    if (!html.includes(`rel="canonical" href="${canonical}"`))
      throw Error("Incorrect canonical: " + path);
    const data = html.match(
      /<script type="application\/ld\+json">([^<]+)<\/script>/,
    )?.[1];
    if (!data || JSON.parse(data).url !== canonical)
      throw Error("Missing structured data: " + path);
  } else if (html.includes('rel="canonical"'))
    throw Error("Unconfigured canonical URL was invented");
}
for (const path of [
  "login",
  "register",
  "forgot-password",
  "reset-password",
  "verify-email",
  "resend-verification",
  "dashboard",
  "settings",
  "subscription",
  "admin",
]) {
  const html = await readFile(`dist/${path}/index.html`, "utf8");
  if (!html.includes("noindex,nofollow"))
    throw Error("Missing noindex on " + path);
}
if (origin) {
  const sitemap = await readFile("dist/sitemap.xml", "utf8");
  if (
    (sitemap.match(/<url>/g) || []).length !== paths.length ||
    sitemap.includes("/dashboard")
  )
    throw Error("Unexpected sitemap content");
  if (
    !(await readFile("dist/robots.txt", "utf8")).includes(
      "Sitemap: " + new URL("/sitemap.xml", origin).href,
    )
  )
    throw Error("Missing robots sitemap link");
} else {
  try {
    await access("dist/sitemap.xml");
    throw Error("Unconfigured sitemap exists");
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}
process.stdout.write(
  `SEO checks passed for ${paths.length} public and 10 private pages (${origin ? "configured origin" : "no invented origin"}).\n`,
);
