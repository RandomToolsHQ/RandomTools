# Phase 11 — isolated Supabase/Firebase experiment

## Decision and evidence, 4 November 2026

**MORE TESTING REQUIRED. No migration or public launch is approved.**
Branch `codex/phase11-supabase-poc` starts at verified bfd3811. The earlier
`codex/supabase-free-poc` was reviewed, not merged: it used Clerk, archived
subscriptions and a larger schema. This slice retains Firebase and manual grants.
The existing Free Sydney project `ijlohzzqszyhncglqsfq` is healthy and showed no
recorded migrations. Inspection was read-only. No Supabase resources, grants,
secrets or schemas were created/changed during local preparation.
The Table Editor subsequently confirmed no public tables/views and no rt11 schema.

Public Pages 81de8536-ed2f-4204-941b-ada7fcba1c2a, Clerk Pages
5d3c61a8-a658-409a-941d-1a07147dcfd6, Firebase Pages
bbf58e34-9d62-47c8-b775-8384b8b5e38e and Firebase Worker
9315cec5-3272-4bfc-b454-e609e3f38cdf were rechecked unchanged. Existing Firebase
D1 remained at zero synthetic users/grants/sessions; no writes were performed.
Founder, genuine D1, 21 free tools, 13 planned Pro tools and the vault are untouched.

## Existing CPU evidence, not a Supabase measurement

Phase 10 accepted 120 reads and 36 mixed requests, all successful. Mixed traces
exceeded Workers Free's 10 ms on 17/36 requests. Ordered matching of the sequential
mixed attempts to exact trace windows gives:

| Path | n | CPU median | p95/max | Above 10 ms |
| --- | ---: | ---: | ---: | ---: |
| POST presets | 9 | 12 ms | 17 ms | 7 |
| DELETE presets | 9 | 11 ms | 17 ms | 5 |
| GET populated presets | 9 | 10 ms | 15 ms | 4 |
| GET profile | 9 | 9 ms | 11 ms | 1 |

