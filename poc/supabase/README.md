# Isolated Supabase Free proof of concept

Based on `ab76f00`; this directory is NOT used by either Cloudflare deployment.
Do not run Cloudflare deployment commands to test this prototype. No automatic
deployment, provider migration, public account frontend or payment route is added.

## Status, 2 November 2026

The owner approved Free signup and terms. The connected Supabase dashboard created
organization **RandomTools isolated POC**, reference `eomfviwayljoebpfqqyi`, on Free.
No card, trial or billing authorization was requested in the observed workflow.
The `randomtools-poc` project form is prepared for Sydney, automatic table exposure
off and automatic RLS on. **Project creation remains pending**, at the owner's
request. Do not claim project-level billing requirements are fully verified yet.

No hosted POC function/database exists or has been measured. Keep the existing
Cloudflare architecture until representative hosted evidence supports a decision.
Published limits provide a reason to evaluate Supabase, not proof of performance.

## Implemented slice and security boundary

- Both migrations port all 15 existing tables and indexes to a private Postgres
  schema; integer timestamps become bigint, preserving epoch-second semantics.
- `me`, populated `workspace`, `save`, ownership-scoped `delete`, and an audited
  `admin` summary exercise representative permission and database paths.
- Functions require a new 256-bit prototype key, an exact loopback frontend origin,
  a dedicated development Clerk instance and an explicit synthetic-subject/mailbox
  allowlist. An unset/disabled/invalid configuration returns 503. No production
  mode is implemented. The prototype cannot be enabled with live Clerk keys.
- Clerk's SDK verifies signed session JWTs, exact issuer and authorized party.
  Each operation additionally reads the live provider session and profile, expiry,
  subject binding, verified primary mailbox and banned/locked state. There is no
  session/profile/role/entitlement decision cache or test authentication bypass.
- No auto-provisioning or email linking: identities are pre-seeded explicitly.
  Database roles/entitlements come from a fresh transaction. Payload owner/role
  injection is rejected for writes. Missing/tombstoned/disabled mappings deny.
- RPCs run with a fixed search path and contain no user-supplied dynamic SQL.
  Execute is revoked from PUBLIC, anon and authenticated; only service_role can
  call them. The private tables have RLS, no client grants and no client policies.
  The service key exists only server-side. Browser SDK/direct table access must
  never be enabled as a shortcut around live session and entitlement checks.
- `verify_jwt=false` disables only Supabase's legacy JWT gateway, which does not
  replace Clerk verification. The handler independently enforces BOTH the access
  key and Clerk authentication before executing any account operation. An anonymous
  function URL does not create anonymous access to account data. Preflight has no
  account data and is limited to the configured origin.
- A distributed Postgres rate gate allows at most 20 operations/10 seconds before
  Clerk calls. Provider 429 becomes safe 503/Retry-After=10; SQL or transport
  failures fail closed. The limit is deliberately lower than Clerk dev's shared
  100 backend calls/10 seconds, not a claim of unlimited signup or production load.
- Streamed JSON is capped at 16 KiB, preset data at 4 KiB and presets at 100/user.
  Preset writes/deletes and audit inserts share one Postgres transaction. Failed
  audit insertion rolls the write back. No Ko-fi endpoints or payment grants exist.

## Local validation

From the repository root:

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npx.cmd -y deno check --config poc/supabase/supabase/functions/randomtools-poc/deno.json poc/supabase/supabase/functions/randomtools-poc/index.ts
```

PGlite runs real Postgres SQL/PLpgSQL locally in WASM; it is not a mocked D1 query
adapter. It does not reproduce hosted PostgREST, shared compute, networking, pool
behavior or Supabase's infrastructure roles. JWT tests use the actual Clerk SDK
with generated RSA keys and synthetic HTTP provider responses; they do not prove
real Clerk registration/session revocation against a hosted provider instance.

Tests cover RLS/grants, all 15 tables, populated reads, two-user isolation,
cross-owner delete denial, audit atomicity/rollback, expiry/revocation of membership,
admin removal, identity tombstones, disabled accounts, injection/size/quota checks,
distributed rate budget, access gate, live session/profile freshness, wrong issuer,
wrong authorized party/signature, live revoked session, safe provider throttling
and SQL error redaction. Existing Cloudflare tests run unchanged alongside them.

Current local validation: 85 unit/integration tests passed (23 POC cases), plus
typecheck/lint, Deno entrypoint check, separate frontend build, one fail-closed
POC browser check, existing Pages build and existing D1 backup/restore. No hosted
Supabase measurements or real synthetic-provider-session results are implied.

## Remaining hosted setup (only this isolated project)

1. Finish the pending Free project creation. Stop on any billing/card/trial prompt.
2. Create a separate Clerk development application and synthetic accounts only.
   Save newly generated credentials in ignored `.dev.vars.supabase-poc`, following
   `SECRETS.example`. Do not use the real staging key, subject or mailbox. Complete
   any credential/security handoff through the owner, without disabling protections.
3. Confirm the new project is Free/Sydney and verify billing has no card or paid
   add-on. Apply the two SQL migrations **only** to this project's SQL editor or
   an explicitly linked Supabase CLI project. Keep `rt_poc` out of exposed schemas.
4. Replace the seed template's issuer/subjects with dedicated synthetic Clerk IDs;
   inspect them before running `synthetic-seed.sql`. No genuine export/import.
5. Deploy `randomtools-poc` from this directory with the official Supabase CLI.
   Verify the CLI project reference matches the isolated project before each push.
   Use built-in runtime service credentials. Upload only new POC secrets, initially
   `POC_ENABLED=false`. Enable only after exact project/origin/tester configuration.
6. Verify anonymous, wrong-key, wrong-origin, malformed JWT, direct RPC and direct
   table denials via the real function and PostgREST. Do not rely on hidden UI/CORS.
7. Test synthetic Alice/Bob ownership and same-email collision constraints, free/
   expired/revoked Pro, role injection, admin promotion/removal, disabled/tombstoned
   account and an unexpired token whose actual Clerk session was revoked.
8. Populate ten 2 KiB presets and ten 1 KiB history entries; run bounded benchmarks.
   Finish by removing the temporary admin role and memberships in the POC only.
   Preserve audit evidence. Do not delete the genuine Cloudflare tester.

Supabase CLI project deployments must never be added to the existing public build
or run automatically from GitHub CI. No existing Cloudflare routing is changed.

## Measurement protocol and acceptance

The preferred harness is a separate loopback-only Clerk frontend. Create ignored
`poc/supabase/client/.env.local` with only the NEW development public key and
isolated project reference as `VITE_POC_CLERK_PUBLISHABLE_KEY` and
`VITE_POC_PROJECT_REF`, then run `npm.cmd run poc:supabase:dev` and open
`http://127.0.0.1:54380`. The empty/default build fails closed. Sign in with a
dedicated synthetic account and enter the new POC access key locally. Its bounded
workload obtains normal short-lived tokens through Clerk's SDK on each request;
no bearer tokens are exported or persisted. Only sanitized aggregate measurement
results are rendered. Clear the in-memory key/report after testing. This harness
is not included in either public or private Cloudflare frontend and must never
be published. `npm.cmd run poc:supabase:build` typechecks/builds it into ignored
`.wrangler/poc-client` separately from the existing application.

