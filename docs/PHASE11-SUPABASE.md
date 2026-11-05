# Phase 11 — isolated Supabase/Firebase experiment

## Phase 11.1 preparation — 5 November 2026

### Matched hosted benchmark — 5 November, 10:54–11:08 am Brisbane

**312/312 accepted requests; 156 per backend.** Three rounds/backend, each with
40 alternating account/populated-workspace reads and 12 mixed create/read/delete/
account operations. Same verified synthetic member, three baseline presets,
concurrency one, 1500 ms pacing, alternating backend order. All twelve intervals
were eligible and restored their exact baseline fixtures. Both final logouts
succeeded. No HTTP/authentication/authorization/rate-limit/dependency/CPU-limit
responses occurred in these intervals. Provider throttling has no independent
counter; do not equate absent observed failures with a provider-wide zero count.

| Backend (156 accepted requests) | Latency p50 | p95 | p99 | Maximum |
| --- | ---: | ---: | ---: | ---: |
| Cloudflare reference | 665 ms | 876 ms | 1247 ms | 1532 ms |
| Supabase direct Edge endpoint | 506 ms | 1249 ms | 3478 ms | 4930 ms |

Cloudflare direct realtime CPU coverage matched all 156 accepted requests exactly,
all status 200/outcome ok/nontruncated, version 26abd500-9bc2-491d-9912-1523c042818e.
Aggregate CPU p50/p95/p99/max: **7/10/19/21 ms**; **5/156 exceeded 10 ms**.

| Round/workload | CPU n | p50 | p95 | p99/max | Above 10 ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| 1 reads | 40 | 7 | 10 | 11 | 2 |
| 1 mixed | 12 | 6 | 21 | 21 | 1 |
| 2 reads | 40 | 8 | 9 | 10 | 0 |
| 2 mixed | 12 | 6 | 19 | 19 | 2 |
| 3 reads | 40 | 5 | 8 | 8 | 0 |
| 3 mixed | 12 | 6 | 8 | 8 | 0 |

CPU units are milliseconds, nearest-rank quantiles. Small mixed rounds make p95
and p99 the maximum. No Free-plan reliability claim is justified by these results,
even though no request returned a CPU-limit error. No authentication/revocation/
permission checks were removed or cached. No further speculative optimization.

The Supabase one-hour dashboard showed 235 invocations, average CPU 74 ms and
maximum CPU 252 ms. This is **an unfiltered platform aggregate including functional
and negative tests**, not accepted-only CPU benchmarking or per-round percentiles.
Supabase accepted-only CPU p50/p95/p99 remain unknown. Handler duration is wall time.
First requests here were not proven cold starts; no pause/resume rehearsal was run.

Current decision: **MORE TESTING REQUIRED; no migration or public-account launch.**
Supabase improved medians but had worse tails; the reference still exceeded the
10 ms target. Same-origin browser/proxy CPU, recovery/deletion, cleanup, full-schema
porting and operational recovery remain gates. Keep public/Clerk deployments.

### Local browser candidate

A separate synthetic-only console has no registration, OAuth or payment controls.
Firebase state stays in memory; reload requires sign-in again and cookies alone
never authorize. Real server keys are absent from its bundle. A returned preset ID
is validated; failed logout never claims server revocation. Accessibility found an
invalid label on the results panel, fixed with an explicit region role.

Hosted Supabase adds a __cf_bm cookie. The local proxy now discards only that
provider cookie, never forwards it, and retains strict validation of the sole
application cookie. Unknown/duplicate/unsafe application cookies still fail
closed. Regression test added. This proxy change is NOT deployed yet.

Local validation: 253 unit/integration tests, 6 desktop/mobile browser tests
(including axe), typecheck and lint pass. Earlier operator-order and extra-cookie
failures remain in ignored raw evidence; the corrected cases passed. Benchmark
intervals contain none of those failed/rejected setup requests.

### Keyless provider validation checkpoint

CI for 2971802 passed: https://github.com/RandomToolsHQ/RandomTools/actions/runs/41885580607.
The owner approved a two-hour keyless setup. Google rejected the originally
proposed service-account name (over 30 characters) before creating that account.
The owner then explicitly approved the corrected identity
`rt-phase111-auth-tests@randomtools-supabase-auth-poc.iam.gserviceaccount.com`.
The two exact custom roles/bindings were created with expiry
2026-11-05T02:30:00Z (12:30 pm Brisbane). IAM/IAM Credentials APIs were enabled
after verifying billing disabled and unattached. No permanent keys were created.
Initial mint requests returned 403 during propagation; a later 900-second token
succeeded and stayed in Cloud Shell. These are not benchmark samples.

