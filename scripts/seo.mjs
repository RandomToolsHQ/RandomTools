import { readFile, writeFile, mkdir } from "node:fs/promises";
import { build } from "esbuild";
import { loadEnv } from "vite";
import process from "node:process";
import { URL } from "node:url";
import { Buffer } from "node:buffer";
const bundle = await build({
  entryPoints: ["src/catalog.ts"],
  bundle: true,
  format: "esm",
  write: false,
  platform: "node",
});
const { tools } = await import(
  "data:text/javascript;base64," +
    Buffer.from(bundle.outputFiles[0].text).toString("base64")
);
const env = loadEnv("production", process.cwd(), "VITE_");
const origin = process.env.VITE_SITE_URL || env.VITE_SITE_URL;
if (origin) {
  const url = new URL(origin);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  )
    throw Error(
      "VITE_SITE_URL must be an owned HTTPS origin without credentials, path, query or fragment",
    );
}
const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const routes = [
  {
    path: "/",
    title: "Your everyday toolkit",
    description:
      "Useful browser tools for developers, creators and the everyday curious. Format, convert, create and simplify.",
  },
  {
    path: "/tools",
    title: "Explore the toolbox",
    description:
      "Browse all free RandomTools utilities. Local browser processing, useful results and no account required.",
  },
  {
    path: "/pro",
    title: "RandomTools Pro",
    description:
      "Explore batch processing, saved presets and private workflows. Pro access is manually approved; payments are disabled.",
  },
  {
    path: "/privacy",
    title: "Privacy policy",
    description:
      "Learn how RandomTools processes browser inputs, account information and explicitly saved workspace data.",
  },
  {
    path: "/terms",
    title: "Terms of service",
    description:
      "Read the terms for using RandomTools utilities and memberships.",
  },
  {
    path: "/contact",
    title: "Contact RandomTools HQ",
    description:
      "Contact randomtoolshq@gmail.com for support, privacy requests, feedback and bug reports.",
  },
  ...tools.map((t) => ({
    path: "/tools/" + t.id,
    title: t.name,
    description:
      t.description +
      " Free to use, with local browser processing and no account required.",
  })),
];
const template = await readFile("dist/index.html", "utf8");
for (const route of routes) {
  const url = origin ? new URL(route.path, origin).href : undefined;
  const title = route.title + " · RandomTools HQ";
  let html = template
    .replace(/<title>[^<]*<\/title>/, `<title>${escape(title)}</title>`)
    .replace(
      /(<meta name="description" content=")[^"]*("\s*\/?>)/,
      `$1${escape(route.description)}$2`,
    )
    .replace(
      /(<meta property="og:title" content=")[^"]*("\s*\/?>)/,
      `$1${escape(title)}$2`,
    )
    .replace(
      /(<meta property="og:description" content=")[^"]*("\s*\/?>)/,
      `$1${escape(route.description)}$2`,
    );
  if (url) {
    const structured = {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: route.title,
      url,
      description: route.description,
      applicationCategory: "UtilitiesApplication",
      operatingSystem: "Web browser",
      ...(route.path.startsWith("/tools/")
        ? { offers: { "@type": "Offer", price: "0", priceCurrency: "AUD" } }
        : {}),
    };
    html = html.replace(
      "</head>",
      `<link rel="canonical" href="${escape(url)}"/><meta property="og:url" content="${escape(url)}"/><script type="application/ld+json">${JSON.stringify(structured).replaceAll("<", "\\u003c")}</script></head>`,
    );
  }
  const directoryLinks =
    route.path === "/" || route.path === "/tools"
      ? `<ul>${tools.map((t) => `<li><a href="/tools/${t.id}">${escape(t.name)}</a> — ${escape(t.description)}</li>`).join("")}</ul>`
      : "";
  html = html.replace(
    '<div id="root"></div>',
    `<div id="root"><main class="wrap text-page"><h1>${escape(route.title)}</h1><p>${escape(route.description)}</p>${directoryLinks}<p><a href="/tools">Explore all tools</a></p><noscript>Enable JavaScript to process inputs locally in your browser.</noscript></main></div>`,
  );
  const directory = "dist" + (route.path === "/" ? "" : route.path);
  await mkdir(directory, { recursive: true });
  await writeFile(directory + "/index.html", html);
}
// Private and token-bearing pages must not be indexed, including when JavaScript is disabled.
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
  await mkdir("dist/" + path, { recursive: true });
  await writeFile(
    "dist/" + path + "/index.html",
    template.replace(
      "</head>",
      '<meta name="robots" content="noindex,nofollow"/></head>',
    ),
  );
}
if (origin) {
  await writeFile(
    "dist/sitemap.xml",
    '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      routes
        .map(
          (r) =>
            "<url><loc>" +
            escape(new URL(r.path, origin).href) +
            "</loc></url>",
        )
        .join("") +
      "</urlset>",
  );
  await writeFile(
    "dist/robots.txt",
    (await readFile("public/robots.txt", "utf8")).trim() +
      "\nSitemap: " +
      new URL("/sitemap.xml", origin).href +
      "\n",
  );
}
process.stdout.write(
  `Generated ${routes.length} static public pages; ${origin ? "canonical URLs, structured data and sitemap enabled" : "set VITE_SITE_URL to add canonical URLs and sitemap"}.\n`,
);
