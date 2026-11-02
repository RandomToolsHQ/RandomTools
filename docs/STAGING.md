# Cloudflare staging — current deployment

## Pending free-first branch (not deployed)

`codex/manual-pro-access` adds manual Pro requests/grants and hard-disables paid
flows. Existing hosted deployments still run `ab76f00`-era code; none of the new
UI, routes or migration has been deployed. Keep this distinction when interpreting
older hosted payment/entitlement QA evidence below. Local tests use synthetic
accounts only. See [ADMIN-SETUP.md](ADMIN-SETUP.md) for the new workflow.

A future isolated staging update must apply migration 0004, deploy the matching
API/frontend together, keep the existing gateway and Clerk subject restrictions,
then verify anonymous denials, real hosted request/grant/revocation flows and CPU.
Historical paid subscriptions are not automatically converted into manual grants.
No production deployment, billing activation or domain purchase is authorized.

Updated 2 November 2026. The owner explicitly chose zero spending and free
Cloudflare-managed addresses. No purchased domain is needed for this preview.

## Working public preview

https://randomtools-preview.pages.dev

Cloudflare Pages project: `randomtools-preview` (Direct Upload, Free account).
This is a tools-only staging site, even though Cloudflare labels its stable
Direct Upload environment "Production". It is not a public account service.

Current application source: `4cff6cc78aaba094a83fdd2137ab8ed29507b085`.
Deployment: `d1c4fd47-296d-4b2f-b6a5-28ed82c7ba34`; immutable preview:
https://d1c4fd47.randomtools-preview.pages.dev/. All 40 hosted public browser
checks passed after this update. PROGRESS.md records the artifact hash and evidence.

Safe to test: all 18 browser tools, directory/search, local favourites, downloads,
image compression, hashing, dark/light themes, mobile layouts and informational
pages. Tool inputs remain in the browser. No public accounts, server saves,
admin console, Pro workspace, analytics collection or live payments are available.

Security boundary:

- The public build aliases the authentication/account modules to safe stubs.
  It contains no Clerk SDK, development keys or Pro workspace module.
- `public-staging/wrangler.toml` declares no API service, D1 or secret bindings.
- The public Pages Worker denies every `/api` request with JSON 403 and no-store.
  Supplying cookies or bearer tokens does not change this response.
- Private routes display a restricted-testing notice instead of account forms.
- Hosted CSP, frame denial, nosniff, no-referrer, HSTS and noindex are verified.
  robots.txt disallows crawling. Noindex is not the account security boundary.
- Pages Functions are configured to fail closed if the free allowance is
  exhausted. The dashboard confirms no application bindings or secrets.

## Controlled authentication testing

Clerk development issuer: `https://quiet-civet-8782.clerk.accounts.dev`.
The existing Hobby development instance is invite-only. No paid allowlist,
passkey, MFA or other paid feature was activated. The API independently requires
an explicitly approved Clerk subject ID in `CLERK_TESTER_IDS` in staging mode;
missing configuration denies all testers. Never grant admin/Pro access by email.

Private origin: https://randomtools-web-staging.pages.dev/__staging

The separate private Pages frontend is deployed (`1a09193f`), protected by the
owner-approved zero-billing gateway. The API `randomtools-api-staging` is deployed
as version `a30f8ebf-bac9-42fc-9eb9-b9206829e0e1`. Both workers.dev and version
preview URLs are disabled; the frontend uses a service binding. Do not upload
`staging/dist` to the public tools project or give the public project API bindings.

`wrangler.staging.toml` uses AUTH_PROVIDER=clerk, ENVIRONMENT=staging and exact
APP_ORIGIN=https://randomtools-web-staging.pages.dev. Payments remain disabled.
Wrangler OAuth is complete and stored encrypted with Windows Credential Manager.
The replacement development backend key is Git-ignored and validated (HTTP 200).
Worker secrets include CLERK_SECRET_KEY, CLERK_WEBHOOK_SIGNING_SECRET,
CLERK_TESTER_IDS, RATE_LIMIT_SECRET and the two gateway secrets. Tester subjects
contain only the explicitly approved, verified tester's immutable Clerk subject.
Actual tester identifiers remain in secret configuration, outside Git.

Cloudflare Access onboarding required billing authorization and was not activated.
The approved alternative does not replace Clerk authentication:

- Named random 256-bit gateway keys; only SHA-256 fingerprints are configured
  remotely. Grants are limited to approved mailboxes and expire after seven days.
  This is not human-password hashing; legacy password strength is unchanged.
