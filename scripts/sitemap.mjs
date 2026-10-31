import { writeFile } from "node:fs/promises";
import process from "node:process";
import { URL } from "node:url";
const origin = process.env.VITE_SITE_URL;
if (origin) {
  const url = new URL(origin);
  if (url.protocol !== "https:") throw Error("VITE_SITE_URL must use HTTPS");
  const ids = [
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
  ];
  const paths = [
    "/",
    "/tools",
    "/pro",
    "/contact",
    "/privacy",
    "/terms",
    ...ids.map((id) => "/tools/" + id),
  ];
  await writeFile(
    "dist/sitemap.xml",
    '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' +
      paths
        .map(
          (p) =>
            "<url><loc>" +
            new URL(p, url).href.replaceAll("&", "&amp;") +
            "</loc></url>",
        )
        .join("") +
      "</urlset>",
  );
} else
  process.stdout.write(
    "Sitemap omitted: configure VITE_SITE_URL with the owned production origin.\n",
  );