These are request-level observations, not internal-stage CPU profiles. Source
review shows gateway verification, two rate writes, RSA verification, live Google
lookup, identity mapping, session read, fresh Pro query and operation SQL on each
request. Async waiting is not CPU; serialization/verification/parsing/driver work
can be. No measurement isolates their individual costs. No controls were removed.
See [full original evidence](../PROGRESS.md#hosted-firebase-validation-completed--4-november-2026).

## Current official free-tier review

Reviewed 4 November 2026. Published limits are not measured performance or an SLA.

| Area | Free constraint / consequence |
| --- | --- |
| Edge runtime | 2 seconds CPU/request, 256 MB memory, 150 seconds worker wall lifetime and request idle timeout. Much larger CPU budget; not proof of speed. |
| Invocations | 500,000/month; errors and preflights require budget too. Do not upgrade on exhaustion. |
| Database | 500 MB/project, shared CPU and 500 MB RAM on Nano. Actual connection settings must be inspected before load. The current dashboard showed 60 connection capacity; this is not a client concurrency guarantee. |
| Networking | 5 GB uncached and 5 GB cached egress; dynamic private API responses are not cacheable. Select Sydney execution near the database and measure actual routing. |
| Availability | Two active Free projects across owner/admin organizations; inactivity can pause a project after a week; community support and no uptime SLA. No keepalive scheme to evade pausing. |
| Backups | Free requires regular off-site exports; paid scheduled backup/PITR must not be enabled. Rehearse restore in an isolated local database. |
| Auth | Firebase Spark retained. Supabase third-party Auth integration is not enabled; service-held RPC authentication does not itself implement Firebase session revocation. |
| Commercial use | Reviewed terms do not impose a personal-use-only restriction; obligations still apply. This is an engineering review, not legal advice or a reliability guarantee. |
| Billing | Existing organization visibly Free. No card, billing activation, paid trial, add-on or upgrade was entered. Hosted setup must stop on any unexpected financial requirement. |
| Logging | Platform invocation logs can contain headers/bodies. Never export raw invocation logs; restrict console access and assess provider retention before real accounts. App code emits no tokens, body or identity logs. |

Primary references: [runtime](https://supabase.com/docs/guides/functions/limits),
[function quota](https://supabase.com/docs/guides/functions/pricing),
[plans](https://supabase.com/pricing), [billing](https://supabase.com/docs/guides/platform/billing-on-supabase),
[connections](https://supabase.com/docs/guides/database/connecting-to-postgres),
[connection management](https://supabase.com/docs/guides/database/connection-management),
[backups](https://supabase.com/docs/guides/platform/backups),
[Firebase integration](https://supabase.com/docs/guides/auth/third-party/firebase-auth),
[logs](https://supabase.com/docs/guides/functions/logging),
[terms](https://supabase.com/terms).

## Security boundary and request flow

Future restricted same-origin Pages frontend/gateway -> Edge Function -> live
Firebase verification -> parameterized PostgREST RPC -> private Postgres schema.
The current artifact is API-only; no new frontend or gateway has been deployed.
Do not reuse/change an existing Pages project for this experiment.

`experiments/supabase/core.ts` reuses the existing Firebase verifier unchanged:
RS256, issuer/audience/expiry/iat/auth_time, verified email, no tenants, allowlisted
subject and matching live mailbox. Live Google lookup runs on every request and
rejects revoked, disabled and deleted accounts. Only public signing keys cache.
The fixed separate project `randomtools-supabase-auth-poc` prevents accidental use
of the existing Firebase POC. Subject extraction before signature verification
only selects an allowlist entry; it cannot authorize a request.

Exact Origin and a separate 256-bit gateway key are required before provider calls.
POST JSON is streamed with a 16 KiB cap and fatal UTF-8 decoding. Global 20/10 s and
user 60/min distributed gates bound test traffic. JWT plus an owned application
session is mandatory; sessions expire after 30 minutes, bootstrap requires recent
sign-in, and logout invalidates every app session and old auth_time. Session cookies
are Secure/HttpOnly/SameSite=Strict with a __Host prefix. A cross-origin browser
cannot be assumed to send these cookies to supabase.co: a separately approved
same-origin restricted proxy is required for hosted browser validation. The CLI
backend comparison can send cookies explicitly; that is not browser-flow proof.

Schema `rt11` has seven minimal tables: isolation marker, immutable synthetic
users, sessions, grants, presets, audit and rate counters. Synthetic mailbox CHECK,
unique subject/email, FKs and indexes apply. No automatic email linking/provisioning.
Rows must be explicitly seeded from recorded synthetic UIDs. No admin promotion
endpoint exists. All account/grant mutations lock fresh account rows in the same
transaction as auditing; current role and grant expiry/revocation govern access.
Grant operations serialize against target users; transient deadlocks fail closed
and require a bounded caller retry, never an authorization bypass.

All tables have RLS/FORCE RLS and no direct grants to PUBLIC/anon/authenticated or
runtime service_role. The three fixed-search-path SECURITY DEFINER RPCs expose only
reviewed operations; EXECUTE is revoked from clients and granted to server role.
HTTP requests never pass user-supplied SQL/URLs/issuer/owner/role as trusted values.
Runtime service credentials remain intrinsically powerful elsewhere in Supabase;
this is an isolated-project compromise, not a claim that service_role is a narrow
cloud credential. A future dedicated database role would need explicit approval.

Deletion is deliberately not described as a distributed atomic transaction:
Postgres first tombstones/revokes and cleans owned data, then Firebase deletion
runs with the user's recent ID token, then a nonce-bound RPC records confirmation.
A provider/finalization outage leaves access denied and durable pending evidence.
Operator reconciliation remains required before production; a partial deletion
must not be reported as complete. Admin deletion is denied. No payment endpoints,
subscriptions, checkout or IP lookup are exposed by this slice.

## Local execution and tests

```
npm ci
npm run typecheck
npm run lint
npm test
node scripts/supabase-phase11-build.mjs
npx --yes deno@2.9.6 check .wrangler/phase11/supabase/functions/randomtools-phase11/index.js
node scripts/supabase-phase11-smoke.mjs
```

PGlite 0.5.15 executes real Postgres/PLpgSQL in WASM, including RLS/grants and
transaction rollback. It does not establish hosted PostgREST roles/pool concurrency,
networking, regional routing, CPU, shared capacity or true cold starts. Its concurrent
calls exercise queued transactions, not multiple independent hosted connections.
JWT tests use actual RSA signatures with synthetic keys/provider responses.
The final targeted suites passed 45 tests; an earlier full local run passed 221
tests before the final credential-error redaction guard was added. Final CI runs
the expanded regression suite. A subprocess regression confirms malformed local
credential JSON never appears in benchmark errors. No real credentials were used.
The bundled JavaScript artifact is checked by Deno; strict source types are checked
by TypeScript. The emitted-entry smoke host supplies an empty Deno environment and
verifies fail-closed responses without network/cloud access. CI never deploys it.

## Matched workload preparation

`scripts/supabase-phase11-benchmark.mjs` reads only ignored
`.wrangler/phase11/benchmark-credentials.json`. Never pass credentials as CLI args.
Use the same verified synthetic identity in both isolated backends, exactly three
recorded owned baseline presets, fresh normal ID tokens/app sessions, matching
payloads, concurrency 1 and 1500 ms gaps. Per backend: three 40-read samples and
three 12-operation mixed samples (create/list/delete/profile); alternate backend
order per round. Header/JSON protocol normalization is explicit. Every result must
match the expected owner and recorded fixture IDs; stop on failure. Failed and
rejected auth requests never enter successful CPU samples. Cleanup deletes only
new IDs returned by that run and logs out both backend sessions.
An unmeasured postflight verifies exactly the original three preset IDs; a DELETE
success message alone cannot establish cleanup. Dependency failure leaves cleanup
unverified and the sample ineligible, even if earlier HTTP requests succeeded.

The harness targets only a new `randomtools-phase11-baseline.pages.dev` reference,
not the current Firebase POC. That clone, separate Firebase identities and Supabase
deployment are not provisioned. Thus no new hosted comparison is claimed. Existing
historical measurements remain a baseline, not a matched latency comparison.
The Postgres slice audits preset mutations while the original POC did not; review
that operation-count difference before claiming an exactly matched DB comparison.

Reports separate latency p50/p95/p99/max, successes/failures and CPU-limit errors.
Provider throttles stay unknown without correlated provider metadata. Server-Timing
is wall duration only. Supabase Boot/Shutdown events can establish startup/shutdown
reason and isolate CPU; never divide shared-isolate totals into per-request p99.
Record platform CPU only at its actual granularity, otherwise report unavailable.
An initial/idle request is not forced-cold evidence. One-week automatic pausing
cannot be proven in this session; pause/resume rehearsal needs separate approval.

## Capacity estimates, not benchmarks

Assume 30 days, the same active users daily, 20 authenticated API calls/user/day
including ordinary session activity, 6 KiB aggregate uncached egress/call, and
200 KiB app data/user including ten 2 KiB presets plus an estimated month's audit,
identity and index overhead. Excludes platform baseline, off-site backups, abuse,
OPTIONS, extra provider traffic and export spikes; reserve at least 10% overhead.

| Daily users | Monthly calls | With 10% overhead | Egress estimate | App database estimate | Fit |
| --- | ---: | ---: | ---: | ---: | --- |
| 100 | 60,000 | 66,000 | 0.369 GB | 20.5 MB | Plausible quota fit; performance unmeasured |
| 1,000 | 600,000 | 660,000 | 3.686 GB | 204.8 MB | Exceeds function quota |
| 5,000 | 3,000,000 | 3,300,000 | 18.432 GB | 1,024 MB | Exceeds function, egress and database budgets |

Egress figures precede the 10% safety reserve. Monthly invocations constrain this
model to roughly 757 daily users at 22 calls/day; not a reliability promise.
Daily identities being different instead of recurring changes MAU consumption.
Firebase verification/reset quotas and provider abuse controls remain separate.
The 500 MB cap is persistent; audit retention/compaction must be explicitly designed
before lasting real accounts, not silently deleted to stay free.

## Architecture comparison and next gates

| Option | Benefit | Risk / effort | Decision |
| --- | --- | --- | --- |
| Workers+D1+Firebase | Existing tested ownership, gateway, rollout and recovery | Reliable mixed CPU remains unproven at 10 ms | Keep operational, no public auth launch |
| Edge+Postgres+Firebase | 2 s CPU budget; SQL transactions/locking; same Auth provider | Unmeasured latency/CPU, inactivity pause, manual backups, extra project secrets, SQL port | MORE TESTING REQUIRED |
| Pages same-origin proxy + Edge/Postgres | Supports secure first-party cookies, retains Pages frontend | Additional network hop; gateway CPU and failure path must also be measured | Justified only for restricted browser boundary |
| Edge proxy back to existing D1 API | Little migration effort | Retains failing CPU path and adds hops | Reject |

Estimated full migration after a successful slice: 5–10 developer days for the
database/API port and reconciliation, plus 2–4 days for rollback/restore/migration
rehearsals and hosted validation. This is a planning estimate, not authorization.
The 15 original tables (users, sessions, email_verification_tokens,
password_reset_tokens, subscriptions, payment_events, membership_claims,
user_preferences, saved_presets, tool_history, audit_logs, rate_limits,
tool_availability, usage_daily, auth_identities) plus later pro_requests/pro_grants
and favourites require a full inventory. Archive inactive payment history; do not
enable it. Convert SQLite syntax/epoch fields/JSON and D1 batches to Postgres
transactions; retain immutable issuer+subject mappings, Founder safeguards,
manual approvals, cleanup, signed deletion webhook replay protection and audit
retention. Rehearse exports/restores; no genuine data is copied by this POC.

Pending owner approvals cover only prepared Supabase schema/RPC/isolated-function
setup and a separate Spark project. They do not authorize a new Google IAM grant,
permanent key, production migration or new Cloudflare reference clone. Hosted
verification needs fresh, separately approved short-lived keyless privileges in
the new project; earlier grants were removed. Resource deletion requires approval.
After tests remove recorded synthetic users/grants/data, tokens and temporary
permissions, verify policy and fixture counts, preserve minimal audit evidence.
No cloud cleanup is currently required because no hosted changes were made.
