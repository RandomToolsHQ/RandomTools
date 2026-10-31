import { spawn } from "node:child_process";
import process from "node:process";
import { resolve } from "node:path";
import { mkdir, mkdtemp } from "node:fs/promises";
const mode = process.argv[2];
if (mode === "frontend") {
  process.env.API_PROXY_TARGET = "http://127.0.0.1:8788";
  const { createServer } = await import("vite");
  const server = await createServer({
    server: { host: "127.0.0.1", port: 5180, strictPort: true },
  });
  await server.listen();
  server.printUrls();
} else if (mode === "api") {
  await mkdir(".wrangler", { recursive: true });
  const state = await mkdtemp(resolve(".wrangler/e2e-"));
  let child;
  const run = (args) =>
    new Promise((resolveRun, reject) => {
      child = spawn(
        process.execPath,
        [resolve("node_modules/wrangler/bin/wrangler.js"), ...args],
        { stdio: "inherit", windowsHide: true },
      );
      child.once("error", reject);
      child.once("exit", (code) =>
        code === 0
          ? resolveRun()
          : reject(Error("E2E API process exited with " + code)),
      );
    });
  process.once("exit", () => child?.kill());
  const shared = ["--config", "wrangler.test.toml", "--persist-to", state];
  await run([
    "d1",
    "migrations",
    "apply",
    "randomtools-test",
    "--local",
    ...shared,
  ]);
  await run([
    "dev",
    "--port",
    "8788",
    ...shared,
    "--var",
    "ENVIRONMENT:development",
    "--var",
    "EMAIL_PROVIDER:development",
    "--var",
    "PAYMENTS_ENABLED:false",
    "--var",
    "APP_ORIGIN:http://localhost:5180",
  ]);
} else throw Error("Choose frontend or api");
