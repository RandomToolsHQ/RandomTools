# Free-plan authentication and deployment review

**Subsequent authorization:** The owner has now authorized Clerk migration,
zero-cost resource setup, pushes and conditional public deployment. See
[CLERK.md](CLERK.md) and the newest PROGRESS entry for implementation/status.
The approval checklist below records the earlier review, not a request to repeat
approvals already supplied. Human credential/security confirmations remain pending.

Reviewed 31 October 2026. Planning only: no authentication code, work factor,
remote resources, provider accounts, DNS, secrets or deployments changed.

## Recommendation and confidence

Cloudflare Free is a plausible hosting target for Pages + API + D1 if expensive
password authentication is moved to an approved managed identity provider.
It is not a validated launch target for the current password implementation.
Recommend a managed-auth integration, with Clerk Hobby as the first candidate
and Supabase Auth Free as an alternative. Provider choice, identity-data sharing,
account/recovery UX, session policy and any migration require explicit approval.
Do not present this recommendation as implemented or as proof of CPU compliance.

Clerk Hobby currently advertises 50,000 monthly retained users per app, no credit
card requirement, basic brute-force protection, fixed seven-day session lifetime
and one-day application logs. Passkeys and MFA are not included in Hobby. Its
production setup requires domain/DNS configuration: an available pages.dev URL
alone is not proof that production Clerk setup is possible. Confirm an existing
owned domain, production sender setup, callback URLs and production social-login
credentials before selecting it. Passwords remain with Clerk, which documents
bcrypt storage; this review has not independently established its current work
factor. Verify the provider's current password/recovery controls before enabling
password login. A managed social/OIDC sign-in launch avoids storing RandomTools
passwords, but changes the login methods and still requires explicit approval.

Supabase Free currently advertises 50,000 monthly active users, two active
projects and inactivity pausing after a week. It documents bcrypt password
storage. Its default email delivery is for authorized team recipients, currently
two messages/hour, not general production use. Custom SMTP and a verified sender
are required for general email authentication. D1 can remain the application
database; using Supabase Auth does not require moving application tables into
Postgres. Confirm password policy/work factor, revocation, MFA requirements,
provider downtime behavior and zero-cost email limits before choosing it.

If the owner does not approve managed authentication, retain the existing
600,000-iteration design and defer hosted accounts, or seek a separately approved
compute arrangement. A static free-tools-only release is another explicit scope
choice; account/Pro UI and endpoints must be disabled deliberately before such a
release. Do not publish the current account flow hoping Free-plan grace permits it.

## Hashing investigation

`worker/security.ts` tries native Web Crypto PBKDF2-HMAC-SHA256 with 600,000
iterations, a random salt and 32-byte output. On NotSupportedError it uses the
same parameters in the JavaScript implementation. Password verification uses
the same work factor. Registration, mailbox verification, reset, login and
password-confirmed actions must all be considered, not only the login endpoint.

