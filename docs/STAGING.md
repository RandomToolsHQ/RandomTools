# Cloudflare staging — current deployment

Updated 31 October 2026. The owner explicitly chose zero spending and free
Cloudflare-managed addresses. No purchased domain is needed for this preview.

## Working public preview

https://randomtools-preview.pages.dev

Cloudflare Pages project: `randomtools-preview` (Direct Upload, Free account).
This is a tools-only staging site, even though Cloudflare labels its stable
Direct Upload environment "Production". It is not a public account service.

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

## Controlled authentication testing

Clerk development issuer: `https://quiet-civet-8782.clerk.accounts.dev`.
The existing Hobby development instance is invite-only. No paid allowlist,
passkey, MFA or other paid feature was activated. The API independently requires
an explicitly approved Clerk subject ID in `CLERK_TESTER_IDS` in staging mode;
missing configuration denies all testers. Never grant admin/Pro access by email.

The standalone application API is not publicly deployed. The authenticated
`staging/` frontend artifact is not the public artifact. Do not upload it to the
public tools project, and do not bind the public project to the application API.

`wrangler.staging.toml` is the private testing Worker configuration. It uses
AUTH_PROVIDER=clerk and ENVIRONMENT=staging, preserves hosted origin/header
checks, disables workers.dev and version-preview URLs, has no Paid CPU override,
and leaves payments off. APP_ORIGIN is intentionally unresolved until a separate
controlled-testing origin and access policy are verified.

Staging D1 `randomtools-staging` exists with ID
`24d38e43-b765-4d21-b713-fce893d7317d`. All three migrations were executed through
the connected dashboard against the new empty database, then tables and the
Wrangler-compatible d1_migrations ledger were checked. The database has no binding
to the public site. No existing user data or resources were deleted.

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

## Remaining work for private account testing

1. Complete normal Wrangler authentication to the intended existing Cloudflare
   account. Do not use a temporary account, extract browser cookies or upgrade.
2. Provision the existing staging Clerk backend key, a signed user.deleted
   webhook secret and a random 32+ character RATE_LIMIT_SECRET in Worker secret
   storage. Never put backend keys in VITE variables or source control.
3. Approve/invite specific testers, verify their Clerk IDs and configure
   CLERK_TESTER_IDS as a JSON array through secure Worker configuration. Unset
   remains deny-all. Do not publish actual tester identifiers in Git.
4. Use a separate controlled-testing Pages origin on pages.dev, with access
   restrictions verified before exposing account UI; set APP_ORIGIN exactly.
   Keep the API's public routes disabled and use a service binding only from
   the controlled frontend. The public preview remains unbound.
5. Configure and verify the signed deletion webhook, account signup/verification,
   recovery, Google/GitHub login, logout/revocation, export and deletion using
   authorized test accounts. These provider end-to-end checks are not yet done.
6. Measure actual hosted Worker CPU for cold/warm requests, concurrency, exports
   and cleanup. Local/hosted public-tool checks do not establish the managed
   account API's 10 ms compatibility. Do not lower the legacy password work factor.

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
