// Protected operator CLI only. Never imported by frontend/Worker deployment code.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes, createHash } from "node:crypto";
import { resolve } from "node:path";
import process from "node:process";
import console from "node:console";
import { createClerkClient } from "@clerk/backend";
import { build } from "esbuild";
import { Buffer } from "node:buffer";
/* global fetch */

const root = resolve(".wrangler/founder-bootstrap"),
  execute = promisify(execFile);
const issuer = "https://quiet-civet-8782.clerk.accounts.dev";
const args = process.argv.slice(2),
  option = (name) => args[args.indexOf(name) + 1];
const get = (name) => (args.includes(name) ? option(name) : undefined);
const canonical = (value) =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(value).sort(([a], [b]) => a.localeCompare(b)),
    ),
  );
const hash = (value) =>
  createHash("sha256").update(canonical(value)).digest("hex");
async function save(name, value) {
  await writeFile(root + "/" + name, JSON.stringify(value, null, 2));
}

async function main() {
  if (
    !["--prepare", "--apply"].some((a) => args.includes(a)) ||
    (args.includes("--prepare") && args.includes("--apply"))
  )
    throw Error(
      "Choose --prepare (read-only remote) or explicitly confirmed --apply",
    );
  await mkdir(root, { recursive: true });
  // Plan/receipt contain identity data but never API keys. Protect before writing.
  if (process.platform !== "win32")
    throw Error(
      "This operator workflow requires the reviewed Windows ACL protection",
    );
  const { stdout: sid } = await execute(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "[Security.Principal.WindowsIdentity]::GetCurrent().User.Value",
    ],
    { windowsHide: true },
  );
  await execute(
    "icacls.exe",
    [
      root,
      "/inheritance:r",
      "/grant:r",
      "*" + sid.trim() + ":(OI)(CI)F",
      "*S-1-5-18:(OI)(CI)F",
    ],
    { windowsHide: true },
  );
  let token;
  try {
    const { stdout: auth } = await execute(
      process.execPath,
      ["node_modules/wrangler/bin/wrangler.js", "auth", "token", "--json"],
      { windowsHide: true },
    );
    token = JSON.parse(auth).token;
    if (typeof token !== "string" || !token) throw Error("Missing OAuth");
  } catch {
    throw Error(
      "Cloudflare OAuth unavailable; authorize Wrangler before bootstrap",
    );
  }
  const line = (await readFile(".dev.vars.staging", "utf8"))
    .split(/\r?\n/)
    .find((l) => /^CLERK_SECRET_KEY=/.test(l));
  const secret = line
    ?.slice(line.indexOf("=") + 1)
    .trim()
    .replace(/^"|"$/g, "");
  if (!secret?.startsWith("sk_test_"))
    throw Error("Valid local Clerk development key required");
  const clerk = createClerkClient({
    secretKey: secret,
    telemetry: { disabled: true },
  });
  async function sql(query, params = []) {
    const r = await fetch(
      "https://api.cloudflare.com/client/v4/accounts/5c172e2e4c51cfc7dc512c96825b2912/d1/database/24d38e43-b765-4d21-b713-fce893d7317d/query",
      {
        method: "POST",
        headers: {
          authorization: "Bearer " + token,
          "content-type": "application/json",
        },
        body: JSON.stringify({ sql: query, params }),
      },
    );
    const d = await r.json();
    if (!r.ok || !d.success || d.result?.[0]?.success === false)
      throw Error(
        "Staging D1 operator operation failed; raw response suppressed",
      );
    return d.result[0].results;
  }
  async function identity(subject) {
    if (!/^user_[A-Za-z0-9]+$/.test(subject || ""))
      throw Error("An exact Clerk user ID is required");
    const p = await clerk.users.getUser(subject),
      email = p.emailAddresses.find((e) => e.id === p.primaryEmailAddressId);
    if (
      p.id !== subject ||
      p.banned ||
      p.locked ||
      email?.verification?.status !== "verified"
    )
      throw Error("Clerk account is not verified and enabled");
    const rows = await sql(
      "SELECT a.issuer,a.subject,a.state,u.* FROM auth_identities a JOIN users u ON u.id=a.user_id WHERE a.issuer=? AND a.subject=?",
      [issuer, subject],
    );
    if (
      rows.length !== 1 ||
      rows[0].state !== "active" ||
      rows[0].verified !== 1 ||
      rows[0].disabled !== 0 ||
      rows[0].email !== email.emailAddress.toLowerCase()
    )
      throw Error("Exact active D1 identity mapping required");
    return { row: rows[0], email: email.emailAddress };
  }
  if (args.includes("--prepare")) {
    const { row, email } = await identity(get("--subject"));
    if (
      row.role !== "free" ||
      (await sql("SELECT count(*) n FROM users WHERE role='admin'"))[0].n !== 0
    )
      throw Error("Expected first-admin bootstrap baseline changed");
    const plan = {
      subject: row.subject,
      issuer,
      userId: row.id,
      email,
      previousRole: "free",
      proposedRole: "admin",
      proAccess: "inherent-admin-no-expiry",
      operationId: "founder_bootstrap_" + randomBytes(16).toString("hex"),
      createdAt: Date.now(),
      expiresAt: Date.now() + 86400000,
      accountFingerprint: hash(row),
    };
    await save("plan.json", plan);
    console.log(
      JSON.stringify({
        prepared: true,
        remoteWrites: false,
        subject: plan.subject,
        userId: plan.userId,
        email,
        proposedRole: plan.proposedRole,
        proAccess: plan.proAccess,
        operationId: plan.operationId,
        expiresAt: new Date(plan.expiresAt).toISOString(),
      }),
    );
    return;
  }
  const plan = JSON.parse(await readFile(root + "/plan.json", "utf8"));
  if (
    get("--confirm-subject") !== plan.subject ||
    get("--confirm-user") !== plan.userId ||
    get("--confirm-operation") !== plan.operationId ||
    get("--confirm-permissions") !== "admin-with-inherent-pro"
  )
    throw Error(
      "Exact account, operation and permission confirmation required; no writes",
    );
  if (plan.expiresAt <= Date.now() || plan.createdAt > Date.now())
    throw Error("Bootstrap plan expired; prepare and confirm again");
  const { row, email } = await identity(plan.subject);
  const existing = await sql("SELECT * FROM audit_logs WHERE id=?", [
    plan.operationId,
  ]);
  if (existing.length) {
    if (row.role === "admin" && existing[0].target_id === plan.userId) {
      console.log(
        JSON.stringify({
          alreadyApplied: true,
          subject: plan.subject,
          auditId: plan.operationId,
        }),
      );
      return;
    }
    throw Error("Bootstrap operation already consumed");
  }
  if (
    row.id !== plan.userId ||
    email !== plan.email ||
    row.role !== "free" ||
    hash(row) !== plan.accountFingerprint
  )
    throw Error(
      "Confirmed account baseline changed; prepare and confirm again",
    );
  const bundle = await build({
    entryPoints: ["scripts/admin-bootstrap-sql.ts"],
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
  });
  const { bootstrapStatements } = await import(
    "data:text/javascript;base64," +
      Buffer.from(bundle.outputFiles[0].text).toString("base64")
  );
  const s = bootstrapStatements(plan);
  await sql(s.create);
  let applied;
  try {
    applied = await sql(s.update, s.params);
  } finally {
    await sql(s.drop);
  }
  if (applied.length !== 1)
    throw Error(
      "No promotion applied; identity or administrator baseline changed",
    );
  const after = await identity(plan.subject),
    audit = await sql("SELECT * FROM audit_logs WHERE id=?", [
      plan.operationId,
    ]),
    triggers = await sql(
      "SELECT name FROM sqlite_master WHERE type='trigger' AND name=?",
      [plan.operationId],
    );
  const expected = { ...row, role: "admin" };
  if (
    hash(after.row) !== hash(expected) ||
    audit.length !== 1 ||
    audit[0].action !== "admin.bootstrap.founder" ||
    audit[0].actor_id !== plan.userId ||
    audit[0].target_id !== plan.userId ||
    triggers.length
  )
    throw Error(
      "Post-bootstrap verification failed; inspect protected records before retry",
    );
  const receipt = {
    time: new Date().toISOString(),
    subject: plan.subject,
    userId: plan.userId,
    role: "admin",
    pro: true,
    expiresAt: null,
    auditId: plan.operationId,
    auditVerified: true,
    temporaryTriggerRemoved: true,
    otherAccountFieldsUnchanged: true,
  };
  await save("receipt.json", receipt);
  console.log(JSON.stringify(receipt));
}
main().catch((e) => {
  console.error(
    JSON.stringify({
      error: e.status
        ? "Provider operation failed (HTTP " + e.status + ")"
        : e.message,
    }),
  );
  process.exitCode = 1;
});
