import { beforeAll, afterEach, it, expect, vi } from "vitest";
import { generateKeyPair, exportSPKI, SignJWT } from "jose";
import {
  makeAuthenticator,
  type Config,
} from "../poc/supabase/supabase/functions/randomtools-poc/core";

// Real Clerk JWT verifier; only provider HTTP responses are synthetic here.
const host = "synthetic.clerk.accounts.dev";
const origin = "http://127.0.0.1:54380";
let key: CryptoKey, publicKey: string;
beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  key = pair.privateKey;
  publicKey = await exportSPKI(pair.publicKey);
});
afterEach(() => vi.unstubAllGlobals());
function config(): Config {
  return {
    enabled: "true",
    projectRef: "a".repeat(20),
    supabaseUrl: `https://${"a".repeat(20)}.supabase.co`,
    serviceKey: "synthetic",
    accessKey: "a".repeat(64),
    origin,
    clerkSecret: "sk_test_synthetic",
    clerkPublic: "pk_test_" + Buffer.from(host + "$").toString("base64"),
    clerkIssuer: "https://" + host,
    clerkJwtKey: publicKey,
    testers: { user_alice: "alice@example.com" },
  };
}
async function bearer(
  overrides: Record<string, unknown> = {},
  signingKey = key,
) {
  return new SignJWT({
    sid: "sess_synthetic",
    azp: origin,
    sub: "user_alice",
    iss: "https://" + host,
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "synthetic" })
    .setIssuedAt()
    .setExpirationTime(typeof overrides.exp === "number" ? overrides.exp : "1m")
    .sign(signingKey);
}
const req = (jwt: string) =>
  new Request(origin + "/poc", { headers: { authorization: "Bearer " + jwt } });
function providerFetch(status = "active") {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/sessions/"))
      return Response.json({
        object: "session",
        id: "sess_synthetic",
        status,
        user_id: "user_alice",
        expire_at: Date.now() + 60000,
        abandon_at: Date.now() + 60000,
        last_active_at: Date.now(),
        created_at: Date.now(),
        updated_at: Date.now(),
      });
    if (url.includes("/users/"))
      return Response.json({
        object: "user",
        id: "user_alice",
        banned: false,
        locked: false,
        primary_email_address_id: "email_synthetic",
        email_addresses: [
          {
            id: "email_synthetic",
            email_address: "alice@example.com",
            linked_to: [],
            verification: { status: "verified" },
          },
        ],
        phone_numbers: [],
        web3_wallets: [],
        external_accounts: [],
        passkeys: [],
        saml_accounts: [],
        enterprise_accounts: [],
      });
    throw new Error("Unexpected synthetic provider request");
  });
}
it("accepts a cryptographically valid generated JWT and checks the live session/profile", async () => {
  const fetcher = providerFetch();
  vi.stubGlobal("fetch", fetcher);
  expect(await makeAuthenticator(config())(req(await bearer()))).toEqual({
    issuer: "https://" + host,
    subject: "user_alice",
  });
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("rejects an otherwise valid JWT when its live session is revoked", async () => {
  const fetcher = providerFetch("revoked");
  vi.stubGlobal("fetch", fetcher);
  await expect(
    makeAuthenticator(config())(req(await bearer())),
  ).rejects.toMatchObject({ status: 401 });
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("rejects wrong signatures and wrong authorized parties before provider calls", async () => {
  const fetcher = providerFetch();
  vi.stubGlobal("fetch", fetcher);
  const other = await generateKeyPair("RS256");
  for (const jwt of [
    await bearer({}, other.privateKey),
    await bearer({ azp: "https://attacker.invalid" }),
  ])
    await expect(makeAuthenticator(config())(req(jwt))).rejects.toMatchObject({
      status: 401,
    });
  expect(fetcher).not.toHaveBeenCalled();
});

it("rejects a genuinely expired generated JWT before provider calls", async () => {
  const fetcher = providerFetch();
  vi.stubGlobal("fetch", fetcher);
  await expect(
    makeAuthenticator(config())(
      req(await bearer({ exp: Math.floor(Date.now() / 1000) - 120 })),
    ),
  ).rejects.toMatchObject({ status: 401 });
  expect(fetcher).not.toHaveBeenCalled();
});