- Signed 30-minute `__Host-rt_staging` Secure/HttpOnly cookies with SameSite=Lax,
  exact issuer/audience/hostname and a current, unexpired tester fingerprint.
  Removal or key rotation revokes existing gateway sessions.
- All private assets, pages and API paths pass through the Pages Worker. The API
  independently checks the gateway, Clerk token/session, subject allowlist and
  verified mailbox match before creating a D1 identity. A gateway cookie alone
  grants no user, Pro entitlement or admin role.
- Exact-Origin form writes, bounded bodies, atomic D1 throttling (10 attempts per
  IP per 15 minutes), private/no-store responses and generated application CSP.
  Referrer-Policy=same-origin preserves native POST Origin and suppresses external
  referrers. The credential form loads no Clerk SDK or private account assets.
- Both Pages environments have fail_open=false, verified through the API before
  uploading account assets. Preview content stays disabled. Alternate/immutable
  deployment hostnames are denied even with a valid gateway cookie.

The deletion-only Clerk webhook is at
https://randomtools-web-staging.pages.dev/api/webhooks/clerk. This exact POST is
the sole machine ingress exempt from the outer gate; signed verification and
bounded bodies remain mandatory in the API. A provider-signed example for a
nonexistent fixture user returned 200; unsigned delivery returned 401. No real
account was deleted. Ko-fi processing is disabled and no payment secret is set.

Staging D1 `randomtools-staging` exists with ID
`24d38e43-b765-4d21-b713-fce893d7317d`. All three migrations were executed through
the connected dashboard against the new empty database, then tables and the
Wrangler-compatible d1_migrations ledger were checked. The database has no binding
to the public site. The private API uses DB; the gateway uses GATE_DB for hashed
IP throttle counters. Pre-auth checks found zero users, identities or subscriptions.
No existing user data or resources were deleted.

See [CLERK.md](CLERK.md) for identity mapping, existing entitlement preservation,
revocation, signed deletion synchronization and the ownership-review procedure.

## Reproduce the public artifact