Recorded run `phase11-ac0da51f-e5e6-4d61-bec5-6b192eb80b27` contains three new
synthetic users only. Real official verification links succeeded for all three;
reusing each consumed action failed. All three verified password sign-ins and
owned provider lookups succeeded. Disabling the `other` tester caused its prior
ID token to be rejected; it was re-enabled, then provider-wide revocation also
caused the old token to be rejected. These are provider checks, not application
authorization, browser recovery or CPU evidence. Application fixtures have not
been seeded at this earlier checkpoint; the later approved API activation seeded
exactly the recorded identities and audited temporary roles/grants. Temporary IAM
cleanup remains pending while controlled tests run.

`phase111-keyless*.py` and `phase111-remote*.py` are scoped operator harnesses,
separate from the old Firebase POC. Fifteen offline guard tests pass under Python
optimization. The new name-length regression fails before any cloud access.
`phase111-fixtures.mjs` refuses an existing ledger; client sessions stay ignored
and owner-restricted. Existing genuine accounts are never accepted by the harness.

### Approved resource setup completed

The owner separately approved Spark creation and the restricted Cloudflare reference.
Created Firebase `randomtools-supabase-auth-poc` (771458729298), Spark $0/month,
with web app `randomtools-phase111-tests` and email/password only. Analytics,
Gemini, Google OAuth and billing remain off. Public web configuration is stored
in ignored local storage; no service-account key was generated.

Created D1 `randomtools-phase11-baseline` (`a5985c4e-884f-4238-b641-28a1e7c13928`),
verified empty before schema application, served from SYD. Created Worker version
`d31782ae-2a6c-4b30-a573-51b01db25412`, workers.dev and preview URLs disabled.
Pages deployment `0a5693c6` uses branch `phase111-test`, no Git connector, and binds
only the new D1 and Worker. No provider or gateway secrets are set. Root, register,
admin, API and asset probes all returned 503 with private/no-store at
`https://randomtools-phase11-baseline.pages.dev`. This is an intentionally disabled
reference, not an authenticated benchmark deployment. Existing environments remain unchanged.

The new Supabase runtime and browser gateway below remain local candidates, not
deployed at that initial checkpoint. Subsequent separate approvals enabled API-only
testing and the exact Supabase candidate d492d51a09b4040aefc19fd695c451fe0ade9859047ce22cb29172e329f3b6e8.
The prior c09a1d83 bundle was copied from the visible editor and hash-verified for
rollback. The legacy JWT gate was turned off under approval; all custom test/Firebase/
live-session/permission controls remain. API activation expires 12:25 pm Brisbane.

