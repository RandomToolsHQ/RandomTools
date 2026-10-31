# Managed authentication

The public pages.dev preview is **tools-only** and excludes Clerk entirely.
The existing Clerk development instance is invite-only for controlled testing.
Staging API authorization also requires an exact subject in CLERK_TESTER_IDS;
it denies everyone when that configuration is absent. Keep the tester list in
Worker secret storage and never bind the public preview to this API. See
[STAGING.md](STAGING.md) for the current free-hosting URL and restrictions.

Hosted staging/production uses Clerk; application data stays in D1. The legacy
600,000-iteration password adapter remains only for isolated local regression
tests. Hosted mode rejects it. No work factor was lowered.

## Current integration

- `@clerk/react` provides sign-up, email verification, sign-in, social sign-in,
  recovery and account security UI. Tokens come from the SDK in memory for each
  API request; application code does not put credentials in localStorage.
- The API accepts explicit Clerk session bearer tokens. It does not accept
  legacy `rt_session` cookies in Clerk mode and does not mint a second long-lived
  application session. Clerk controls its own session cookies. The prior local
  HttpOnly cookie implementation is not the hosted authentication mechanism.
- The maintained backend SDK verifies the token and authorized frontend party;
  the API checks the exact issuer, current provider session status, expiry,
  subject ownership, provider ban/lock and verified primary email. It also checks
  D1 disable status and D1 roles/paid-through dates. No client role metadata is trusted.
- `(issuer, subject)` maps to an internal user ID. Concurrent provisioning is
  idempotent. A duplicate legacy email fails closed for ownership review; it
  never links accounts, moves Pro access or grants admin. `managed:clerk` in the
  legacy NOT NULL password column is an invalid-password sentinel, not a password
  or a weaker hash. Hosted password endpoints return 410 before hashing.
- Account changes clear frontend query caches; logout revokes the provider
  session and signs out the SDK. Provider outages fail closed. Backend profile/
  session lookups on each request trade latency/provider quota for immediate
  revocation checks; measure before opening registration.
- Export includes D1 account/workspace/membership data and the identity mapping,
  without tokens or hashes. Deletion requires an explicit DELETE confirmation
  and a signed first-factor verification age below five minutes. Sign out/in
  again if reauthentication is stale. Deletion disables locally, deletes the
  Clerk user, then cascades D1 data and leaves a minimal identity tombstone.
- Configure a signed `user.deleted` webhook to clean D1 data if deletion occurs
  in Clerk's own account UI. Signature verification is mandatory; duplicate
  events are idempotent. Never publish account controls before this endpoint is
  configured and tested. A failed provider deletion leaves the account disabled
  with state `deleting`; an operator must complete the recorded deletion request
  after verifying the provider's state. Do not reactivate it automatically.

## Provider setup already completed

Created RandomTools on Clerk Hobby with email, Google and GitHub selected.
Development issuer: `https://quiet-civet-8782.clerk.accounts.dev`.
Dashboard policy inspection confirmed email required/verified at signup,
password signup enabled, minimum length 15, compromised-password rejection on
and Device Trust enabled. No weaker custom password policy was configured.
No test users were created or real email sent.

The owner subsequently created a named staging backend key in the dashboard.
It has not been provisioned by this agent or put into source control. Its masked
dashboard presence is not proof that Worker credential setup is complete.

The built local Pages sign-in screen loads through the generated CSP, displays
Google/GitHub buttons and explicitly labels staging/development mode. This proves
UI rendering, not successful hosted registration, OAuth or recovery.

## Required configuration

Worker: AUTH_PROVIDER=clerk, ENVIRONMENT=staging or production, exact HTTPS
APP_ORIGIN, CLERK_ISSUER and CLERK_PUBLISHABLE_KEY. Secrets belong only in Worker
secret storage: CLERK_SECRET_KEY, CLERK_WEBHOOK_SIGNING_SECRET and a unique
RATE_LIMIT_SECRET (32+ random characters). Optional CLERK_JWT_KEY is a public
verification key; arrange key rotation if pinning it. PAYMENTS_ENABLED stays false.

Frontend: VITE_CLERK_PUBLISHABLE_KEY and VITE_DEPLOYMENT_STAGE. Only public keys
belong in VITE variables. `build:staging` generates a separate noindex artifact;
`scripts/hosting.mjs` derives the exact Clerk CSP host from the public key. Do not
broaden CSP to all HTTPS domains. Staging key and Worker issuer must refer to the
same Clerk instance.

Create the signed deletion webhook for the approved staging origin at
`/api/webhooks/clerk`, subscribe to user.deleted and provision its signing secret
on the Worker. Validate real delivery and replay/invalid-signature behavior.

Production requires a Clerk production instance, live keys, an owned domain/DNS
and production Google/GitHub OAuth credentials. Clerk test keys are rejected by
the Worker in ENVIRONMENT=production. No production instance or domain purchase
has been made. See [Clerk production requirements](https://clerk.com/docs/guides/development/deployment/production).

## Existing users and entitlements

Migration 0003 is additive and leaves existing users, roles and memberships in
place. It does not import passwords or link legacy users. The new remote staging
database contained no existing users. For any future real legacy account, an
operator must independently verify ownership of both identities and retain the
existing internal user ID when inserting the mapping. Review provider-side
automatic account linking/verification policy as well; the app does not enable
an email-linking shortcut. Do not import local test users or bootstrap admin by
email/domain. Admin promotion remains operator-only for a verified internal ID.

## Validation and outstanding gates

Managed integration tests use a real isolated D1 with a mocked provider boundary;
separate tests exercise the real Clerk verifier with generated RSA signatures,
forged signatures, expiry, issuer and frontend-party mismatches. Frontend tests
cover readiness, in-memory tokens, logout and cross-identity cache clearing.
Legacy cross-browser tests retain the local adapter to exercise existing account
and workspace behavior; they are not evidence of hosted Clerk account success.

Still required: provision real staging secrets, configure signed deletion
delivery, actual provider account/recovery/OAuth tests with authorized recipients,
hosted 10 ms CPU validation (including cold starts and cleanup), rate/load tests,
production-domain/OAuth setup and independent security/accessibility review.

There is no automatic production deployment or billing upgrade. Keep Ko-fi off.
