# Phase 9 — isolated Firebase Spark proof of concept

This branch does not replace Clerk, migrate accounts or enable public signup.
The public 21-tool deployment and restricted Clerk environment remain unchanged.
Never apply `experiments/firebase/0006_poc_sessions.sql` to genuine staging.

## Scope and implementation

The separate frontend supports email/password registration, verification resend,
sign-in, sign-out, recovery, action-link handling, Google popup sign-in, a private
workspace, owned exports/presets, manual Pro requests and a small test-admin view.
The separate Worker reuses the existing gateway and manual-Pro enforcement.
Only exact allowlisted synthetic Firebase UIDs and matching named gateway emails
are admitted. Both services require the isolated D1 metadata marker before use.
There is no role-promotion API or public Worker/preview endpoint.

Firebase ID tokens are verified with jose against Google's documented X.509
signing-key endpoint: RS256, trusted kid, signature, exact project audience and
issuer, expiry, issued-at, subject, authentication time and verified email.
Tenant identities are rejected. Only public certificates/CryptoKeys are cached,
for at most Google's cache-control lifetime (capped at one hour). No identity,
session, disabled state, entitlement or authorization decision is cached.

Every API request performs a real accounts:lookup call, requires matching UID,
verified primary email and non-disabled status, and compares signed auth_time
against validSince. A missing revocation boundary fails closed. Live requests
to this new project confirmed that the public ID-token lookup returns validSince;
no Admin SDK credential is needed by the Worker. See Firebase's
[verification requirements](https://firebase.google.com/docs/auth/admin/verify-id-tokens)
and [REST lookup contract](https://firebase.google.com/docs/reference/rest/auth).

An additional Secure/HttpOnly/SameSite=Strict application cookie is bound to UID
and auth_time in D1. Every request still requires a valid Firebase token and
fresh provider lookup. Logout atomically deletes application sessions, audits
revocation and records an auth_time cutoff. An old ID token or refreshed token
with the old auth_time cannot recreate a session. This is necessary because
Firebase's client signOut does not itself revoke a stolen token. Provider-wide
revocation remains checked through validSince, per the
[session documentation](https://firebase.google.com/docs/auth/admin/manage-sessions).

Application roles, disabled state and Pro decisions remain fresh D1 reads. Token
custom claims cannot confer Admin or Pro. Immutable issuer/UID mapping never
links by email. All app admins are protected from self-deletion. Deletion requires
typed confirmation and recent auth, disables locally and audits before Firebase
deletion, then cascades owned records with an audit and tombstone. If deletion is
interrupted or a user deletes directly at Firebase, operator-assisted D1 cleanup
is still required; no paid Cloud Functions deletion webhook has been introduced.

## Credential decision — no private key generated

### Phase 9.1 current state — 4 November 2026

Update superseding the historical notes below: the owner completed Google's
device verification and the earlier Cloud Shell source authorization succeeded.
IAM and IAM Credentials APIs were enabled with billingEnabled=false. The helper
was transferred and its checksum verified, but its setup command was not run;
this workflow issued no temporary grants or impersonated tokens. The current
console inventory lists only the existing SDK service account, with No keys.
Full project IAM policy/custom-role verification remains pending; do not equate
absence of a service account with verified cleanup of every binding.

The earlier two-hour authorization window is no longer current. A fresh scoped
approval is required before new grants or a privileged session. No private key
has been generated. `scripts/firebase-poc-keyless.py` records a baseline, refuses
pre-existing resources/ledgers without review and prepares exact cleanup.

### Historical approval preparation (before device verification)

Read-only rechecks found the same Cloudflare deployment IDs and D1 isolation.
Firebase still displays Spark, $0/month. Google Cloud's linked-account screen
explicitly says this project has no billing account. After owner-approved Google
Cloud terms acceptance (marketing off), the console shows the existing Firebase
SDK service account has **No keys**. Its broad service-agent role will not be
used for test impersonation. IAM Credentials API is not yet enabled. Cloud Shell
stated it is free. The owner subsequently approved the exact two-hour custom-role
setup below, but no IAM grants or tokens have been issued. Standalone Cloud Shell
now requires Google's "Verify your info to continue" device/phone check. The
owner must complete zero-cost verification; no codes, CAPTCHA, SMS charges or
security protections may be handled or bypassed by the agent. Account verification
remains pending, so the hosted privileged test path cannot yet run.

Proposed exact project: `randomtools-firebase-poc` (number `520548171148`).
Create `randomtools-poc-auth-tests@randomtools-firebase-poc.iam.gserviceaccount.com`.
Use two custom roles, defined as reviewable JSON under experiments/firebase/iam:

- Project role `randomtoolsPocAuthTests`: only firebaseauth.users.get,
  firebaseauth.users.sendEmail, firebaseauth.users.update and
  firebaseauth.users.delete. Bind to the new service account in this project,
  with a two-hour expiry. This is narrower than roles/firebaseauth.admin: it
  excludes Auth configuration, password-hash configuration, key creation and
  application/IAM/billing permissions.
- Role `randomtoolsPocAccessTokenMinter`: only
  iam.serviceAccounts.getAccessToken. Bind only on that new service account to
  user:randomtoolshq@gmail.com, with the same two-hour expiry. No signJwt,
  signBlob, getOpenIdToken, actAs or delegated impersonation permission.

These Firebase permissions apply to **all Auth users in this isolated project**;
IAM does not enforce the synthetic UID allowlist. The operator harness must
validate the exact fixture UID/email before each administrative mutation.
Cloud Shell's initial source authorization can exercise the operator's existing
Google Cloud permissions, potentially beyond this project; selecting a project
is not a security boundary. Use it only for reviewed setup/cleanup commands in
this project. Do not export or save that source credential locally.

After approval, enable only IAM/IAM Credentials APIs if needed and if no billing
is required, then use generateAccessToken REST with lifetime=900s. Store only
the resulting short-lived token in the ignored owner-restricted POC directory;
never export a service-account key or persist ADC/refresh credentials. Scope
cloud-platform enables API use but does not expand the custom IAM permissions.

Cleanup: remove operator impersonation binding and project Auth binding,
disable the temporary service account, verify stale-token calls are denied,
remove the dedicated service account/custom roles, delete local token files,
and terminate/revoke Cloud Shell's privileged session. Removing a minting grant
alone does not invalidate an already issued token; allow expiry and verify
denial, or disable the account. Tokens expire after 15 minutes without refresh.
Only recorded synthetic Firebase/D1 fixture IDs may be removed.

[IAM pricing](https://cloud.google.com/iam/pricing) states IAM API usage is free;
[Cloud Shell pricing](https://cloud.google.com/shell/pricing) states Cloud Shell
is free. The direct impersonation documentation requires API activation but
does not list a billing account. Actual activation remains untested: stop if
Google requests billing, a trial, a payment method or a Blaze upgrade. Do not
treat an unpressed Enable button as successful no-billing activation.

The owner explicitly declined a long-lived Firebase Admin SDK key and requested
keyless alternatives. The normal Worker needs only Firebase web configuration,
not a privileged service-account key. Administrative credentials are needed only
for controlled test setup/actions: generating verification/reset action links
without using a real mailbox, revoking synthetic provider sessions, and reviewing
or reconciling deletion. Never change email_verified claims locally or skip
verification to get around that test dependency.

The initial Phase 9 proposal used roles/firebaseauth.admin and Token Creator.
Phase 9.1 replaces both with the narrower custom roles above. Use a **15-minute
impersonated access token** for the dedicated `randomtools-poc-auth-tests` service
account. A trusted operator needs the temporary getAccessToken binding on that
account and IAM Credentials API availability. Remove the binding after testing.
Use Cloud Shell's temporary authorization or an explicitly
authorized local gcloud session as the source credential. Do not export a private
key, copy existing Clerk secrets or grant authority over another project.

[Cloud Shell is free](https://cloud.google.com/shell/pricing) and its
[authorization is session limited](https://docs.cloud.google.com/shell/docs/auth).
This does not prove that IAM Credentials activation is available on this account
without billing: some client quickstarts include a billing prerequisite. Inspect
the actual requirement and stop if any billing/trial authorization is requested.
Service-account impersonation requires
[getAccessToken permission](https://docs.cloud.google.com/iam/docs/service-account-permissions)
and produces [tokens without refresh credentials](https://docs.cloud.google.com/iam/docs/create-short-lived-credentials-direct).

No local gcloud/ADC configuration was available during inspection. Plain gcloud
end-user ADC is also not a drop-in solution: Firebase documents an OAuth-client
restriction and requires a custom Desktop client for that route. See
[Admin SDK local ADC requirements](https://firebase.google.com/docs/admin/setup#test-with-gcloud-end-user-credentials).
Browser control was unavailable during Phase 9; Phase 9.1 restored it and reached
Google's required device verification. Cloud Shell authorization/impersonation
has not been completed. This remains a control-plane dependency, not evidence
that a private key is necessary.

`scripts/firebase-poc-admin.mjs` accepts only a short-lived OAuth token descriptor
under ignored `.wrangler/phase9/admin-access.json`:

```json
{"projectId":"randomtools-firebase-poc","accessToken":"OPERATOR_SUPPLIED_SHORT_LIVED_TOKEN","expiresAt":0}
```

Set expiresAt to its real expiration in epoch milliseconds, within 15 minutes.
Private-key and refresh-token files are refused. Never paste tokens into chat,
commit them or pass them as command-line arguments. The harness verifies exact
synthetic ownership before actions and never uses the genuine Founder account.

## Free-plan and domain assessment (3 November 2026)

The newly created Firebase project is visibly Spark, No cost ($0/month). No card,
billing account, Blaze trial, Analytics or Developer Programme opt-in was used.
Email/password and Google are enabled; phone/anonymous/email-link auth are not.
Google's existing business support contact is project metadata, not an imported
Clerk account or test identity. Provider identities are configured separately.
The exact isolated hostname randomtools-firebase-poc.pages.dev was accepted in
authorized domains. The existing public hostname/configuration was not changed.

[Spark pricing](https://firebase.google.com/pricing) needs no payment method.
[Current quotas](https://firebase.google.com/docs/auth/limits) include 1,000
verification emails/day and 150 password-reset emails/day; email-link sign-in is
only five/day, so it is not the proposed route. SMS requires billing and is
excluded. Identity Platform introduces a 3,000 DAU Spark limit; this POC did not
activate that upgrade. Monitor the actual product/quotas, do not assume unlimited
usage or a paid overage. Email enumeration protections and password policy need
an explicit production review rather than silently changing provider settings.

Google popup auth uses Firebase's provided auth domain, avoiding a domain
purchase. Browser storage restrictions and exact redirect allowlisting still
require [supported configuration](https://firebase.google.com/docs/auth/web/redirect-best-practices).
A real Google enrollment test needs a separately authorized synthetic Google
identity; never use the genuine Founder Google/Clerk identity to fill that gap.

Compared with Clerk: Firebase avoids the documented owned-domain deployment
requirement and removes a privileged backend key from ordinary request handling.
However, it requires custom token/session/revocation and deletion reconciliation
code instead of Clerk's session API and signed deletion webhook. It may reduce
SDK overhead, but no CPU benefit is established until repeated verified hosted
workloads are measured. Do not recommend migration solely from emulator tests or
an unverified-token rejection benchmark.

## Safe migration design — do not execute

1. Keep genuine Clerk staging and the Founder/Admin account untouched. Establish
   an independently approved production identity realm and empty test migration
   rehearsal database. Do not copy genuine records/credentials into this POC.
2. Obtain explicit migration approval, verify a fresh D1 export by restoring it
   locally, preserve all tables/FKs and protect backups. Prove ownership of both
   immutable provider IDs with recent authentication; matching email is not proof.
3. Require the owner to confirm the exact old/new IDs for Founder migration.
   Never bootstrap a new admin automatically or demote the old one during a POC.
4. Important schema constraint: auth_identities.user_id is UNIQUE. A naive second
   provider mapping cannot be added to the same internal user. In the future,
   use an audited migration ledger and an atomic cutover: verify active old
   mapping and absent new mapping, tombstone the old mapping and SET user_id=NULL,
   then insert the new issuer/UID pointing to the unchanged internal users.id.
   Existing roles, grants, workspaces and foreign keys stay on that same ID.
5. Invalidate old app sessions and provider sessions. The detached old mapping
   blocks old tokens and prevents a delayed Clerk deletion webhook from deleting
   the migrated account. Never leave both identities ambiguously authoritative.
6. Freeze the approved production artifact/configuration and rehearse rollback.
   Roll back mappings and sessions through an audited transaction; never restore
   a stale database over new accounts or revive revoked Pro grants. Preserve new
   audits/tombstones, and obtain fresh approval before any production switch.

## Observed evidence and remaining launch gates

The isolated deployment is https://randomtools-firebase-poc.pages.dev/. It is
gateway protected, synthetic-UID allowlisted and not a public account launch.
Three real Firebase synthetic accounts were registered without importing any
Clerk user or credential. Their real password sign-ins and live profile lookups
worked. All remain unverified, so application account/session creation correctly
fails closed; no synthetic D1 role or Pro grant has been provisioned remotely.

Hosted smoke testing passed 28 assertions, including anonymous denial on root,
API/admin/Pro/assets, named gateway/cookie boundaries, protected frontend loads,
real Firebase sign-in, unverified-email denial, signature-tampering rejection,
and desktop/mobile overflow and accessibility checks. A Pages immutable-header
exception found in the first run was fixed by cloning the binding response and
covered by a regression test before repeating the hosted smoke tests.

Local evidence: 119 unit/integration tests, eight POC browser cases and five
official Auth Emulator lifecycle checks passed, alongside lint, typecheck,
dependency audit and a redacted staged secret scan. Emulator and UI API fixtures
are not evidence of hosted verification, recovery, revocation or deletion.
The popup resolver is configured explicitly; provider initialization failures
are tested without a genuine Google identity. Three Windows Firefox timeouts in
the existing app/public suites passed on serial targeted reruns.

Source `92c9bb3` passed [full GitHub CI 41610414829](https://github.com/RandomToolsHQ/RandomTools/actions/runs/41610414829):
119 unit/integration tests, eight Firebase UI cases, five Auth Emulator lifecycle
checks, 68 existing app browser cases and 52 public-artifact browser cases.
Lint, typecheck, backup/restore rehearsal, SEO, builds and both Worker dry runs
also passed. Root npm audit and the branch commit secret scan had zero findings.

Latest isolated Pages deployment: `55c23b3b-75fa-404a-89b5-c3d3775c2026`.
Isolated API version: `e9d241c3-cce9-4563-acfe-d8685112c936` (100%).
Read-only checks confirmed the original public/Clerk Pages and Clerk API
deployment IDs still match their pre-POC baseline. The new POC D1 has zero
application users, grants and sessions; unverified Firebase identities cannot
bootstrap them. No genuine database query or migration was needed for this POC.

No representative authenticated CPU result is available: the workload harness
refuses to treat denied unverified requests as successful authentication. The
keyless administrative authorization above is needed before hosted populated
workspace, entitlement expiry, isolation, admin, recovery-link, provider session
revocation and deletion tests. Actual mailbox delivery and Google enrollment
also remain unproven. Keep Clerk in place; Firebase is a promising no-domain
candidate, not yet a validated replacement or a Free-CPU compliance claim.

## Reproduction commands

The Phase 9.1 bounded workload runner is `node scripts/firebase-poc-workload.mjs`.
It requires a real verified server session, an entitled synthetic member and at
least three owned presets before starting. It runs three sequential batches of
40 reads, paced at 1.5 seconds plus response time; it stops on the first error
and attempts server logout in a finally block. It records end-to-end latency
p50/p95/p99, failure rate, provider throttling and visible CPU-limit errors.
It creates no roles, grants, accounts or presets and cannot substitute for their
hosted validation. A hosted preflight against the currently unverified member
correctly refused to start; no performance samples were generated.

Only then run `node scripts/firebase-poc-cpu.mjs` for separate sampled Cloudflare
CPU quantiles. Mixed, denied, wrong-owner, redirected or incomplete intervals
have their CPU quantiles withheld. Three measurement-policy regression tests
cover those cases and distinguish end-to-end latency from Worker CPU. Keep
negative security tests outside the measurement intervals. Empty or unavailable
analytics and warm-only samples cannot establish Free-plan reliability.

```powershell
npm ci
npm run typecheck
npm run lint
npm test
npm run build:firebase-poc
npm run test:firebase-ui
# Pure local Auth Emulator; unsigned emulator JWTs are never accepted by Worker:
npm exec --yes --package firebase-tools@15.34.2 -- node scripts/firebase-poc-emulator.mjs
```

Tracked deployment templates deliberately contain zero D1 IDs. Use only a new
isolated D1 with migrations 0001–0005 plus the POC-only migration, distinct gateway
secrets, exact origin and synthetic UID allowlist. Do not substitute genuine
staging bindings. Keep `.env.firebase-poc`, credential manifests, generated RSA
test keys and all `.wrangler` evidence ignored and owner restricted. The Firebase
SDK brought an unused Firestore gRPC dependency advisory; a compatible patched
gRPC override is pinned, with zero root npm audit findings after installation.
