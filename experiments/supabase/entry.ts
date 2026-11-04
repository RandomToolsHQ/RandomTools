import { createHandler, makeStore, type Config } from "./core";
declare const Deno: {
  env: { get(name: string): string | undefined };
  serve(handler: (req: Request) => Promise<Response>): void;
};
const env = (name: string) => Deno.env.get(name) || "";
let testers: Record<string, string> = {};
try {
  testers = JSON.parse(env("POC_TESTERS"));
} catch {
  /* Empty config fails closed. */
}
const c: Config = {
  enabled: env("POC_ENABLED"),
  projectRef: env("POC_PROJECT_REF"),
  origin: env("POC_ORIGIN"),
  accessKey: env("POC_ACCESS_KEY"),
  firebaseProject: env("FIREBASE_PROJECT_ID"),
  firebaseKey: env("FIREBASE_WEB_API_KEY"),
  rateSecret: env("POC_RATE_SECRET"),
  testers,
  serviceKey: env("SUPABASE_SERVICE_ROLE_KEY"),
};
Deno.serve(createHandler(c, makeStore(c)));