`benchmark.mjs` reads only ignored `.wrangler/supabase-poc-bench.json`: projectRef,
new accessKey, fresh synthetic Clerk token, origin and syntheticSubject. It never
prints them or response account data. Obtain a normal short-lived token through
the dedicated local Clerk frontend; never extend expiry to make a benchmark pass.
The file must be restricted to the local user and SYSTEM, and removed after use.

```powershell
$env:POC_BENCH_CREDENTIAL_FILE = "$PWD\.wrangler\supabase-poc-bench.json"
node poc/supabase/benchmark.mjs
```

One run is capped at 41 authenticated reads plus 3 audited saves/deletes, batches
of five with 3.5-second gaps. Sequential warm-up is paced too. Requires at least
50 seconds remaining on the supplied token; dependency latency can still expire
it, in which case stop rather than weaken verification. Settle in-flight requests
and stop on failures. No benchmark token or credential is committed/uploaded.

Repeat three times with fresh normal tokens. Compare p50/p95/p99 end-to-end latency,
statuses and provider 429 separately. Server-Timing reports handler **wall time**,
not CPU. Supabase shutdown events report `cpu_time_used` with execution IDs and
shutdown reasons. Capture these without headers/bodies, distinguish shared-isolate
totals from per-request CPU, and check CPUTime/546, memory and wall-limit failures.
Never divide aggregate isolate CPU by request count and call that a p99 measure.

Observe BootEvent/execution IDs to establish actual cold starts; the first request
after deployment or idle time alone is not proof. Compare verified cold/warm runs,
not differently paced or differently populated backends. Existing Cloudflare
measurements used a different 121-request workload and are **not** a matched
comparison to this 47-request harness. A matched Cloudflare run is needed before
claiming a cross-platform latency improvement.

For project inactivity, the documented one-week Free pause cannot be honestly
reproduced in one work session. A manual pause/resume rehearsal (if approved later)
tests recovery but is not evidence of automatic inactivity behavior. Do not add
keepalive traffic to evade pausing. Verify resumed permissions/data and function
availability; measure recovery time and document owner actions.

No hosted CPU/latency/failure/cold-start/revocation/backup results currently exist.
Decision: **remain on Cloudflare for now; continue this isolated evaluation when
the project and dedicated credentials are available.** No migration recommendation
can yet be justified by measured Supabase performance.

## Free-tier and commercial constraints

Reviewed official documentation on 2 November 2026:

- [Pricing](https://supabase.com/pricing): $0 Free, two active projects, 500 MB
  database, 5 GB egress, one-week inactivity pause, community support, no uptime
  SLA. These are quotas, not unlimited durable commercial capacity.
- [Functions limits](https://supabase.com/docs/guides/functions/limits): 2 seconds
  CPU per request, 256 MB memory and 150-second Free wall duration. This is 200x
  the documented Workers Free CPU allowance; it is **not** a measured speedup.
- [Function pricing](https://supabase.com/docs/guides/functions/pricing): 500,000
  included invocations on Free, no Free over-usage price listed. Stop at Free
  limits rather than upgrade or attach payment details.
- [Terms](https://supabase.com/terms) and pricing do not present Vercel Hobby's
  personal/non-commercial restriction. Commercial use appears compatible with
  the reviewed terms; this is not a legal guarantee or an SLA. Ordinary account,
  acceptable-use and data obligations still apply. The signup flow observed so
  far required no billing; project creation has not finished.
- [Backups](https://supabase.com/docs/guides/platform/backups): Free users should
  maintain external database exports; do not assume paid dashboard backup/PITR.
- [Clerk limits](https://clerk.com/docs/guides/how-clerk-works/system-limits): the
  development Backend API budget remains shared across the instance. Hosting
  changes do not remove the two live provider calls per operation.
- [Logging](https://supabase.com/docs/guides/functions/logging) and
  [shutdown metadata](https://supabase.com/kb/troubleshooting/edge-function-shutdown-reasons-explained):
  CPU evidence must come from platform events, not elapsed handler time.

See `MIGRATION.md` for the full migration/recovery scope and estimates.