Workers Free has 10 ms CPU per HTTP request and per cron invocation. The current
staging `limits.cpu_ms = 30000` is a Paid setting and cannot extend Free limits.
The recorded 10–15-second concurrent local hashing observations are wall-time
observations, not hosted CPU measurements. Local workerd and Node success do not
prove the managed Workers runtime permits 600k native iterations or meets 10 ms.
Upstream workerd's default PBKDF2 ceiling is still 100,000; the proposal to raise
it to one million (#7550) is open. Runtime-specific overrides exist, so this is
evidence of a compatibility risk, not a measurement of our connected account.
No hosted benchmark was run because public deployment is not approved.

| Option | Assessment |
| --- | --- |
| Current 600k native PBKDF2 + JS fallback | Preserve strength, but unsuitable as a reliable Free launch design without hosted evidence; fallback is the major CPU risk. |
| Native Node crypto, optimized WASM, Argon2id, scrypt or bcrypt on the same Worker | Not a demonstrated workaround. Secure cost/memory settings still need CPU; API support/iteration ceilings differ. Argon2id/scrypt improve password resistance, not Free-plan feasibility. |
| PBKDF2-SHA512 at its own reviewed parameters | Different hash family requires explicit format/migration review and benchmarking. OWASP's 220k recommendation is not permission to change the existing scheme and does not establish 10 ms feasibility. |
| Fewer SHA256 iterations, fast SHA hashes, client-only hashing | Reject. Violates the existing strength requirement or makes the client hash a reusable password equivalent. |
| Yielding, waitUntil, splitting across requests/Workers | Not a sound authentication resource-limit workaround; awaiting does not remove CPU cost. Adds abuse/state complexity. |
| Managed authentication | Preferred Free-hosting route. Hashing/recovery occurs outside Workers; Worker verifies identity and enforces local authorization. Network waiting is excluded from CPU, but token verification, parsing and application work still need hosted measurement. |
| Self-hosted passkeys or passwordless email | Potentially low CPU with sound protocols; substantial architecture/recovery changes. Passkeys require challenge/origin/RP/user-verification controls; email security depends on inbox and delivery. Not automatic replacements. |

OWASP recommends modern password hashing, including Argon2id (19 MiB, t=2, p=1)
or PBKDF2-HMAC-SHA256 at 600k. Algorithm parameters are not interchangeable based
only on iteration count. Keep the current scheme unchanged during this decision.

## Proposed managed-auth boundary (approval required)

Keep the Pages same-origin API service proxy and D1 application ownership,
entitlements, admin checks and audit records. Use maintained provider SDKs with
server-side signature, issuer, audience/authorized-party and expiry validation;
cache and rotate signing keys safely. Never accept decoded-only tokens, frontend
role metadata or an unverified email as identity evidence.

Introduce a unique `(issuer, subject)` mapping to the existing internal user ID
with a reviewed additive D1 migration. Email is not an account-linking key.
Existing local test users must not be silently imported or granted roles. Keep
admin/paid entitlement decisions in D1. Review `password_hash NOT NULL` and all
password-confirmed deletion/export/change flows: managed identities need recent
provider reauthentication, not fabricated password values or skipped checks.

Preserve the application's HttpOnly/Secure same-origin session design through a
reviewed backend exchange if compatible with the selected provider. Do not
persist provider tokens in localStorage. Bound application sessions by provider
expiry/revocation; logout, provider deletion/disable and admin disable must revoke
access. Use strict callback allowlists and state/nonce/PKCE for redirect flows.
Any signed lifecycle webhooks need signature/replay validation and idempotency.
Provider outages fail closed. Review CSP, cookie attributes and CSRF for the
selected integration rather than assuming the current values fit redirect login.

## Git preflight

Fresh `git fetch origin` succeeded. Origin main remains
`ab08aa1e4fbd7e1a6bddc1dfa9690a17908b685f`; HEAD remains
`e71b21812a8dd21554f09de854ea0009be698676`. Six commits ahead, oldest first:

1. `17afcd6` Build RandomTools frontend, eighteen tools and Pro workspace
2. `12185c7` Implement D1 accounts, Pro entitlements, Ko-fi reconciliation and admin API
3. `16e2c68` Add integration and browser tests, CI, security and Cloudflare documentation
4. `e44379d` Add transactional email delivery and harden account and payment security
5. `7efcd74` Fix browser image processing, batch archives and static SEO builds
6. `e71b218` Verify cross-browser accessibility, account recovery and release preparation

Targeted local audit covered all 67 tracked paths and all 109 reachable historical
blobs across local refs. Checked secret filenames, private-key markers, common
provider-token formats, JWT literals and quoted secret/password assignments.
No live secrets were detected. All 24 assignment matches in three blob versions
were reviewed: explicit mocked-provider/test secrets and synthetic test passwords.
`.env.example` contains placeholders. `.env`, `.dev.vars`, Wrangler state and the
staging build are ignored and untracked. No private-key/credential filenames are
tracked. This is a targeted pattern/manual audit, not a guarantee against every
possible credential encoding; a full dedicated scanner is still a release check.
Gitleaks/TruffleHog were not installed. Never print real candidate values in reports.

Current staging work and this review remain uncommitted; the six commits alone
do not contain them. Inspect the exact staged diff, run a dedicated secret scan
over history and the final index, and repeat after adding provider configuration.
Do not use `git add .`: preserve/exclude the untracked nested `RandomTools/`
checkout. Do not push without explicit approval of the destination and commits.

## Deployment sequence after approvals

1. **Confirm scope and identity design.** Approve the provider and login methods,
   migration/recovery/session policy, data sharing and exact HTTPS origins.
   Implement and locally test the approved design before any deployment.
   No auth implementation was changed by this review.
2. **Verify connected Cloudflare account.** Target account ID
   `5c172e2e4c51cfc7dc512c96825b2912`. Prior browser inspection found no apps or
   D1 databases and quotas consistent with Free. This turn tab inventory was
   accessible, but page access failed; subscription/resource inventory could not
   be freshly verified. Reopen the dashboard, inspect Workers plans and confirm
   Free. Authenticate Wrangler normally, then check `wrangler whoami` and account
   ID. Do not export browser cookies, select a temporary account or upgrade.
3. **Agree origin before resources.** Prefer a stable staging alias, provisionally
   `https://staging.randomtools-web-staging.pages.dev` if the Pages name is
   available. It is a proposal, not an existing/verified URL. Clerk production
   may require an already-owned custom domain; verify that separately. No domain
   purchase is included. Use the exact frontend origin for APP_ORIGIN and auth
   allowlists. Hash/branch preview URLs must not silently gain account access.
4. **Create free resources only with resource approval.** Use Direct Upload
   Pages project `randomtools-web-staging`, reserve production branch `release`
   and deploy only branch `staging`. Create D1 `randomtools-staging` in the same
   account; copy its returned UUID into the staging Worker config. Check that
   no payment/upgrade prompt is required. Keep future production resources separate.
5. **Migrate D1.** Apply 0001 and 0002 plus the reviewed managed-identity migration,
   if approved. Before any existing database change, export a backup; test
   restoration into a separate disposable staging DB. Inspect tables/indexes and
   foreign keys. Free D1 limits include 500 MB/database, 10 databases/account,
   5M rows read/day, 100k written/day and 5 GB account storage; queries/index
   maintenance and rate-limit writes count. Retain quota headroom for staging.
6. **Prepare Worker Free configuration.** Remove the Paid-only 30k CPU override
   only after the approved auth redesign is ready. Retain ENVIRONMENT=production,
   PAYMENTS_ENABLED=false, workers_dev=false and preview_urls=false; D1 binding
   must name only staging. Keep email disabled unless the chosen design needs
   an approved sender. Inspect the dry-run binding list before upload.
7. **Provision secrets securely.** Put a unique random RATE_LIMIT_SECRET (32+
   characters) into the staging Worker. With Clerk, only if needed by the selected
   backend flow: CLERK_SECRET_KEY and signed-webhook secret; issuer/JWKS/key ID,
   approved origins and publishable key are public config. Exact names must match
   the implementation. With Supabase use only the minimum server credentials
   needed; never expose its service-role key. Any provider SMTP key belongs in
   the provider's server settings, not VITE variables. If the legacy Resend
   transport remains necessary, EMAIL_FROM/EMAIL_PROVIDER are config and
   RESEND_API_KEY is a Worker secret. Leave Ko-fi secrets unset and payments off.
   Do not grant production credentials to staging or create provider accounts yet.
8. **Local release gate.** Typecheck, lint, unit/integration tests, browser account
   and security tests, backup/restore, staging build, SEO and Worker dry run.
   Add tests for invalid/wrong-issuer/expired tokens, callback replay, identity
   collisions, cross-user access, disable/revocation, recent reauth and provider
   failures. Scan tracked history, final staged changes and generated bundles
   for secrets; publishable keys may be public, server keys may not.
9. **Obtain publication approval.** Show the exact source revision, migrations,
   resource IDs, provider config and origin. Deploy the Worker with no public
   workers.dev route, then the Pages staging branch through its staging service
   binding. If private staging is chosen, configure and verify access protection
   before making the app reachable; noindex alone is not access control. Any
   setup requiring terms acceptance must be completed by the owner as needed.
10. **Hosted acceptance gate.** Check HTTPS/certificates, API JSON/no-store,
    session cookies, origin/CSRF rules, provider signup/login/recovery/revocation,
    isolation and D1 restoration. Measure actual CPU in hosted logs for cold/warm
    and concurrent auth, normal APIs, exports and daily cleanup; verify no 1102
    errors and useful headroom below 10 ms. Managed auth does not guarantee all
    other code fits Free. Check D1 rows and daily request usage. Static assets are
    free; Pages Functions use Workers quota. No paid overage fallback is authorized.
11. **Production is a separate decision.** Only after staging passes: approve the
    production origin, independent production D1/Worker/Pages resources and
    secrets, legal/support policies and exact public release. Set VITE_SITE_URL
    only for the owned production HTTPS origin and build a production artifact
    without staging noindex. Repeat security and quota gates. Keep live Ko-fi off.

Command examples (do not execute until the corresponding approval/gates pass):

```powershell
npx.cmd wrangler whoami
npx.cmd wrangler pages project create randomtools-web-staging --production-branch release
npx.cmd wrangler d1 create randomtools-staging --config wrangler.staging.toml
# Insert real D1 UUID; review the approved identity migration first.
npx.cmd wrangler d1 migrations apply randomtools-staging --config wrangler.staging.toml --remote
npx.cmd wrangler secret put RATE_LIMIT_SECRET --config wrangler.staging.toml
# Add only secrets required by the approved provider integration.
npm.cmd run build:staging
npx.cmd wrangler deploy --config wrangler.staging.toml --dry-run
# Publication approval required below:
npx.cmd wrangler deploy --config wrangler.staging.toml
npx.cmd wrangler pages deploy dist --cwd staging --project-name randomtools-web-staging --branch staging
```

## Exact approvals to request

- **Architecture:** approve managed authentication, selected provider/free tier,
  login methods, identity-data transfer, account migration and reauthentication/
  recovery/session behavior. This authorizes local implementation only unless
  provider setup is separately included.
- **Provider setup:** approve creating/configuring the named free provider app,
  its data region/terms, domain/DNS, sender and authorized test recipients.
  Owner completes any required terms/credential steps. No paid add-ons or upgrade.
- **Cloudflare staging setup:** approve Wrangler authentication to the named
  account, creation of the named free D1/Pages resources and nonpublic Worker,
  reviewed migrations, staging-only secrets and selected HTTPS origin/access
  policy. No public publication implied.
- **Git push:** separately approve pushing the six existing commits plus any
  reviewed new commits to a named branch in RandomToolsHQ/RandomTools. Direct
  upload does not technically require a push; deployment must still use an exact
  reviewed revision rather than an undocumented dirty tree.
- **Publication:** separately approve the exact staging deployment/origin, then
  later production publication after acceptance evidence. Specify public versus
  access-protected staging. Neither is approved by this review.
- **Payments/purchases:** remain prohibited. Any future paid plan, provider
  upgrade, domain purchase or live Ko-fi activation needs its own explicit approval.

## Sources checked

- https://developers.cloudflare.com/workers/platform/limits/
- https://raw.githubusercontent.com/cloudflare/workerd/main/src/workerd/io/limit-enforcer.h
- https://github.com/cloudflare/workerd/pull/7550
- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- https://clerk.com/pricing
- https://clerk.com/blog/how-we-roll-passwords
- https://clerk.com/docs/reference/backend/verify-token
- https://clerk.com/docs/guides/development/deployment/production
- https://supabase.com/pricing
- https://supabase.com/docs/guides/auth/password-security
- https://supabase.com/docs/guides/auth/auth-smtp
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/d1/platform/limits/
- https://developers.cloudflare.com/pages/functions/pricing/
