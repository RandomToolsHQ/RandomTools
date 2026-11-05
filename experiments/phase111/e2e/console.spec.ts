import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
const origin = "https://randomtools-phase11-supabase.pages.dev";
const email = "phase11-00000000-member@example.com";
const encode = (x: object) =>
  Buffer.from(JSON.stringify(x)).toString("base64url");
const jwt = () =>
  encode({ alg: "RS256" }) +
  "." +
  encode({
    sub: "synthetic",
    aud: "randomtools-supabase-auth-poc",
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    email_verified: true,
  }) +
  ".synthetic";
for (const logoutFails of [false, true])
  test(
    "synthetic browser console: roles, ownership and " +
      (logoutFails ? "failed logout is explicit" : "confirmed logout"),
    async ({ page }) => {
      const seen: string[] = [];
      let pro = false;
      await page.route(
        "**/identitytoolkit.googleapis.com/**",
        async (route) => {
          if (route.request().url().includes("signInWithPassword"))
            return route.fulfill({
              json: {
                localId: "synthetic",
                email,
                idToken: jwt(),
                refreshToken: "synthetic",
                expiresIn: "3600",
                registered: true,
              },
            });
          if (route.request().url().includes("accounts:lookup"))
            return route.fulfill({
              json: {
                users: [
                  {
                    localId: "synthetic",
                    email,
                    emailVerified: true,
                    providerUserInfo: [{ providerId: "password", email }],
                    createdAt: "1",
                    lastLoginAt: "1",
                  },
                ],
              },
            });
          return route.fulfill({
            json: {
              authorizedDomains: ["randomtools-phase11-supabase.pages.dev"],
            },
          });
        },
      );
      await page.route(origin + "/**", async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === "/api/phase11") {
          const headers = route.request().headers();
          expect(headers.authorization).toMatch(/^Bearer /);
          expect(headers["x-poc-access"]).toBeUndefined();
          const input = route.request().postDataJSON();
          seen.push(input.operation);
          if (input.operation === "logout" && logoutFails)
            return route.fulfill({
              status: 503,
              json: { error: "Dependency unavailable" },
            });
          if (
            input.operation === "admin" ||
            (!pro && ["workspace", "save"].includes(input.operation))
          )
            return route.fulfill({
              status: 403,
              json: { error: "Request denied" },
            });
          if (input.operation === "me")
            return route.fulfill({
              json: {
                user: { id: "synthetic", role: "free" },
                pro,
                paymentsEnabled: false,
              },
            });
          if (input.operation === "save")
            return route.fulfill({ json: { id: "synthetic-preset" } });
          return route.fulfill({ json: { updated: true } });
        }
        const file = path === "/" ? "index.html" : path.slice(1);
        if (!["index.html", "test.js", "test.css"].includes(file))
          return route.abort();
        return route.fulfill({
          body: await readFile(".wrangler/phase111/gateway/dist/" + file),
          contentType: file.endsWith(".js")
            ? "application/javascript"
            : file.endsWith(".css")
              ? "text/css"
              : "text/html",
        });
      });
      await page.goto(origin);
      await expect(
        page.getByRole("button", { name: "Read account", exact: true }),
      ).toBeDisabled();
      await page.getByLabel("Synthetic account email").fill(email);
      await page.getByLabel("Test password").fill("synthetic-test-password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page.getByRole("status")).toHaveText(
        "Authenticated application session established.",
      );
      await expect(page.getByLabel("Test password")).toHaveValue("");
      await page
        .getByRole("button", { name: "Test admin access", exact: true })
        .click();
      await expect(page.getByRole("alert")).toHaveText(
        "Permission denied (403).",
      );
      await page
        .getByRole("button", { name: "Read Pro workspace", exact: true })
        .click();
      await expect(page.getByRole("alert")).toHaveText(
        "Permission denied (403).",
      );
      await page
        .getByRole("button", { name: "Create synthetic preset", exact: true })
        .click();
      await expect(page.getByRole("alert")).toHaveText(
        "Permission denied (403).",
      );
      // Simulate a server-side grant in the mocked backend; the browser sends no entitlement.
      pro = true;
      await page
        .getByRole("button", { name: "Create synthetic preset", exact: true })
        .click();
      await expect(page.getByRole("status")).toHaveText(
        "Synthetic preset created.",
      );
      await page
        .getByRole("button", { name: "Delete created preset", exact: true })
        .click();
      await expect(page.getByRole("status")).toHaveText(
        "Created preset removed.",
      );
      const a11y = await new AxeBuilder({ page }).analyze();
      expect(a11y.violations).toEqual([]);
      await page.getByRole("button", { name: "Log out", exact: true }).click();
      if (logoutFails)
        await expect(page.getByRole("alert")).toHaveText(
          "Testing service unavailable. Server logout was not confirmed.",
        );
      else
        await expect(page.getByRole("status")).toHaveText(
          "Logged out; server session revoked.",
        );
      await expect(
        page.getByRole("button", { name: "Read account", exact: true }),
      ).toBeDisabled();
      expect(seen).toEqual([
        "session",
        "me",
        "admin",
        "workspace",
        "save",
        "save",
        "delete",
        "logout",
      ]);
      await page.reload();
      await expect(
        page.getByRole("button", { name: "Read account", exact: true }),
      ).toBeDisabled();
    },
  );
