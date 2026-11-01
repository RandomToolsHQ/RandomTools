import { it, expect } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { execFileSync } from "node:child_process";

it("the managed-auth artifact permits Clerk Protect checks without enabling inline scripts or eval", async () => {
  const root = await mkdtemp(join(tmpdir(), "randomtools-csp-"));
  const absolute = resolve(root);
  if (
    dirname(absolute) !== resolve(tmpdir()) ||
    !absolute.split(/[\\/]/).pop()?.startsWith("randomtools-csp-")
  )
    throw Error("Unexpected temporary path");
  try {
    await mkdir(join(root, "dist"));
    await writeFile(
      join(root, "dist/_headers"),
      await readFile("public/_headers", "utf8"),
    );
    const key =
      "pk_test_" +
      Buffer.from("fixture.clerk.accounts.dev$").toString("base64");
    execFileSync(process.execPath, [resolve("scripts/hosting.mjs")], {
      cwd: root,
      stdio: "pipe",
      windowsHide: true,
      env: {
        ...process.env,
        VITE_CLERK_PUBLISHABLE_KEY: key,
        VITE_DEPLOYMENT_STAGE: "staging",
      },
    });
    const headers = await readFile(join(root, "dist/_headers"), "utf8");
    expect(headers).toContain(
      "script-src 'self' https://fixture.clerk.accounts.dev https://challenges.cloudflare.com https://*.protect.clerk.com;",
    );
    expect(headers).toContain("https://*.protect.clerk.com:*;");
    expect(headers).toContain(
      "frame-src https://challenges.cloudflare.com https://*.protect.clerk.com;",
    );
    expect(headers).toContain("object-src 'none';");
    expect(headers.match(/script-src[^;]+/)?.[0]).not.toMatch(
      /unsafe-inline|unsafe-eval/,
    );
    expect(() =>
      execFileSync(process.execPath, [resolve("scripts/hosting.mjs")], {
        cwd: root,
        stdio: "pipe",
        windowsHide: true,
        env: {
          ...process.env,
          VITE_CLERK_PUBLISHABLE_KEY: key,
          VITE_DEPLOYMENT_STAGE: "production",
        },
      }),
    ).toThrow();
  } finally {
    await rm(absolute, { recursive: true, force: true });
  }
});