From the existing repository root, with Node 22.12+ and the lockfile:

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build:public-staging
npm.cmd run test:public
```

The output is `public-staging/dist`. The script explicitly clears Clerk keys,
uses public-tools-only mode, compiles only the denial guard and adds noindex to
one global header rule. Do not deploy a plain Vite `dist` or the authenticated
`staging/dist` artifact in its place. Restart any local Pages preview after
rebuilding; replacing the artifact directory can leave Wrangler's header watcher
holding an older header configuration.

Hosted verification (read-only tools and denied synthetic API calls):

```powershell
$env:PUBLIC_TEST_URL = 'https://randomtools-preview.pages.dev'
npm.cmd run test:public
```

The connected dashboard can upload an archive of the contents of
`public-staging/dist`; _worker.js is supported by Direct Upload. Keep the archive
outside Git. A scoped authenticated CLI can alternatively deploy the same folder:

```powershell
npx.cmd wrangler pages deploy dist --cwd public-staging --project-name randomtools-preview --branch main
```

This targets the existing public-tools preview, not an authenticated production
service. Normal source CI validates local and public artifacts; it does not
publish them automatically. The repository is public and CI uses standard hosted
Ubuntu runners. No new billing arrangement or paid runner was configured.

## Private deployment and verification

The private build requires a `pk_test_` publishable key in ignored `.env.staging`
or VITE_CLERK_PUBLISHABLE_KEY. It builds `staging/guard.ts` as an advanced Worker
and all-routes `_routes.json` with no exclusions. CI validates but never deploys it.

```powershell
npm.cmd run build:staging
npx.cmd wrangler deploy --config wrangler.staging.toml
npx.cmd wrangler pages deploy dist --cwd staging --project-name randomtools-web-staging --branch main
npx.cmd playwright test --config playwright.private.config.ts
$env:PRIVATE_GATE_CREDENTIAL_FILE = '.wrangler/staging-gate-credentials.json'
$env:PRIVATE_IMMUTABLE_URL = 'https://1a09193f.randomtools-web-staging.pages.dev'
node scripts/check-private-staging.mjs
```

The smoke script logs statuses only, never response bodies, keys or cookies.
The ignored owner handoff `.wrangler/staging-access.txt` contains the local gateway
credential; open it locally, never paste or upload it. Recheck fail_open=false,
API public URL settings, anonymous/immutable denial and payments after deployments.
Emergency closure: set STAGING_CONTENT_ENABLED=false and redeploy private Pages,
remove/rotate gateway grants, or set CLERK_TESTER_IDS=[] to revoke all account
subjects. These changes do not affect the public preview. Never silently extend
grants or leave temporary Pro/admin fixture privileges active after testing.

28 hosted private HTTP checks passed, covering denial, named login, asset CSP,
Clerk-required Pro/admin, disabled payments, unsigned webhook rejection, immutable
host denial and logout/CSRF behavior. Native browser gateway login also passed.

## Remaining work for private account testing

Phase 2 coverage and the exact hosted CPU acceptance procedure are tracked in
[PHASE2.md](PHASE2.md). Provider fixtures and local tests are not evidence of real
hosted Clerk flows or Free-plan CPU compatibility.

1. A seven-day invitation was sent to the approved tester and found in Gmail Spam.
   Generic signup correctly remains restricted. Opening the invitation reached
   Clerk's security-block screen (reference 1IKFLzKM) in the in-app browser. The
   owner must complete password, verification and security prompts. Chrome was
   reconnected successfully in the approved profile and showed RdRPqwiA. Logs
   identified protect.sign_up.blocked with reason policy, after invitation/email
   acceptance. Require Device Intelligence checks is enabled. The CSP omitted
   Clerk's required Protect hosts; adding script/frame https://*.protect.clerk.com
   and connect https://*.protect.clerk.com:* resolved the block and exposed the
   remaining registration fields. No protection was disabled or Testing Token
   used. Invited Google OAuth registration succeeded. Clerk's verified primary
   mailbox and subject were checked before configuring the single-subject API
   allowlist. A generic Google sign-in correctly denied uninvited signup.
2. Hosted D1 collision protection denied an existing same-email fixture rather
   than linking it. Removing only that disposable row allowed normal immutable
   identity provisioning. A real provider token without the required authorized
   party was rejected. All 21 real-session free-member checks and 27 Pro storage,
   retention, export and ownership checks passed. No client role claim granted
   admin. Temporary admin access and the test subscription are now removed;
   all 21 post-revocation checks passed. All named synthetic fixtures are gone,
   while the genuine staging account and identity remain. New temporary grants
   must likewise be removed at the end of future testing.
3. Verify real account signup/verification,
   recovery, Google/GitHub login, logout/revocation, export and deletion using
   authorized test accounts. Signed delivery and real Google registration are
   verified; recovery, GitHub and real account deletion are not complete.
   A second explicitly approved
   identity is needed for real hosted cross-user isolation. Test free-member Pro
   denial before temporary admin promotion (admin intentionally bypasses Pro).
4. Measure actual hosted Worker CPU for cold/warm requests, concurrency, exports
   and cleanup. Local/hosted public-tool checks do not establish the managed
   account API's 10 ms compatibility. Do not lower the legacy password work factor.

First GraphQL observation: 17 API invocations, CPU p50 3,098 microseconds (3.098 ms),
p99 24,102 microseconds (24.102 ms), zero recorded errors. This aggregates gateway/
unauthenticated and webhook checks across deployed versions. It is not a real
authenticated benchmark or a Free-plan pass; investigate the high tail. Worker
startup time and response latency are not request CPU measurements. Use the
[official Workers metrics query](https://developers.cloudflare.com/analytics/graphql-api/tutorials/querying-workers-metrics/)
and check [current runtime limits](https://developers.cloudflare.com/workers/platform/limits/).

See [the CPU investigation](PERFORMANCE.md) for matched hosted comparisons,
synthetic V8 profiles, preserved security checks and the free-backend fallback.
An SDK-only optimized repeat still exceeded 10 ms at p99; do not infer production
readiness from the improved median or a single successful sample. The final
candidate joins fresh D1 authorization reads and caches no grants, sessions,
user profiles or entitlement decisions. An additional imported-HMAC-key cache
experiment did not provide consistent tail headroom and was removed.

## Future full production

The public tools can remain on free pages.dev hosting. Real accounts require a
production identity setup, production secrets and isolated application data,
verified ownership/recovery/deletion, abuse/load and CPU tests, and policy review.
Clerk currently requires an owned DNS-controllable domain for its production
instance; this is a future provider constraint, not a requirement for today's
staging site. Revisit production identity options explicitly if staying entirely
on free provider-managed hostnames. Never substitute development keys into a
production account service. Ko-fi remains disabled until separately authorized.

No domain, plan, service, trial, payment method or billing obligation was purchased
or activated for this staging deployment.

Validated source is published to GitHub main and codex/phase2-quality.
[Phase 2 CI run 41195878140](https://github.com/RandomToolsHQ/RandomTools/actions/runs/41195878140)
passed the full source checks, 50 unit/integration tests, 48 account/Pro/admin
browser cases and 40 public-artifact browser cases. The live public build also
passed all 40 checks against the real HTTPS hostname.
