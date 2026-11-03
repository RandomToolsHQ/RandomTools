import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { resolve, delimiter } from "node:path";
import process from "node:process";
import console from "node:console";
const candidates = [
  resolve(
    ".wrangler/firebase-cli/node_modules/firebase-tools/lib/bin/firebase.js",
  ),
  ...(process.env.PATH || "")
    .split(delimiter)
    .map((p) => resolve(p, "../firebase-tools/lib/bin/firebase.js")),
];
const cli = candidates.find((p) => existsSync(p));
if (!cli)
  throw Error(
    "Run with npm exec --package firebase-tools@15.34.2 -- node scripts/firebase-poc-emulator.mjs",
  );
try {
  const { stdout } = await promisify(execFile)(
    process.execPath,
    [
      cli,
      "emulators:exec",
      "--only",
      "auth",
      "--project",
      "demo-randomtools-poc",
      "--config",
      "experiments/firebase/emulator.json",
      "node scripts/firebase-poc-lifecycle.mjs",
    ],
    { windowsHide: true, maxBuffer: 4 * 1024 * 1024, timeout: 120000 },
  );
  const line = stdout
    .split(/\r?\n/)
    .find((s) => s.startsWith('{"provider":"Firebase Auth Emulator"'));
  if (!line) throw Error("Lifecycle evidence missing");
  const report = JSON.parse(line);
  if (report.passed !== 5) throw Error("Lifecycle tests failed");
  console.log(JSON.stringify(report));
} catch {
  throw Error(
    "Local Firebase lifecycle failed; raw emulator output suppressed to avoid exposing test recovery links",
  );
}
