// Bounded realtime-log observer. Never persists raw traces, headers, cookies,
// tokens, request bodies, exceptions or console messages. Creates no Tail Worker.
import { spawn } from "node:child_process";
import fs from "node:fs";
import process from "node:process";
import console from "node:console";
import { resolve } from "node:path";
import { URL } from "node:url";
import {
  setTimeout,
  setInterval,
  clearTimeout,
  clearInterval,
} from "node:timers";

const root = resolve(".wrangler/phase9");
const output = resolve(root, "tail-cpu.json");
const stop = resolve(root, "tail-stop");
if (fs.existsSync(stop)) fs.unlinkSync(stop);
const report = {
  script: "randomtools-firebase-poc-api",
  startedAt: new Date().toISOString(),
  unit: "milliseconds",
  connected: false,
  events: [],
  discardedRawData: true,
};
const write = () =>
  fs.writeFileSync(output, JSON.stringify(report, null, 2), { mode: 0o600 });
write();
const child = spawn(
  process.execPath,
  [
    resolve("node_modules/wrangler/bin/wrangler.js"),
    "tail",
    "randomtools-firebase-poc-api",
    "--config",
    resolve(root, "wrangler.toml"),
    "--format",
    "json",
  ],
  { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
);
let buffer = "",
  done = false;
function event(value) {
  if (value.scriptName !== report.script || !value.event?.request?.url) return;
  let path;
  try {
    path = new URL(value.event.request.url).pathname;
  } catch {
    return;
  }
  if (!path.startsWith("/api/")) return;
  report.connected = true;
  if (report.events.length >= 500) return;
  report.events.push({
    version: value.scriptVersion?.id || null,
    timestamp: value.eventTimestamp,
    path,
    status: value.event.response?.status ?? null,
    outcome: value.outcome,
    cpuMs: Number.isFinite(value.cpuTime) ? value.cpuTime : null,
    wallMs: Number.isFinite(value.wallTime) ? value.wallTime : null,
    truncated: value.truncated === true,
  });
  write();
}
function consume(chunk) {
  if (/Connected to|Successfully created tail/i.test(chunk.toString())) {
    report.connected = true;
    write();
  }
  buffer += chunk.toString();
  if (buffer.length > 1048576) {
    buffer = "";
    return;
  }
  let start = -1,
    depth = 0,
    quoted = false,
    escaped = false,
    consumed = 0;
  for (let i = 0; i < buffer.length; i++) {
    const c = buffer[i];
    if (start === -1) {
      if (c === "{") {
        start = i;
        depth = 1;
      }
      continue;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === '"') quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === "{") depth++;
    else if (c === "}") {
      if (--depth === 0) {
        try {
          event(JSON.parse(buffer.slice(start, i + 1)));
        } catch {
          /* Never log raw input. */
        }
        consumed = i + 1;
        start = -1;
      }
    }
  }
  if (consumed) buffer = buffer.slice(consumed);
  else if (start > 0) buffer = buffer.slice(start);
}
child.stdout.on("data", consume);
child.stderr.on("data", (chunk) => {
  if (/Connected|Successfully created tail/i.test(chunk.toString())) {
    report.connected = true;
    write();
  }
  // All other CLI output is deliberately discarded; it is not CPU evidence.
});
function finish(code = 0) {
  if (done) return;
  done = true;
  clearTimeout(deadline);
  clearInterval(poll);
  child.kill();
  buffer = "";
  report.endedAt = new Date().toISOString();
  report.exitCode = code;
  write();
  console.log(
    JSON.stringify({
      realtimeObserverEnded: true,
      events: report.events.length,
      cpuMeasurements: report.events.filter((e) => e.cpuMs !== null).length,
      code,
    }),
  );
}
child.once("error", () => finish(1));
child.once("exit", (code) => finish(code ?? 0));
const deadline = setTimeout(() => finish(), 600000);
const poll = setInterval(() => {
  if (fs.existsSync(stop)) finish();
}, 1000);
process.once("SIGINT", () => finish());