**MORE TESTING REQUIRED. Hosted accepted authentication/benchmarks are incomplete.**
Resumed 619803c; [its full CI passed](https://github.com/RandomToolsHQ/RandomTools/actions/runs/41814971977).
Read-only checks confirm the existing Supabase legacy JWT gateway is ON, there are
no custom secrets, and existing Cloudflare deployment IDs are unchanged. No new
project, IAM, hosted deployment or secret change is authorized by Phase 11.1 alone.

### First approval: separate Firebase project

Proposed exact ID/name: `randomtools-supabase-auth-poc`, Spark, connected RandomTools
Google account, no organization/billing account. Google console shows **11 remaining
project slots**; Firebase lists one existing project and accepts the draft ID.
This is observed eligibility, not reservation or guaranteed successful creation.
Public Spark pricing explicitly requires no payment method. New project creation
does not change the existing project's users, keys, quotas or settings.

Proposed configuration: one test web app; email/password only; Analytics, Gemini,
Developer Programme, Google OAuth, Identity Platform upgrade and paid APIs off.
No Firestore, Storage, Cloud Functions or service-account private key. Planned test
origins: loopback 127.0.0.1 and the new Phase 11 Pages hostnames below. Registration
is not published; application access remains an explicit three-UID allowlist. A
public Firebase API key is not itself a provider-side signup allowlist, so do not
claim it prevents all provider registrations. Stop on billing/new terms/security
verification. This proposal was subsequently approved and created as recorded above.

References: [Spark](https://firebase.google.com/pricing),
[project quotas](https://firebase.google.com/docs/projects/learn-more),
[Auth quotas](https://firebase.google.com/docs/auth/limits).

### Approved reference profile — deployed with secrets unset

Cloudflare account: `5c172e2e4c51cfc7dc512c96825b2912`.

| New resource | Exact configuration |
| --- | --- |
| D1 randomtools-phase11-baseline | New empty schema from current migrations + Firebase POC session schema; unique randomtools-phase11-reference-v1 isolation marker. Oceania location hint oc, not a location guarantee. |
| Worker randomtools-phase11-baseline-api | Current Firebase API verification/session/D1/Pro/admin code; workers.dev and preview URLs off. New D1 binding only. |
| Pages randomtools-phase11-baseline | randomtools-phase11-baseline.pages.dev; service binding only to the new Worker and GATE_DB only to the new D1. Test branch phase111-test, no Git connector. All assets/routes gated. |

Pre-creation inventory showed two existing D1 databases (Free limit ten) and the
original three Pages projects. The approved names were available and created.
Preserve genuine D1 24d38e43-b765-4d21-b713-fce893d7317d and Firebase POC D1
caf619cb-a7c4-46fe-b5ac-c8245827d16a. Before any remote migration, verify returned
new database ID/name/account and empty app schema; never substitute either old ID.
Generated configs deliberately contain all-zero database IDs until explicit setup.

`scripts/phase111-build.mjs` builds locally only, with a substitution manifest and
hashes. API logic is unchanged except the new isolation marker. Pages additionally
uses the new Firebase auth domain and fixes two credential-form policies: preserve
the built-in restrictive form CSP and use Referrer-Policy same-origin on that form.
Native Chromium reproduced Origin:null with no-referrer; accepting null is NOT the
fix. Exact Origin checks remain. Existing hosted/reference source files are not
modified by generation. Wrangler dry-run passes; no deployment is implied.
Initially no test credentials/provider secrets are set, so routes fail closed.
Secret configuration, Firebase/IAM and the separate Supabase browser gateway are
not covered by this reference-resource profile. Persistent-resource deletion needs
separate approval; synthetic fixture cleanup is scoped to recorded UIDs/IDs only.

### Supabase configuration approval still required

The existing legacy JWT gateway accepts Supabase legacy JWTs, not Google Firebase
ID tokens. A proposed later change turns that legacy check OFF only after an
approved, validated candidate and exact synthetic UID configuration are ready.
This removes a platform filter; it does not remove application authentication.
Mandatory controls remain: 256-bit server access key, named tester hash bound to
the signed staging identity, Firebase RSA/issuer/audience/expiry/verified-mail/live
revocation/disabled lookup, owned app session, fresh Postgres Pro/admin checks,
exact Origin, body limits and distributed rate limits. Anonymous preflight cannot
access data. No service credential is sent to browsers.

Local candidate now requires x-poc-tester = SHA256(allowlisted verified email),
set by the trusted proxy/operator, not browser input. With the upstream key kept
server-side, a tester cannot combine their gateway session with another tester's
token/cookie. It also requires POC_TEST_EXPIRES_AT, an integer Unix deadline at
most two hours ahead. Missing, expired or overlong leases fail closed. These are
**local changes only**; the deployed 75c8e9b artifact is still unchanged and locked.

Later approval must name candidate commit/hash, exact synthetic UIDs/emails,
POC_ORIGIN, secret names/recipients, deadline and rollback. Set POC_ENABLED last;
remove it first on failure. The new custom secret names are POC_ENABLED,
POC_PROJECT_REF, POC_ORIGIN, POC_ACCESS_KEY, POC_RATE_SECRET, POC_TESTERS,
POC_TEST_EXPIRES_AT, FIREBASE_PROJECT_ID, FIREBASE_WEB_API_KEY. The runtime service
credential stays server-side. The owner subsequently approved this exact bounded
configuration; it is active only for the recorded synthetic run pending cleanup.

### Keyless lifecycle authorization — approved and temporarily active

Fresh scoped approval was requested for project 771458729298 and
the corrected rt-phase111-auth-tests@randomtools-supabase-auth-poc.iam.gserviceaccount.com.
Proposed Auth permissions: firebaseauth.users.get, users.sendEmail, users.update,
users.delete. Operator randomtoolshq@gmail.com gets only iam.serviceAccounts.getAccessToken
on this service account, with conditional two-hour grants and 15-minute impersonated
tokens. Any API enablement/Cloud Shell source authorization must be disclosed too.
No permanent key, exported source credentials, ADC refresh token or reused old IAM
grant. These privileges cover every provider user in the new project; the harness
must accept only recorded synthetic UIDs. Cleanup removes bindings/account/custom
roles/tokens, verifies denial and baseline policy, deletes only synthetic fixtures
and ends the privileged session. No actual new IAM action has been attempted.

### Local same-origin gateway — separate later deployment approval

Candidate: randomtools-phase11-supabase.pages.dev with a new small D1
randomtools-phase11-gateway for staging rate limits/isolation only. It is not
created. The worker reuses the real named HMAC staging gate, forces a fixed upstream
URL, overrides forged access/tester headers, forwards only the app cookie and JWT,
rejects redirects, limits request/response bytes and rejects unsafe Set-Cookie.
Secure/HttpOnly/SameSite=Strict app cookies become first-party on Pages. The upstream
access key is never a frontend setting. Browser app calls only /api/phase11.

Desktop/mobile fixture tests exercise the real HMAC gate and native cookie jar,
HttpOnly visibility, reload persistence, cross-site Strict-cookie omission and
logout removal. All traffic is intercepted; provider replies are synthetic. The
mock transport asserts a 303/cookie and follows it manually because Playwright
interception does not cover automatic redirect chains. This is not real hosted
Firebase, redirect/TLS, recovery or session-revocation evidence. Hosted gateway
approval comes only after API-only hosted validation; do not publish this fixture.

### Benchmark and capacity preparation

The harness now verifies the recorded email and immutable user ID, sends the named
tester binding, accepts only the planned test origin/loopback, and separates maximum
successful latency from maximum attempt latency. Rejected authentication can never
produce a successful maximum/percentile/CPU sample. Auth/authorization denials,
application rate responses and unclassified dependency failures are counted
separately. Provider throttling remains unknown without supporting evidence.
Do not label unclassified 503 as a definite database failure or provider throttle.

Three rounds/backend remain 40 reads + 12 mixed operations each, concurrency one,
1500 ms gaps, identical 512-character JSON payloads and exactly three recorded
owned presets. Include unmeasured pre/postflights and logout in quota budgets.
Original D1 preset mutations lack the candidate's transactional audit writes; this
is a documented semantic/SQL-count difference, not an exactly identical database
benchmark. Measure both direct API/backend and later proxy paths separately. All
CPU/platform-isolate granularity and forced-cold limitations still apply.

Capacity estimates use the prior 20 calls/day/user, 30-day month, 10% invocation
reserve, 6 KiB base egress/call and 200 KiB app data/user assumptions:

| Daily users | Monthly calls incl. reserve | Base egress before reserve | App storage | Invocation quota |
| --- | ---: | ---: | ---: | --- |
| 100 | 66,000 | 0.369 GB | 20.5 MB | Fits nominally |
| 500 | 330,000 | 1.843 GB | 102.4 MB | Fits nominally |
| 1,000 | 660,000 | 3.686 GB | 204.8 MB | Exceeds 500,000 |
| 5,000 | 3,300,000 | 18.432 GB | 1,024 MB | Exceeds multiple quotas |

These are not measured capacity. Each accepted API call requires one live Firebase
lookup: roughly 60k/300k/600k/3m per month before retries and login/recovery. Average
rates do not predict burst throttling. Assume 1% new signups and 1% password resets
per daily cohort: about 1/5/10/50 verification and reset mails/day, within Spark's
published 1,000 verification and 150 reset/day budgets; malicious demand can exhaust
them. Signup limit is 100/IP/hour; token exchange and provider lookup have separate
minute quotas. Do not activate Identity Platform (its Spark DAU rules differ) or SMS.
If daily users are all new rather than recurring, identity/email budgets differ.
Cloudflare's 100k/day account limit leaves no overhead at 5,000*20 external calls;
CPU reliability is already an independent blocker. Do not double-count internal
service-binding billing without checking actual platform accounting.

Supabase Free still has a 500 MB database, 5 GB uncached egress, inactivity pausing
after low activity over a week, no uptime SLA and off-site manual backup needs.
The documented pause restore window is one year; this is not a tested recovery
guarantee or substitute for exports. No keepalive scheme or paid upgrade. Cold
startup costs/availability and regional latency remain unmeasured. See current
[pricing](https://supabase.com/pricing), [pausing](https://supabase.com/docs/guides/platform/free-project-pausing),
[D1 limits](https://developers.cloudflare.com/d1/platform/limits/),
[location hints](https://developers.cloudflare.com/d1/configuration/data-location/)
and [Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/).

## Approved hosted setup update

The owner subsequently approved Supabase setup only. Schema rt11 and its three
server-only RPCs now exist in the existing Free Sydney project. Catalog verification
confirmed seven enabled+forced RLS tables, no direct browser/runtime table grants,
correct RPC execution grants and the isolation marker. The exact reviewed SQL was
executed transactionally after a zero-collision preflight. Supabase's scanner did
not recognize RLS enabled in the DO block; catalog verification confirmed it.

The disabled-by-default function `randomtools-phase11` is deployed at
https://ijlohzzqszyhncglqsfq.supabase.co/functions/v1/randomtools-phase11 from source
75c8e9b. Local bundle SHA256:
c09a1d83e8f523301bb02a4f24aa6052359f17d5fea4a9de82c9f1cabc120bc0.
Deployed source was retrieved and matched after line-ending normalization. The
additional legacy JWT gateway remains enabled and no custom secrets exist. All
three negative HTTP probes returned 401. Dashboard timings/zero CPU for rejected
requests are excluded from performance evidence; the real authenticated handler
path has not been exercised. Do not infer CPU compliance or successful cold starts.

`experiments/supabase/hosted-smoke.sql` passed on actual hosted Postgres and in
PGlite. It requires the empty rt11 namespace, creates explicit synthetic fixtures,
checks client/runtime role denial, Pro/admin/ownership/session/audit behavior, then
rolls back. Hosted postflight users/sessions/grants/presets/audit rows all returned
zero. No Firebase users/provider verification or deletion were involved. This is
database integration evidence, not end-to-end Firebase validation.

No enable flag, tester key or provider configuration was stored; no permanent keys,
new IAM or billing were used. Preserve the approved schema/function; resource
deletion needs approval. Existing public/Clerk/Firebase deployments and D1 remain
unchanged. Separate Spark creation, later keyless permissions, matched reference
clone, browser cookie boundary and real accepted workloads remain pending.

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
The final targeted suites passed 46 tests; an earlier full local run passed 221
tests before the final credential-error redaction guard was added. Final CI runs
the expanded regression suite. A subprocess regression confirms malformed local
credential JSON never appears in benchmark errors. No real credentials were used.
An additional regression verifies admins can revoke a disabled member's grant,
cannot grant them new Pro, and re-enabling the account does not restore revoked Pro.
The bundled JavaScript artifact is checked by Deno; strict source types are checked
by TypeScript. The emitted-entry smoke host supplies an empty Deno environment and
verifies fail-closed responses without network/cloud access. CI never deploys it.
It also verifies a fully configured synthetic environment reaches the key gate.
Deployment variables are POC_ENABLED, POC_PROJECT_REF, POC_ORIGIN, POC_ACCESS_KEY,
POC_RATE_SECRET, POC_TESTERS, FIREBASE_PROJECT_ID and FIREBASE_WEB_API_KEY. Only
the built-in SUPABASE_SERVICE_ROLE_KEY is read; never create custom secrets with
the reserved SUPABASE_ prefix. Start with POC_ENABLED unset until review is complete.

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
not the current Firebase POC. That clone and separate Firebase identities are not
provisioned. The Supabase function exists but remains unconfigured. No new hosted
comparison is claimed. Existing
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

Supabase setup approval was received and applied as recorded above. Separate Spark
and Cloudflare reference creation were subsequently approved and completed.
Those approvals do not authorize a new Google IAM grant,
permanent key, production migration or secret activation. Hosted
verification needs fresh, separately approved short-lived keyless privileges in
the new project; earlier grants were removed. Resource deletion requires approval.
After tests remove recorded synthetic users/grants/data, tokens and temporary
permissions, verify policy and fixture counts, preserve minimal audit evidence.
No synthetic records or temporary credentials remain. Keep the approved rt11
schema/RPCs and disabled function; do not delete these cloud resources without approval.
