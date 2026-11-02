# Private authenticated Worker CPU investigation

## Manual Pro hosted follow-up — 2 November 2026

Source `cc98ed9`, measured API version `0be9322a-266c-4acf-85c0-d93ed5e2e9f5`.
Final cleanup restored the original tester secrets, producing API version
`a6bb68f5-c199-447f-8fa5-3b4dcdae2aa5` with the same application code. No public
Worker URL, paid service or production authentication was enabled.

Three synthetic Clerk accounts were administratively provisioned in the existing
development instance and signed in through the normal Clerk SDK with 60-second,
single-use sign-in tickets. No Testing Tokens or security protection bypass was
used. Sessions/JWTs were real, exact issuer/authorized-party and live provider
session/profile checks remained enabled, and roles/manual grants came from D1.
These are not registration/recovery/OAuth onboarding tests.

The member workspace held 11 presets (ten with 2 KB payloads) and ten 1 KB history
entries. Each run used one initial /me, 20 sequential /me reads and 100 mixed reads
at concurrency five, with 1.5-second gaps between batches and an additional 450 ms
per call. Paths: /me, /subscription, /pro/preferences, /pro/presets, /pro/history,
/account/export. Normal short-lived tokens refreshed through Clerk's SDK; no
expiry or revocation checks were removed. No overlapping fixture mutations/UI
navigation occurred during the measurement windows. Any non-200 stopped the run.

| Run | Observed HTTP | Analytics count | CPU p50 ms | p95 ms | p99 ms | Runtime errors |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| 1 | 121/121 200 | 116 | 4.295 | 7.231 | 7.817 | 0 |
| 2 | 121/121 200 | 120 | 4.279 | 6.493 | 8.671 | 0 |
| 3 | 121/121 200 | 127 | 4.506 | 6.802 | 7.764 | 0 |

Cloudflare adaptive analytics used timestamp windows padded by one second;
microseconds were converted to milliseconds. Counts are sampled/estimated and
differ from browser-observed counts. All groups had success outcome. No Clerk
503/throttling or HTTP failures occurred in these 363 requests. One analytics
query failed transiently and succeeded on retry; that was not a Worker failure.
Browser end-to-end medians were 576.5/577.5/593.5 ms, p99 685.9/671.4/674.2 ms,
including normal token acquisition/response parsing and excluding pacing sleeps.
Those latency values are not CPU measurements.

The observed p99 values fit 10 ms for these bounded read workloads. They do not
prove cold starts, maximum-size exports, write-heavy requests, cleanup or heavier
production load fit Free. Earlier occasional higher tails below remain relevant;
do not declare general Free-plan or production readiness. No new speculative
optimization or authorization cache was introduced.

54 functional/security checks passed (including server durations, real elapsed
expiry, direct grants, permanent revocation, post-admin-removal denial and expected
audits), plus eight real desktop/mobile form checks. A genuine unexpired JWT was
rejected with 401 after provider session revocation. Expiry was observed by
shortening only the exact disposable grant deadline, never changing the global
clock or genuine data. All three synthetic provider/D1 identities and access
grants were removed; original data and audit entries were preserved.

To keep evidence separate, `WORKER_CPU_OUTPUT` may select another JSON file under
ignored `.wrangler`; paths outside that directory are rejected. Raw sessions,
provider responses and fixture keys are local/ignored and are removed after use;
only sanitized results and owner-protected pre-migration backup are retained.

## Earlier investigation

Updated 2 November 2026. All hosted requests below used the existing restricted
Cloudflare staging origin, the approved real Clerk account and its normal browser
session. The public free-tools deployment was unchanged. No plan, billing or
payment setting was enabled.

## Changes and security invariants

- Reuse the stateless Clerk SDK client within an isolate, keyed by backend key,
  publishable key and issuer. Credential changes replace it. Disable optional
  backend SDK telemetry. No user, session, token decision or entitlement is cached.
- Retain Clerk's authenticateRequest session-token verification, authorized party,
  exact issuer/subject/session checks, staging tester allowlist, live provider
  session status/expiry, verified primary mailbox, banned/locked checks and gateway
  identity match on every authenticated request.
- Join immutable D1 identity state and account state in one fresh read. LEFT JOIN
  preserves deleted/deleting tombstones; disabled or missing accounts still fail
  closed. First provisioning retains collision-safe inserts and a fresh final
  authorization read. Existing-user reads fall from two to one, without caching
  roles or changing Pro/admin authorization.
- Provider failures fail closed. Throttling produces 503 with Retry-After=10;
  other dependency failures get a safe retry response. Logs contain only a status
  code, never exception bodies, credentials, tokens or account identifiers.
- The staging-only verification panel uses the normal Clerk SDK session. It adds
  no privileged API endpoints and exports no tokens. Public builds refuse private
  QA/authentication code. It can exercise free/Pro/admin denials, bounded reads and
  expired/revoked bearer checks, but never purchases or deletes an account.

## Method

