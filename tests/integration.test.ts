import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { build } from "esbuild";
import { readFile, readdir } from "node:fs/promises";
import worker from "../worker/index";
import { digest } from "../worker/security";
let mf: Miniflare;
let db: Awaited<ReturnType<Miniflare["getD1Database"]>>;
let serial = 1;
async function request(
  path: string,
  body?: unknown,
  cookie?: string,
  method?: string,
) {
  return mf.dispatchFetch("http://localhost/api" + path, {
    method: method || (body ? "POST" : "GET"),
    headers: {
      origin: "http://localhost:5173",
      "content-type": "application/json",
      "CF-Connecting-IP": "192.0.2." + serial++,
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}
async function account(label: string) {
  const email = label + "@example.test",
    password = "correct horse battery staple";
  const register = await request("/auth/register", {
    email,
    password,
    name: label,
  });
  expect(register.status).toBe(201);
  const data = (await register.json()) as any;
  expect(data.delivery).toContain("no email sent");
  const raw = new URL(data.developmentLink).searchParams.get("token");
  expect((await request("/auth/login", { email, password })).status).toBe(401);
  expect(
    (await request("/auth/verify-email", { token: raw, password })).status,
  ).toBe(200);
  expect(
    (await request("/auth/verify-email", { token: raw, password })).status,
  ).toBe(400);
  const login = await request("/auth/login", { email, password });
  expect(login.status).toBe(200);
  const cookie = login.headers.get("set-cookie")!.split(";")[0];
  expect(login.headers.get("set-cookie")).toContain("HttpOnly");
  const me = (await (await request("/me", undefined, cookie)).json()) as any;
  return { email, password, cookie, id: me.user.id };
}
beforeAll(async () => {
  const bundled = await build({
    entryPoints: ["worker/index.ts"],
    bundle: true,
    format: "esm",
    write: false,
    target: "es2022",
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundled.outputFiles[0].text,
      compatibilityDate: "2026-10-01",
      d1Databases: ["DB"],
      bindings: {
        APP_ORIGIN: "http://localhost:5173",
        ENVIRONMENT: "development",
        PAYMENTS_ENABLED: "true",
        KOFI_VERIFICATION_TOKEN: "test-only-not-a-real-secret",
      },
      cf: false,
    }),
  );
  db = await mf.getD1Database("DB");
  for (const migration of (await readdir("migrations"))
    .filter((name) => name.endsWith(".sql"))
    .sort()) {
    await db.exec(await readFile("migrations/" + migration, "utf8"));
  }
}, 60000);
afterAll(async () => {
  await mf?.dispose();
});
describe("Worker + real local D1", () => {
  it("lets the verified mailbox owner replace pre-activation credentials", async () => {
    const email = "activation-owner@example.test";
    const signup = await request("/auth/register", {
      email,
      name: "Unverified registration",
      password: "pre-registration password",
    });
    const data = (await signup.json()) as any;
    const token = new URL(data.developmentLink).searchParams.get("token");
    expect(
      (
        await request("/auth/verify-email", {
          token,
          password: "mailbox owner chosen password",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await request("/auth/login", {
          email,
          password: "pre-registration password",
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await request("/auth/login", {
          email,
          password: "mailbox owner chosen password",
        })
      ).status,
    ).toBe(200);
  }, 60000);
  it("delivers production email only through a mocked provider, hides account existence and records failures", async () => {
    const provider = vi
      .fn()
      .mockResolvedValue(Response.json({ id: "mock-provider-message" }));
    vi.stubGlobal("fetch", provider);
    const env = {
      DB: db,
      APP_ORIGIN: "https://app.example.test",
      ENVIRONMENT: "production",
      PAYMENTS_ENABLED: "false",
      RATE_LIMIT_SECRET: "test-only-rate-secret-".repeat(3),
      EMAIL_PROVIDER: "resend",
      EMAIL_FROM: "sender@example.test",
      RESEND_API_KEY: "test-only-not-a-real-key",
    };
    const pending: Promise<unknown>[] = [];
    const ctx = {
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    } as any;
    const call = (path: string, body: unknown) =>
      worker.fetch(
        new Request("https://app.example.test/api" + path, {
          method: "POST",
          headers: {
            origin: env.APP_ORIGIN,
            "content-type": "application/json",
            "CF-Connecting-IP": "203.0.113.17",
          },
          body: JSON.stringify(body),
        }),
        env,
        ctx,
      );
    try {
      const body = {
        email: "production-fixture@example.test",
        name: "Production fixture",
        password: "a production testing password",
      };
      const created = await call("/auth/register", body);
      const createdBody = await created.json();
      expect(created.status).toBe(201);
      expect(createdBody).not.toHaveProperty("developmentLink");
      await Promise.all(pending.splice(0));
      expect(provider).toHaveBeenCalledTimes(1);
      const sent = JSON.parse(provider.mock.calls[0][1].body);
      expect(sent.text).toContain(
        "https://app.example.test/verify-email?token=",
      );
      await db
        .prepare("UPDATE users SET verified=1 WHERE email=?")
        .bind(body.email)
        .run();
      const existing = await call("/auth/register", body);
      expect(existing.status).toBe(201);
      expect(await existing.json()).toEqual(createdBody);
      const known = await call("/auth/forgot-password", { email: body.email });
      const unknown = await call("/auth/forgot-password", {
        email: "absent@example.test",
      });
      expect(known.status).toBe(unknown.status);
      expect(await known.json()).toEqual(await unknown.json());
      await Promise.all(pending.splice(0));
      provider.mockRejectedValue(Error("sensitive provider failure"));
      const failure = await call("/auth/forgot-password", {
        email: body.email,
      });
      expect(failure.status).toBe(200);
      await Promise.all(pending.splice(0));
      const user = await db
        .prepare("SELECT id FROM users WHERE email=?")
        .bind(body.email)
        .first<{ id: string }>();
      expect(
        await db
          .prepare(
            "SELECT token_hash FROM password_reset_tokens WHERE user_id=?",
          )
          .bind(user!.id)
          .first(),
      ).toBeNull();
      expect(
        await db
          .prepare(
            "SELECT action FROM audit_logs WHERE actor_id=? AND action=?",
          )
          .bind(user!.id, "email.delivery.failed")
          .first(),
      ).toBeTruthy();
    } finally {
      vi.unstubAllGlobals();
    }
  }, 60000);
  it("purges expired sessions, tokens and history on schedule", async () => {
    // Create this fixture directly; no public bootstrap endpoint exists.
    await db
      .prepare("INSERT INTO users VALUES(?,?,?,?,?,?,?,?)")
      .bind(
        "retention-user",
        "retention@example.test",
        "Retention",
        "not-used",
        "free",
        1,
        0,
        1,
      )
      .run();
    await db
      .prepare("INSERT INTO user_preferences VALUES(?,?,?)")
      .bind("retention-user", "{}", 7)
      .run();
    await db
      .prepare("INSERT INTO tool_history VALUES(?,?,?,?,?)")
      .bind("expired-history", "retention-user", "case", "old", 1)
      .run();
    await db
      .prepare("INSERT INTO sessions VALUES(?,?,?)")
      .bind(digest("f".repeat(64)), "retention-user", 1)
      .run();
    await db
      .prepare("INSERT INTO password_reset_tokens VALUES(?,?,?)")
      .bind(digest("e".repeat(64)), "retention-user", 1)
      .run();
    const guest = (await (
      await request("/me", undefined, "rt_session=" + "f".repeat(64))
    ).json()) as any;
    expect(guest.user).toBeNull();
    expect(
      (
        await request("/auth/reset-password", {
          token: "e".repeat(64),
          password: "a strong reset password",
        })
      ).status,
    ).toBe(400);
    let cleanup: Promise<unknown> | undefined;
    await worker.scheduled(
      {} as any,
      { DB: db } as any,
      {
        waitUntil: (promise: Promise<unknown>) => {
          cleanup = promise;
        },
      } as any,
    );
    await cleanup;
    expect(
      await db
        .prepare("SELECT id FROM tool_history WHERE id=?")
        .bind("expired-history")
        .first(),
    ).toBeNull();
    expect(
      await db
        .prepare("SELECT token_hash FROM sessions WHERE user_id=?")
        .bind("retention-user")
        .first(),
    ).toBeNull();
    expect(
      await db
        .prepare("SELECT token_hash FROM password_reset_tokens WHERE user_id=?")
        .bind("retention-user")
        .first(),
    ).toBeNull();
  });
  it("registers, verifies, logs in, protects roles, resets, revokes sessions and deletes", async () => {
    const a = await account("member");
    expect((await request("/pro/presets", undefined, a.cookie)).status).toBe(
      403,
    );
    expect((await request("/admin", undefined, a.cookie)).status).toBe(403);
    expect(
      (
        await request(
          "/account",
          { name: "new name", role: "admin" },
          a.cookie,
          "PATCH",
        )
      ).status,
    ).toBe(400);
    expect(
      (await request("/account", { name: "new name" }, a.cookie, "PATCH"))
        .status,
    ).toBe(200);
    const reset = (await (
      await request("/auth/forgot-password", { email: a.email })
    ).json()) as any;
    const token = new URL(reset.developmentLink).searchParams.get("token");
    expect(
      (
        await request("/auth/reset-password", {
          token,
          password: "a new strong password",
        })
      ).status,
    ).toBe(200);
    const revoked = (await (
      await request("/me", undefined, a.cookie)
    ).json()) as any;
    expect(revoked.user).toBeNull();
    expect(
      (
        await request("/auth/reset-password", {
          token,
          password: "another strong password",
        })
      ).status,
    ).toBe(400);
    const login = await request("/auth/login", {
      email: a.email,
      password: "a new strong password",
    });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    expect((await request("/account/export", undefined, cookie)).status).toBe(
      200,
    );
    expect(
      (
        await request(
          "/account",
          { password: "a new strong password" },
          cookie,
          "DELETE",
        )
      ).status,
    ).toBe(200);
    expect(
      await db.prepare("SELECT id FROM users WHERE id=?").bind(a.id).first(),
    ).toBeNull();
  }, 120000);
  it("authenticates and deduplicates webhooks, requires reviewed claims, expires Pro, isolates saved data", async () => {
    const admin = await account("operator");
    await db
      .prepare("UPDATE users SET role='admin' WHERE id=?")
      .bind(admin.id)
      .run();
    const a = await account("subscriber");
    const event = {
      verification_token: "test-only-not-a-real-secret",
      message_id: "event-one",
      kofi_transaction_id: "transaction-one",
      type: "Subscription",
      amount: "4.99",
      currency: "AUD",
      is_subscription_payment: true,
    };
    const send = (data: unknown) =>
      mf.dispatchFetch("http://localhost/api/webhooks/kofi", {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: JSON.stringify(data) }).toString(),
      });
    expect((await send({ ...event, verification_token: "wrong" })).status).toBe(
      401,
    );
    expect((await send(event)).status).toBe(200);
    expect(await (await send(event)).json()).toEqual({
      received: true,
      duplicate: true,
    });
    expect(
      (
        await request(
          "/subscription/claim",
          { transactionId: event.kofi_transaction_id },
          a.cookie,
        )
      ).status,
    ).toBe(200);
    expect(
      (await request("/pro/preferences", undefined, a.cookie)).status,
    ).toBe(403);
    const claim = await db
      .prepare("SELECT id FROM membership_claims WHERE user_id=?")
      .bind(a.id)
      .first<{ id: string }>();
    const body = {
      claimId: claim!.id,
      eventId: event.message_id,
      paidThrough: Math.floor(Date.now() / 1000) + 86400,
      ownershipVerified: true,
    };
    expect((await request("/admin/reconcile", body, a.cookie)).status).toBe(
      403,
    );
    expect((await request("/admin/reconcile", body, admin.cookie)).status).toBe(
      200,
    );
    expect((await request("/admin/reconcile", body, admin.cookie)).status).toBe(
      400,
    );
    expect(
      (
        await request(
          "/pro/presets",
          { name: "test", kind: "preset", data: { mode: "upper" } },
          a.cookie,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await request(
          "/pro/history",
          { tool: "case", data: "private" },
          a.cookie,
        )
      ).status,
    ).toBe(200);
    const adminPresets = await (
      await request("/pro/presets", undefined, admin.cookie)
    ).json();
    expect(adminPresets).toEqual([]);
    await db
      .prepare("UPDATE subscriptions SET paid_through=1 WHERE user_id=?")
      .bind(a.id)
      .run();
    expect((await request("/pro/presets", undefined, a.cookie)).status).toBe(
      403,
    );
    const renewal = {
      ...event,
      message_id: "event-renewal",
      kofi_transaction_id: "transaction-renewal",
    };
    expect((await send(renewal)).status).toBe(200);
    expect(
      (
        await request(
          "/subscription/claim",
          { transactionId: renewal.kofi_transaction_id },
          a.cookie,
        )
      ).status,
    ).toBe(200);
    const renewedClaim = await db
      .prepare(
        "SELECT id FROM membership_claims WHERE user_id=? AND transaction_id=?",
      )
      .bind(a.id, renewal.kofi_transaction_id)
      .first<{ id: string }>();
    const renewedBody = {
      ...body,
      claimId: renewedClaim!.id,
      eventId: renewal.message_id,
    };
    expect(
      (
        await request(
          "/admin/reconcile",
          {
            ...renewedBody,
            paidThrough: Math.floor(Date.now() / 1000) + 60 * 86400,
          },
          admin.cookie,
        )
      ).status,
    ).toBe(400);
    const concurrent = await Promise.all([
      request("/admin/reconcile", renewedBody, admin.cookie),
      request("/admin/reconcile", renewedBody, admin.cookie),
    ]);
    expect(concurrent.filter((r) => r.status === 200)).toHaveLength(1);
    expect(concurrent.every((r) => [200, 400, 409].includes(r.status))).toBe(
      true,
    );
    expect((await request("/pro/presets", undefined, a.cookie)).status).toBe(
      200,
    );
    const renewedSubscription = await db
      .prepare("SELECT id FROM subscriptions WHERE event_id=?")
      .bind(renewal.message_id)
      .first<{ id: string }>();
    expect(
      (
        await request(
          "/admin/subscriptions/revoke",
          { id: renewedSubscription!.id, reason: "refund" },
          admin.cookie,
        )
      ).status,
    ).toBe(200);
    expect((await request("/pro/presets", undefined, a.cookie)).status).toBe(
      403,
    );
    for (const [suffix, currency, amount] of [
      ["currency", "USD", "4.99"],
      ["amount", "AUD", "0.01"],
    ]) {
      const unsupported = {
        ...event,
        message_id: "unsupported-" + suffix,
        kofi_transaction_id: "unsupported-" + suffix,
        currency,
        amount,
      };
      expect((await send(unsupported)).status).toBe(200);
      expect(
        (
          await request(
            "/subscription/claim",
            { transactionId: unsupported.kofi_transaction_id },
            a.cookie,
          )
        ).status,
      ).toBe(200);
      const pendingClaim = await db
        .prepare(
          "SELECT id FROM membership_claims WHERE user_id=? AND transaction_id=?",
        )
        .bind(a.id, unsupported.kofi_transaction_id)
        .first<{ id: string }>();
      expect(
        (
          await request(
            "/admin/reconcile",
            {
              ...body,
              claimId: pendingClaim!.id,
              eventId: unsupported.message_id,
            },
            admin.cookie,
          )
        ).status,
      ).toBe(400);
    }
    await db.batch(
      Array.from({ length: 99 }, (_, i) =>
        db
          .prepare("INSERT INTO saved_presets VALUES(?,?,?,?,?,?)")
          .bind("quota-" + i, admin.id, "preset", "Quota fixture", "{}", 1),
      ),
    );
    const quota = await Promise.all([
      request(
        "/pro/presets",
        { kind: "preset", name: "Concurrent one", data: {} },
        admin.cookie,
      ),
      request(
        "/pro/presets",
        { kind: "preset", name: "Concurrent two", data: {} },
        admin.cookie,
      ),
    ]);
    expect(quota.map((r) => r.status).sort()).toEqual([200, 400]);
    expect((await request("/auth/logout", {}, a.cookie)).status).toBe(200);
    expect((await request("/subscription", undefined, a.cookie)).status).toBe(
      401,
    );
  }, 120000);
  it("rejects cross-origin writes and enforces atomic rate counters", async () => {
    const bad = await mf.dispatchFetch("http://localhost/api/auth/register", {
      method: "POST",
      headers: {
        origin: "https://attacker.test",
        "content-type": "application/json",
      },
      body: "{}",
    });
    expect(bad.status).toBe(403);
    let response;
    for (let i = 0; i < 26; i++)
      response = await mf.dispatchFetch("http://localhost/api/auth/login", {
        method: "POST",
        headers: {
          origin: "http://localhost:5173",
          "content-type": "application/json",
          "CF-Connecting-IP": "198.51.100.12",
        },
        body: "{}",
      });
    expect(response!.status).toBe(429);
  });
});
