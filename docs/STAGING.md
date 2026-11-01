# Cloudflare staging — current deployment

Updated 1 November 2026. The owner explicitly chose zero spending and free
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

The separate private Pages frontend is deployed (`d1a1c05c`), protected by the
owner-approved zero-billing gateway. The API `randomtools-api-staging` is deployed
as version `1e901dc2-ea9e-4ceb-ad9d-50574fb19322`. Both workers.dev and version
preview URLs are disabled; the frontend uses a service binding. Do not upload
`staging/dist` to the public tools project or give the public project API bindings.

`wrangler.staging.toml` uses AUTH_PROVIDER=clerk, ENVIRONMENT=staging and exact
APP_ORIGIN=https://randomtools-web-staging.pages.dev. Payments remain disabled.
Wrangler OAuth is complete and stored encrypted with Windows Credential Manager.
The replacement development backend key is Git-ignored and validated (HTTP 200).
Worker secrets include CLERK_SECRET_KEY, CLERK_WEBHOOK_SIGNING_SECRET,
CLERK_TESTER_IDS, RATE_LIMIT_SECRET and the two gateway secrets. Tester subjects
currently remain deny-all (`[]`) until real registration is verified.

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
$env:PRIVATE_IMMUTABLE_URL = 'https://d1a1c05c.randomtools-web-staging.pages.dev'
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
   reconnected successfully in the approved profile. The same invitation also
   reached a Clerk block in normal Chrome (reference RdRPqwiA). The owner was
   handed that tab for a manual attempt. No security protection was bypassed.
2. Verify the registered account's mailbox and immutable Clerk subject; configure
   CLERK_TESTER_IDS as a JSON array through secure Worker configuration. Unset
   remains deny-all. Do not publish actual tester identifiers in Git.
3. Verify real account signup/verification,
   recovery, Google/GitHub login, logout/revocation, export and deletion using
   authorized test accounts. Signed delivery is verified; real account deletion
   and provider end-to-end checks are not yet done. A second explicitly approved
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
