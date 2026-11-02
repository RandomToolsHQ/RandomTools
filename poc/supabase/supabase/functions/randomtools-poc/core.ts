import { createClerkClient } from "@clerk/backend";

export class Denied extends Error {
  constructor(
    public status: number,
    public retryAfter?: number,
  ) {
    super("Request denied");
  }
}
export type Config = {
  enabled: string;
  projectRef: string;
  supabaseUrl: string;
  serviceKey: string;
  accessKey: string;
  origin: string;
  clerkSecret: string;
  clerkPublic: string;
  clerkIssuer: string;
  clerkJwtKey?: string;
  // Dedicated synthetic subjects/mailboxes only. Never import real staging users.
  testers: Record<string, string>;
};
export type Identity = { issuer: string; subject: string };
export type Store = {
  rate(): Promise<boolean>;
  request(
    identity: Identity,
    operation: string,
    body: unknown,
  ): Promise<unknown>;
};
export function validateConfig(c: Config) {
  if (
    c.enabled !== "true" ||
    !/^[a-z]{20}$/.test(c.projectRef) ||
    c.supabaseUrl !== `https://${c.projectRef}.supabase.co` ||
    !c.serviceKey ||
    !/^[a-f0-9]{64}$/.test(c.accessKey) ||
    !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(c.origin) ||
    !c.clerkSecret.startsWith("sk_test_") ||
    !c.clerkPublic.startsWith("pk_test_") ||
    !/^https:\/\/[a-z0-9-]+\.clerk\.accounts\.dev$/.test(c.clerkIssuer) ||
    !Object.keys(c.testers).length ||
    Object.entries(c.testers).some(
      ([id, email]) =>
        !/^user_[A-Za-z0-9]+$/.test(id) ||
        !/^[a-z0-9.+_-]+@example\.com$/.test(email),
    )
  )
    throw new Denied(503);
}
async function equalSecret(a: string, b: string) {
  const encoder = new TextEncoder();
  const [x, y] = await Promise.all(
    [a, b].map(
      async (v) =>
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", encoder.encode(v)),
        ),
    ),
  );
  let mismatch = 0;
  for (let i = 0; i < x.length; i++) mismatch |= x[i] ^ y[i];
  return mismatch === 0;
}
export function makeAuthenticator(c: Config) {
  validateConfig(c);
  const client = createClerkClient({
    secretKey: c.clerkSecret,
    publishableKey: c.clerkPublic,
    telemetry: { disabled: true },
  });
  return async (req: Request): Promise<Identity> => {
    try {
      if (!/^Bearer \S+$/.test(req.headers.get("authorization") || ""))
        throw new Denied(401);
      const state = await client.authenticateRequest(req, {
        authorizedParties: [c.origin],
        acceptsToken: "session_token",
        jwtKey: c.clerkJwtKey,
      });
      if (!state.isAuthenticated) throw new Denied(401);
      const auth = state.toAuth();
      if (
        !auth?.userId ||
        !auth.sessionId ||
        auth.sessionClaims?.iss !== c.clerkIssuer ||
        auth.sessionClaims?.azp !== c.origin
      )
        throw new Denied(401);
      const expected = c.testers[auth.userId];
      if (!expected) throw new Denied(403);
      // Never cache provider status, profile, roles, memberships or token decisions.
      const session = await client.sessions.getSession(auth.sessionId);
      if (
        session.status !== "active" ||
        session.userId !== auth.userId ||
        !Number.isFinite(session.expireAt) ||
        session.expireAt <= Date.now()
      )
        throw new Denied(401);
      const profile = await client.users.getUser(auth.userId);
      const primary = profile.emailAddresses.find(
        (e) => e.id === profile.primaryEmailAddressId,
      );
      if (
        profile.banned ||
        profile.locked ||
        primary?.verification?.status !== "verified" ||
        primary.emailAddress.toLowerCase() !== expected
      )
        throw new Denied(403);
      return { issuer: c.clerkIssuer, subject: auth.userId };
    } catch (e) {
      if (e instanceof Denied) throw e;
      const status =
        e && typeof e === "object" && "status" in e ? Number(e.status) : 0;
      if (status === 404) throw new Denied(401);
      // Status only: never log SDK exceptions, email, headers or tokens.
      console.warn("POC Clerk dependency unavailable", {
        status: status || "network",
      });
      throw new Denied(503, status === 429 ? 10 : 5);
    }
  };
}
export function makeStore(c: Config, fetcher: typeof fetch = fetch): Store {
  async function rpc(name: string, body: unknown) {
    const response = await fetcher(`${c.supabaseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: c.serviceKey,
        authorization: `Bearer ${c.serviceKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      // Only explicitly raised SQLSTATEs map to client denials. Never expose SQL.
      const error = await response.json().catch(() => ({}));
      const code =
        error && typeof error === "object" && "code" in error ? error.code : "";
      if (code === "RT403") throw new Denied(403);
      if (code === "RT404") throw new Denied(404);
      if (code === "RT400") throw new Denied(400);
      throw new Denied(503, 5);
    }
    return response.json();
  }
  return {
    rate: async () => (await rpc("rt_poc_rate", {})) === true,
    request: (identity, operation, body) =>
      rpc("rt_poc_request", {
        p_issuer: identity.issuer,
        p_subject: identity.subject,
        p_operation: operation,
        p_body: body,
      }),
  };
}
export function createHandler(
  c: Config,
  store: Store,
  authenticate: (req: Request) => Promise<Identity>,
) {
  return async (req: Request): Promise<Response> => {
    const start = performance.now();
    const headers = new Headers({
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      vary: "Origin",
    });
    try {
      validateConfig(c);
      if (req.headers.get("origin") !== c.origin) throw new Denied(403);
      headers.set("access-control-allow-origin", c.origin);
      headers.set("access-control-expose-headers", "Server-Timing, Retry-After");
      if (req.method === "OPTIONS") {
        headers.set("access-control-allow-methods", "POST");
        headers.set(
          "access-control-allow-headers",
          "authorization,content-type,x-poc-access",
        );
        return new Response(null, { status: 204, headers });
      }
      if (req.method !== "POST") throw new Denied(405);
      const key = req.headers.get("x-poc-access") || "";
      if (key.length !== 64 || !(await equalSecret(key, c.accessKey)))
        throw new Denied(403);
      if (!req.headers.get("content-type")?.startsWith("application/json"))
        throw new Denied(415);
      // Stream a bounded body; Content-Length alone is untrusted.
      const reader = req.body?.getReader();
      let size = 0,
        raw = "";
      const decoder = new TextDecoder();
      if (reader) {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 16384) {
            await reader.cancel();
            throw new Denied(413);
          }
          raw += decoder.decode(value, { stream: true });
        }
        raw += decoder.decode();
      }
      let input;
      try {
        input = JSON.parse(raw);
      } catch {
        throw new Denied(400);
      }
      if (
        !input ||
        typeof input !== "object" ||
        Array.isArray(input) ||
        !["me", "workspace", "save", "delete", "admin"].includes(
          input.operation,
        ) ||
        Object.keys(input).some((k) => !["operation", "body"].includes(k))
      )
        throw new Denied(400);
      if (!(await store.rate())) throw new Denied(429, 10);
      const identity = await authenticate(req);
      const result = await store.request(
        identity,
        input.operation,
        input.body ?? {},
      );
      headers.set(
        "server-timing",
        `handler;dur=${(performance.now() - start).toFixed(2)}`,
      );
      // handler timing is elapsed wall time, NOT CPU usage.
      return Response.json(result, { headers });
    } catch (e) {
      const status = e instanceof Denied ? e.status : 503;
      if (e instanceof Denied && e.retryAfter)
        headers.set("retry-after", String(e.retryAfter));
      return Response.json(
        { error: status === 503 ? "Dependency unavailable" : "Request denied" },
        { status, headers },
      );
    }
  };
}