Each paced read workload makes 121 real authenticated requests: one initial /me,
20 sequential /me requests and 100 reads in batches of five. Batches pause one
second to remain below Clerk development's 100 backend requests/10 seconds;
each API request still performs both session and profile checks. The mixed paths
are /me, /subscription, /pro/preferences, /pro/presets, /pro/history and
/account/export. Any non-200 response stops further batches.

Cloudflare workersInvocationsAdaptive CPU quantiles are microseconds, converted
to milliseconds. Queries use each browser report's timestamp interval with one
second padding. Adaptive analytics counts may differ from the 121 browser-observed
requests. Runtime error counts do not include caught HTTP 500/503 responses, so
the browser status checks are required alongside analytics.

The SDK-only comparison temporarily deployed the prior secure Clerk path from
6651d9a with the same Wrangler build/configuration and the same paced workload,
then restored the optimized API. No public Worker URL was enabled.

| Sample | Browser outcome | Analytics requests | CPU p50 ms | p95 ms | p99 ms |
| --- | --- | ---: | ---: | ---: | ---: |
| Original, unpaced, 1 November | Stopped on HTTP 500 | 71 | 10.004 | Not captured | 19.005 |
| SDK reuse, paced A | 121/121 HTTP 200 | 121 | 4.898 | 6.775 | 7.244 |
| Original, matched paced baseline | 121/121 HTTP 200 | 120 | 11.242 | 16.368 | 48.359 |
| SDK reuse, paced repeat | 121/121 HTTP 200 | 118 | 5.108 | 7.614 | 11.938 |
| SDK reuse + joined D1, populated workspace | 121/121 HTTP 200 | 124 | 4.117 | 6.953 | 10.476 |
| Additional imported-HMAC-key cache experiment | 121/121 HTTP 200 | 116 | 4.071 | 7.416 | 11.146 |

The SDK-only repeat exceeds the 10 ms target at p99; a good first sample is not a
reliable Free-plan pass. The joined-read candidate is measured separately with
ten 2 KB saved configurations and ten 1 KB history entries, rather than relying
only on an empty workspace. The additional HMAC import-cache experiment did not
provide consistent tail headroom and was removed. The retained SDK/D1 optimization
substantially improves CPU, but does not reliably meet the 10 ms p99 target. Keep
accounts restricted; do not launch the authenticated SaaS on this evidence.

## CPU profiles and error diagnosis

Run `node scripts/profile-auth.mjs` locally. It uses generated RSA fixtures and
synthetic provider/D1 responses, never real credentials. It writes V8 .cpuprofile
files and a summary under ignored .wrangler/profiling. Profiles identify SDK/API
client construction, optional telemetry initialization, parsing and RSA key
import/verification work. The synthetic 400-request comparison retains 400 live
session checks and 400 profile checks on both paths; D1 reads fall from 800 to 400.
Local elapsed times, JIT warm-up and synthetic I/O are not hosted Worker CPU proof.

The old HTTP 500 was caught by the application: analytics recorded a successful
runtime outcome and zero CPU-exhaustion errors. Clerk throttling is plausible
under the old concurrency rate, but its original exception was not safely logged,
so its exact provider cause is unproven. New safe status logging and 503 retry
responses distinguish future provider failures. A sanitized partial real-time tail
of the first optimized workload captured 49 HTTP-200/ok events and no dependency
failures or exceptions. No raw request headers or tokens were retained.

To query another isolated hosted interval:

```powershell
$env:WORKER_CPU_START = '2026-11-02T00:50:55.050Z'
$env:WORKER_CPU_END = '2026-11-02T00:51:46.546Z'
node scripts/staging-cpu.mjs
```

## Limits of the evidence and free fallback

These are controlled staging samples, not an SLA or proof that every cold start,
region, maximum-sized export, write, cleanup job or production load fits 10 ms.
Never remove revocation/profile checks, freeze rotating signing keys or weaken
password hashing to improve a benchmark. The legacy 600,000-iteration work factor
is unchanged. Keep authentication private until the remaining launch gates pass.

If the tail cannot stay below the Free limit with those checks, keep the proven
18-tool public Pages application and restrict accounts. A genuinely free backend
option to evaluate is Supabase Free Auth/Postgres/Edge Functions: the listed plan
is $0, includes 50,000 MAU and a 500 MB database, and Functions allow 2 seconds CPU
per request. Free projects can pause after inactivity and have usage quotas.
Migrating would require explicit architecture approval, porting D1 ownership and
entitlement constraints, and a server-side session-existence/revocation check;
accepting a signed unexpired JWT alone does not preserve immediate revocation.
Production email delivery also needs separate validation. No Supabase resource or
account was created, and no architecture migration was performed.

Sources: [Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/),
[Workers CPU analytics](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/),
[Clerk rate limits](https://clerk.com/docs/guides/how-clerk-works/system-limits),
[Supabase Free](https://supabase.com/pricing),
[Functions limits](https://supabase.com/docs/guides/functions/limits),
[session revocation](https://supabase.com/docs/guides/auth/sessions).
