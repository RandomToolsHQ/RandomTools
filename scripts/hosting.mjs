import { readFile, writeFile } from "node:fs/promises";
import process from "node:process";
import { Buffer } from "node:buffer";
const key = process.env.VITE_CLERK_PUBLISHABLE_KEY;
if (key) {
  if (
    process.env.VITE_DEPLOYMENT_STAGE === "production" &&
    !key.startsWith("pk_live_")
  )
    throw Error("Production must not use a development Clerk instance");
  const host = Buffer.from(key.replace(/^pk_(test|live)_/, ""), "base64")
    .toString()
    .replace(/\$$/, "");
  if (!/^[a-z0-9.-]+$/.test(host) || !host.includes("."))
    throw Error("Invalid Clerk frontend host");
  let headers = await readFile("dist/_headers", "utf8");
  headers = headers
    .replace(
      "script-src 'self';",
      `script-src 'self' https://${host} https://challenges.cloudflare.com https://*.protect.clerk.com;`,
    )
    .replace(
      "connect-src 'self' https://api.mcstatus.io;",
      `connect-src 'self' https://api.mcstatus.io https://${host} https://clerk-telemetry.com https://*.protect.clerk.com:*;`,
    )
    .replace(
      "img-src 'self' data: blob:;",
      "img-src 'self' data: blob: https://img.clerk.com;",
    )
    .replace(
      "object-src 'none';",
      "frame-src https://challenges.cloudflare.com https://*.protect.clerk.com; object-src 'none';",
    );
  await writeFile("dist/_headers", headers);
}
