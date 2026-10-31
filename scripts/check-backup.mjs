// Exercises the real Wrangler SQL exporter with synthetic, isolated local data.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import process from "node:process";
const execute = promisify(execFile);
await mkdir(".wrangler", { recursive: true });
const root = await mkdtemp(resolve(".wrangler/backup-check-"));
const source = join(root, "source"),
  restore = join(root, "restore");
for (const directory of [source, restore]) {
  await mkdir(directory);
  await writeFile(
    join(directory, "wrangler.toml"),
    `name = "randomtools-backup-fixture"\ncompatibility_date = "2026-10-01"\n[[d1_databases]]\nbinding = "DB"\ndatabase_name = "backup-fixture"\ndatabase_id = "00000000-0000-0000-0000-000000000002"\nmigrations_dir = ${JSON.stringify(resolve("migrations").replaceAll("\\", "/"))}\n`,
  );
}
const run = async (directory, args) => {
  const { stdout } = await execute(
    process.execPath,
    [
      resolve("node_modules/wrangler/bin/wrangler.js"),
      "d1",
      ...args,
      "--local",
      "--config",
      join(directory, "wrangler.toml"),
    ],
    { windowsHide: true, maxBuffer: 10 * 1024 * 1024 },
  );
  return stdout;
};
await run(source, ["migrations", "apply", "backup-fixture"]);
const fixture = join(root, "fixture.sql");
await writeFile(
  fixture,
  `INSERT INTO users VALUES('backup-fixture','backup@example.test','O''Brien','synthetic-not-a-password','free',1,0,1);
INSERT INTO user_preferences VALUES('backup-fixture','{"theme":"light","favorites":["json"]}',7);
INSERT INTO saved_presets VALUES('preset','backup-fixture','workflow','Saved workflow','{"steps":["trim","lower"]}',1);
INSERT INTO tool_history VALUES('history','backup-fixture','case','Private fixture output',1);
INSERT INTO auth_identities VALUES('https://backup.clerk.accounts.dev','user_backup','backup-fixture','active',1);`,
);
await run(source, ["execute", "backup-fixture", "--file", fixture]);
const backup = join(root, "export.sql");
await run(source, ["export", "backup-fixture", "--output", backup]);
await run(restore, ["execute", "backup-fixture", "--file", backup]);
const query = async (sql) =>
  JSON.parse(
    await run(restore, [
      "execute",
      "backup-fixture",
      "--command",
      sql,
      "--json",
    ]),
  );
const account = await query(
  "SELECT email,name FROM users WHERE id='backup-fixture'",
);
if (account[0].results[0]?.name !== "O'Brien")
  throw Error("Restored profile differs");
const preset = await query(
  "SELECT data FROM saved_presets WHERE user_id='backup-fixture'",
);
if (
  JSON.parse(preset[0].results[0]?.data || "{}").steps?.join(",") !==
  "trim,lower"
)
  throw Error("Restored workflow differs");
const integrity = await query("PRAGMA foreign_key_check");
const identity = await query(
  "SELECT user_id,state FROM auth_identities WHERE subject='user_backup'",
);
if (
  identity[0].results[0]?.user_id !== "backup-fixture" ||
  identity[0].results[0]?.state !== "active"
)
  throw Error("Restored immutable identity mapping differs");
if (integrity.some((result) => result.results.length))
  throw Error("Restored foreign keys are invalid");
await query("DELETE FROM users WHERE id='backup-fixture'");
const cascades = await query(
  "SELECT (SELECT count(*) FROM saved_presets)+(SELECT count(*) FROM tool_history)+(SELECT count(*) FROM user_preferences) AS remaining",
);
if (cascades[0].results[0]?.remaining !== 0)
  throw Error("Restored deletion constraints failed");
const tombstone = await query(
  "SELECT user_id FROM auth_identities WHERE subject='user_backup'",
);
if (
  tombstone[0].results.length !== 1 ||
  tombstone[0].results[0].user_id !== null
)
  throw Error("Restored identity deletion guard was lost");
process.stdout.write(
  "Local Wrangler backup/restore passed: profile, workflow, foreign keys and account deletion.\nSynthetic artifacts: " +
    root +
    "\n",
);
