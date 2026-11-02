import {
  createHandler,
  makeAuthenticator,
  makeStore,
  type Config,
} from "./core.ts";

const get = (name: string) => Deno.env.get(name) || "";
try {
  const config: Config = {
    enabled: get("POC_ENABLED"),
    projectRef: get("POC_PROJECT_REF"),
    supabaseUrl: get("SUPABASE_URL"),
    serviceKey: get("SUPABASE_SERVICE_ROLE_KEY"),
    accessKey: get("POC_ACCESS_KEY"),
    origin: get("POC_ORIGIN"),
    clerkSecret: get("POC_CLERK_SECRET_KEY"),
    clerkPublic: get("POC_CLERK_PUBLISHABLE_KEY"),
    clerkIssuer: get("POC_CLERK_ISSUER"),
    clerkJwtKey: get("POC_CLERK_JWT_KEY") || undefined,
    testers: JSON.parse(get("POC_SYNTHETIC_TESTERS") || "{}"),
  };
  Deno.serve(
    createHandler(config, makeStore(config), makeAuthenticator(config)),
  );
} catch {
  // A missing/invalid configuration never starts an unauthenticated handler.
  Deno.serve(() =>
    Response.json(
      { error: "POC unavailable" },
      {
        status: 503,
        headers: { "cache-control": "no-store" },
      },
    ),
  );
}
