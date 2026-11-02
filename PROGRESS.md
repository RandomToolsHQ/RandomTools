# RandomTools implementation status

## Phase 6 development — 3 November 2026

Follow-up `codex/phase6-resilience` fixes a confirmed startup/tool failure when
browser preference storage is blocked. Theme/favourites degrade to tab/page
state; anonymous counting fails closed for the tab if consent cannot be read or
written, including failed opt-out against an older stored opt-in. A focused
privacy unit test and four-target browser tests passed in application and public
artifacts. No authentication, session, Pro/admin or payment policy changed.
Vault CI 41466894743 passed (98 unit/integration cases, 64 application browser
cases, 48 public-artifact cases, eight vault browser cases and all checks).
Integration documentation CI 41467431441 also passed. The vault stays separate.

Free-tool source c2dfa09 passed full CI 41465576263: 91 unit/integration tests,
64 application browser cases and 48 public-build cases. Integration was
fast-forwarded to that validated source. Main remains ab76f00. The isolated
synthetic vault is pushed separately as 05d6a22 on
`codex/password-vault-prototype`; seven crypto/controller tests and eight local
browser cases passed. It is not merged into this integration branch or exposed
as an application route. See docs/LAUNCH-READINESS.md for the reviewed release
sequence, current production Clerk/domain requirements and remaining CPU gates.
Read-only Cloudflare checks reconfirmed both direct-upload deployment IDs are
unchanged and fail closed. No remote D1 migration was applied.

`codex/phase6-integration` consolidates validated manual Pro baseline 81d73a5;
baseline CI 41400048660 and integration checklist CI 41462004459 passed.
`codex/phase6-free-tools` adds three free entries (21 total), advanced password
and EFF passphrase generation, bulk Roblox ideas, fictional reserved-domain
identities, source-linked Minecraft browsing/opt-in status, account-owned server
favourites, recent tools and clearer expired/revoked Pro status. No main merge.

Migration 0005 is additive and remains local only. Fresh authentication/session
checks, account ownership, Pro/admin enforcement and disabled payments remain.
Favourites are exported and cascade on deletion; local backup/restore exercises
the new table. See docs/FREE-TOOLS.md for data-source constraints and rollback.

Validation: 91 unit/integration/security tests passed, TypeScript/ESLint passed,
production/Pages/public/private builds and SEO passed, Worker dry run passed,
local backup/restore passed, eight private gateway cases passed. Browser checks
cover Chromium desktop/mobile, Firefox and WebKit; final branch CI is the
authoritative complete-suite result. No hosted synthetic authentication or CPU
load was repeated: the changes do not optimize authentication and prior CPU
evidence/limitations still apply. A real, single Chromium mcstatus.io CORS request
returned HTTP 200 with the expected schema. External calls are opt-in; automated
status tests use fixtures. Screenshots are ignored local artifacts, without
generated passwords.

Minecraft intentionally does not claim a complete directory, verified countries,
game latency, supported-client versions or unverified authentication modes.
Roblox availability is not checked. No inboxes are provisioned. Vault work remains
in a separate local-only prototype branch/build, outside application routes.
Launch gates: docs/LAUNCH-READINESS.md. Public preview and private staging remain
at their existing deployments; no remote migration, public authentication,
Supabase migration, payment, purchase or billing change occurred.

## Restricted hosted manual Pro validation — 2 November 2026

This supersedes the pending-deployment notes below. Application source `cc98ed9`
is now deployed only to the existing private staging origin. Public Pages remains
unchanged at deployment `d1c4fd47-296d-4b2f-b6a5-28ed82c7ba34`.

- Verified Wrangler OAuth, ignored/valid development Clerk key, private gateway,
  service bindings, disabled Worker public URLs, fail-closed Pages and payments off.
  Saved an ignored local pre-migration backup in a user/SYSTEM-only directory.
- Applied additive migration 0004: no old table/row was changed. All 15 original
  application tables matched before/after migration, with zero FK violations.
  Safe application rollback restores prior Worker/Pages versions and retains the
  additive tables; do not drop tables containing genuine requests or grants.
- Three explicitly synthetic Clerk accounts used normal SDK sessions redeemed
  with short-lived single-use provider sign-in tickets. No Testing Tokens, password
  weakening, CAPTCHA bypass or public signup change was used. This tests real
  signed sessions/live checks, not registration, recovery or OAuth enrollment.
- All 54 hosted API/security checks passed: request/duplicate/status/injection,
  denial/approval, direct grants, exact 7/30-day durations, permanent/revoked access,
  real elapsed expiry, cross-user isolation, disabled payments and post-admin-role
  removal denial. Only the exact synthetic grant deadline was shortened to observe
  expiry; no global clock or genuine entitlement was changed.
- Eight additional real desktop/mobile UI checks passed, including submitting,
  denying, approving, directly granting permanent access and revoking through the
  actual hosted forms. An actual revoked Clerk session with an unexpired JWT
  returned 401. Successful administrative changes produced 14 expected audit
  events, plus four user request submissions; original audit entries were retained.
- Three populated-workspace workloads each returned 121/121 HTTP 200, paced below
  Clerk development limits. Cloudflare CPU p50/p95/p99 ms: 4.295/7.231/7.817,
  4.279/6.493/8.671, 4.506/6.802/7.764. Adaptive counts were 116/120/127; recorded
  runtime errors were zero. These bounded warm/read samples do not establish cold,
  maximum-export or unrestricted-load Free-plan reliability. See PERFORMANCE.md.
- Removed all synthetic accounts/data, temporary roles/grants and tester entries.
  Verified one genuine account/identity, zero admins/grants/requests and no FK
  violations. Thirteen original data tables and all eight original audit rows
  remained unchanged. Three obsolete synthetic gateway cookies were denied.
- Final API version `a6bb68f5-c199-447f-8fa5-3b4dcdae2aa5` serves 100%; private
  Pages deployment `b27c6262-bde5-45a6-b338-a3ce0648dfd8`. Worker URLs remain disabled;
  production/preview fail_open remain false. The canonical private main deployment
  is still development staging, not a public production authentication service.
- Typecheck, lint and all 83 local tests passed again. Hosted private gateway/
  accessibility browser checks passed in all four projects, and expanded HTTP
  smoke checks passed 33/33. Corrected the old payment smoke expectation to 404
  and added manual-route denial checks. CPU evidence can now use a separate
  ignored output path without overwriting prior investigations. Full CI validates
  the follow-up commit; it does not deploy.

Remaining public-signup gates: production Clerk/domain requirements, complete
registration/recovery/OAuth/deletion coverage, broader abuse/security review and
cold/heavier/max-data CPU tests. No public deployment, genuine-data migration,
domain purchase, billing change, paid service or live payment activation occurred.

## Free-first roadmap and manual Pro access — 2 November 2026

Developed independently on `codex/manual-pro-access`, based on validated
`ab76f00`. The Supabase POC remains on its separate branch. No hosted database,
Cloudflare deployment, Clerk configuration or genuine account was changed.

- Payments are hard-disabled regardless of environment flags. Ko-fi ingestion
  returns 404; authenticated claims and admin paid-flow routes return 410 after
  normal access checks. Checkout/payment links and paid management UI are removed.
  Historical payment code/data remains intact for an explicitly approved future
  review; old paid subscriptions cannot authorize Pro in this roadmap.
- Migration 0004 adds manual requests and append-only grant history (17 tables
  total). A partial unique index allows one pending request per account and one
  unrevoked current grant. Timed grants use server epoch seconds; permanent is
  explicit NULL expiry, still revocable. Admin roles, verified/enabled accounts,
  expiry and revocation are read freshly from D1, never client claims or caches.
- Users request access with an optional 500-character reason and see owned
  pending/approved/denied requests and grant history. Admins review/deny/approve,
  grant friends directly, choose 7-day/30-day/permanent durations, replace grants
  and revoke with a reason. Direct grants approve an existing pending request.
- Conditional SQL batches serialize reviews, grants and revocations and write
  their audit events atomically. Audit failure rolls back all state changes.
  Identity/session revocation and the private gateway remain unchanged. Export,
  account-deletion cascades and backup/restore cover the new access records.
- Existing admin UI now has a responsive request queue, direct recipient/duration
  controls, status filters, grant history, accessible loading/error states and
  explicit revocation. All 18 free tools and 12 Pro capabilities are retained.
  Public signup stays restricted; no development authentication is published.
- Validation: typecheck, lint and all 83 unit/integration tests passed. The eight
  targeted browser cases passed across desktop/mobile Chromium, Firefox and
  WebKit, with dark/light axe checks, overflow and request-text XSS checks. Local
  D1 backup/restore passed with the new grant and deletion cascades; Pages build
  and SEO checks passed. Two test workers avoid local CPU oversubscription while
  retaining all full-strength password assertions. Full GitHub CI runs on this
  isolated branch and never deploys.

Remaining release gates: finish CI, review/apply migration only in an approved
isolated staging update, rehearse manual flows with authorized hosted Clerk test
accounts, remeasure authenticated CPU, complete production identity/domain and
recovery/deletion/abuse/security launch checks. Prior CPU measurements do not
prove this changed API meets Cloudflare Free. Payments/billing remain disabled;
no purchase, domain, paid feature or production deployment is authorized here.

## Phase 3 CPU and security continuation — 2 November 2026

This entry supersedes the unfinished checkpoints below. The existing public
18-tool deployment remains at the Phase 2 commit and was not redeployed.

- Resume audit confirmed cleanup was already complete: zero named synthetic
  users, presets/history or test subscriptions; the one genuine staging account
  and active identity remain. Its role is free, active subscriptions are zero,
  and the staging JSON tool is enabled. No further data deletion was needed.
- The former admin session passed all 21 post-revocation checks, including 403
  for every tested Pro/admin operation. All 17 earlier hosted admin checks passed.
  Current API version a30f8ebf-bac9-42fc-9eb9-b9206829e0e1 serves 100% of restricted
  staging; workers.dev and preview URLs remain disabled. Both private Pages
  environments remain fail closed, and payments remain disabled.
- Backend commit 5ca5b98 passed full GitHub CI on main (41371358365) and the Phase 3
  branch (41371358184). Resume typecheck, lint and all 62 unit/integration tests
  passed again. Reviewed the remaining staging-only diagnostics persistence fix:
  it stores sanitized test outcomes, never tokens or authorization decisions.

- Completed invited Google registration through normal Chrome after correcting
  Clerk Protect CSP requirements. Verified the primary mailbox and immutable
  subject before enabling only that tester. No password, code or security
  challenge was entered by the agent. Development authentication remains gated.
- Verified hosted same-email collision denial, normal D1 identity provisioning,
  and rejection of a real provider token lacking the staging authorized party.
  All 21 actual free-member denial checks passed. All 27 hosted Pro storage,
  ownership, retention/export and role-injection checks also passed, including a
  repeat on the joined-read Worker. Browser-engine fixture tests are separate
  evidence; this does not claim all twelve capabilities were hosted end-to-end.
- Resumed and reviewed the uncommitted SDK reuse/error handling changes. Added
  regression tests for credential rotation, per-request session/profile checks,
  revoked sessions, redacted errors and provider throttling. Reuse only stateless
  SDK machinery and disable optional backend SDK telemetry; no auth state cache.
- Combined two existing-user D1 reads into one fresh LEFT JOIN, preserving
  deleted/deleting tombstones, disabled-account denial, ownership and role state.
  Provisioning retains collision-safe writes and a final authorization read.
  An imported-HMAC-key-cache experiment did not consistently improve the tail and
  was removed. The existing gateway key/grant verification remains unchanged.
- All 62 unit/integration tests, 48 local account/Pro/admin/browser cases, 40 local
  public-artifact cases, eight hosted gateway/accessibility cases, typecheck,
  lint, backup/restore and the private/public builds passed. Public builds reject
  accidental private QA/auth code. Full GitHub CI will validate the final commit.
- Added reproducible synthetic V8 profiling and read-only hosted CPU scripts.
  Profiles retain 400 provider session/profile checks per 400 requests and show
  D1 reads dropping from 800 to 400. Local times are not Cloudflare CPU evidence.
- Controlled hosted comparisons use 20 sequential reads and 100 reads at
  concurrency five, with pacing below Clerk development limits. The matched
  original path still measured 11.242 ms median / 48.359 ms p99. SDK-only samples
  improved to 4.898 / 7.244 ms, but a repeat reached 5.108 / 11.938 ms. The joined
  candidate with ten 2 KB presets and ten 1 KB history records measured
  4.117 / 10.476 ms. All paced browser requests succeeded; reliable 10 ms tail
  compliance is not established from those samples. The discarded crypto-cache
  experiment reached 4.071 / 11.146 ms. Retained improvements do not establish
  reliable Free-plan tail headroom; see [the performance report](docs/PERFORMANCE.md).
- The old caught HTTP 500 was not a Cloudflare CPU-exhaustion termination. Its
  original provider exception was not retained, so Clerk throttling remains an
  inference. New dependency failures return safe 503/Retry-After responses and
  log only status codes. A sanitized partial tail captured no failures in the
  first optimized workload; raw headers/tokens were not retained.
- Documented a Supabase Free backend alternative if tail headroom remains
  insufficient, including explicit migration approval and immediate revocation
  requirements. No new provider account, paid service, billing obligation or
  live payment was enabled. Temporary fixtures, admin access and subscriptions
  have been removed; genuine account data and production resources were preserved.

## Phase 3 private staging — 1 November 2026 (in progress)

- Resumed the existing work on `codex/phase3-private-staging`; the public preview
  remains unchanged at the Phase 2 deployment. Yesterday's Phase 3 edits were
  uncommitted and no application API Worker had been deployed.
- Wrangler OAuth was completed with explicit owner confirmation and restricted
  account/Workers/D1/Pages/logging scopes. Credentials are encrypted using Windows
  Credential Manager. No additional scopes or billing permissions were requested.
- The owner supplied a replacement Clerk development backend key in ignored
  `.dev.vars.staging`. File/key presence, development format, Git exclusion and
  HTTP 200 provider acceptance were verified without printing the value. Its exact
  value is absent from tracked files. No approved tester account exists yet.
- Cloudflare Access Free onboarding required payment details and authorization
  for overage charges. Exited without activating it. The owner explicitly approved
  a separate zero-billing named-key staging gateway, keeping Clerk as account auth.
- Implemented 256-bit generated tester keys (only hashes in runtime configuration),
  30-minute signed host-only Secure/HttpOnly gateway cookies, expiring/revocable
  tester grants, exact-origin mutation checks, bounded bodies and D1-backed atomic
  login throttling. SameSite=Lax permits top-level Clerk/OAuth return navigations;
  exact-origin writes and account bearer verification remain mandatory.
- Every private static/account/API path runs through the gateway. Immutable and
  alternate origins are denied. The API verifies the gateway independently and
  binds its tester identity to Clerk's verified primary mailbox. Account assets
  additionally default to disabled through STAGING_CONTENT_ENABLED=false.
- Created the free `randomtools-web-staging` Pages project. Verified both production
  and preview fail_open=false through the Cloudflare API before uploading account
  assets. Deployed `randomtools-api-staging`, version
  `1df64565-b26f-4f04-b0ab-6c4e4590d7f7`, with only the existing staging D1 binding
  and scheduled cleanup. workers.dev and version-preview URLs are disabled.
- Provisioned backend/gateway/rate-limit secrets securely; tester subjects remain
  deny-all until verified registration. Remote D1 has all three migrations and was
  checked empty (zero users, identities and subscriptions). No live payment secret
  was provisioned; PAYMENTS_ENABLED=false.
- Deployed the real private Pages artifact (`d1a1c05c`) after 15 denial-probe checks
  passed. The final API version is `1e901dc2-ea9e-4ceb-ad9d-50574fb19322`.
  All 28 hosted private HTTP checks passed, including anonymous/immutable denial,
  exact-origin logout, secure cookie flags, CSP and Clerk-required Pro/admin.
  Native browser login exposed a no-referrer/form-Origin conflict; corrected the
  private guard to same-origin and verified real browser login. The advanced
  Worker now supplies generated CSP independently of Pages asset `_headers`.
- Created the explicitly approved deletion-only Clerk webhook, stored its signing
  secret privately and provisioned the API. A genuine provider-signed example
  returned 200; unsigned delivery returned 401. No real user was deleted.
- Sent the approved development invitation and located it in Gmail Spam. Generic
  signup is restricted as intended. The in-app browser invitation flow reached
  Clerk security reference 1IKFLzKM; no security controls were bypassed. Normal
  Chrome was reconnected with owner assistance; its invitation attempt also
  reached Clerk's block (RdRPqwiA). The owner has that tab for a manual attempt.
  Account subject allowlist remains empty and no temporary Pro/admin was granted.
- All 59 unit/integration tests, the existing 48 browser tests, 40 local public
  artifact checks and eight hosted private gateway/accessibility checks passed.
  Typecheck, lint, backup/restore and private/public builds passed. The two long
  real-D1 matrices allow 30 seconds rather than five; assertions are unchanged.
- Initial Cloudflare GraphQL observation: 17 API invocations, CPU p50 3.098 ms,
  p99 24.102 ms, zero errors. Schema confirms microsecond source units. This is
  gateway/unauthenticated/webhook traffic, not a representative authenticated
  Free-plan benchmark. The high tail needs investigation; actual hosted account,
  Pro/admin and authenticated CPU tests still depend on human registration.
- Pushed the validated gateway baseline as cf541bb to main and the Phase 3 branch;
  main CI 41280783103 passed. Investigation found Clerk Protect policy blocking
  invitation signup because the generated CSP lacked the documented Protect
  script/frame/connect hosts (including non-default connect ports). Added only
  those provider domains, kept all Protect checks enabled and verified the same
  invitation reaches remaining registration fields. Private deployment c419710b
  passes all 28 boundary checks. Added a real build-script CSP regression test;
  all 60 unit/integration tests now pass, along with typecheck and lint. Google
  OAuth from the valid invitation is being tested; no password/code was entered.

## Phase 2 quality and SaaS testing — 31 October 2026

Continued the existing repository from `5a6fbc5` on `codex/phase2-quality`.
The public tools preview remains the only publicly deployed application scope.
This entry supersedes the earlier deployment and CI identifiers below.
See [the Phase 2 audit](docs/PHASE2.md) for the 18-tool review, twelve-capability
Pro matrix, security findings, provider blockers and hosted CPU acceptance steps.

- Reproduced invalid password length `0` generating a default password on the
  deployed site. Fixed explicit length validation, blank random bounds, Unicode
  title/slug conversion and standards-based HTML entity decoding.
- Fixed stale results/downloads after failures, async Reset races, same-file
  reselection, date picker synchronization, clipboard status announcements and
  result/loading guards. Added real download/corrupt-file and deferred-work tests.
- Improved whitespace search, mobile Escape/focus and navigation relationships,
  unreadable API response errors, account retry/loading feedback and Pro result
  invalidation. Managed account UI omits the local mock-payment control.
- Expanded managed-auth/real-D1 tests across every Pro storage verb, current and
  expired entitlement, cross-user records/export, retention off, role injection,
  every admin gate, self-disable denial, bound search and audit attribution.
  Missing admin targets return 404 without false audit records; unknown tool IDs
  are rejected. Backup/restore now verifies Clerk mappings and deletion guards.
- Added stateful browser coverage for Pro save/load/delete, history, preferences,
  TXT/JSON/CSV download contents and admin search/disable/reconcile/revoke/tools.
  Existing tests retain Ko-fi replay/concurrency/currency/amount/quota checks.
- All 50 unit/integration tests pass (12 files). Type checking, lint, synthetic
  Wrangler D1 backup/restore, SEO, Pages/private-staging/public builds and API
  dry run pass. The private build reports a >500 kB chunk warning; it is not
  deployed publicly and needs production performance profiling.
- Initial hosted baseline: 24 selected checks passed across desktop/mobile
  Chromium, Firefox and mobile WebKit. Expanded public-artifact suite: all 40
  passed. Local account/Pro/admin suite initially passed 43/48; four failures
  were an exact-label selector in the new admin test, and one was a Firefox
  browser-context setup crash. Corrected the selector without weakening any
  assertions; all 12 targeted admin/text/mobile cases then passed across all
  four projects. Latest managed-auth/D1 file also passed all 14 tests after
  adding positive admin disable/enable and missing-target coverage.
- Gitleaks found no secrets in all Git history, source or both build artifacts.
  Only `.env.example` is tracked. The untracked nested `RandomTools/` checkout is
  preserved and excluded from commits. No original six commits remain unpushed;
  those were included in the previously published history.
- Connected Cloudflare public-project settings still show no secrets or app
  bindings and Fail closed. Wrangler remains unauthenticated, with no local
  backend Clerk key. Real provider registration/login/recovery/deletion/webhook
  and hosted authenticated Free CPU tests are blocked, not claimed complete.
  No development authentication was exposed, password strength reduced, plan
  purchased, paid service enabled or live payment activated.

### Phase 2 hosted deployment

- Validated application source: `4cff6cc78aaba094a83fdd2137ab8ed29507b085`,
  pushed to `main` and `codex/phase2-quality` without force.
- Cloudflare deployment: `d1c4fd47-296d-4b2f-b6a5-28ed82c7ba34`.
  Stable URL remains https://randomtools-preview.pages.dev/; immutable URL is
  https://d1c4fd47.randomtools-preview.pages.dev/.
- Uploaded only `public-staging/dist`, packaged with SHA-256
  `e14603854feeb3699e4d27046f4ee0b6d5f3604307bab6643653718996c951b7`.
  Both deployed homepages match the local artifact byte for byte, set no auth
  cookie, retain security/noindex headers and deny API access with 403.
- **All 40 hosted public browser checks passed** on the updated stable hostname
  across desktop/mobile Chromium, Firefox and mobile WebKit. This includes all
  18 tools, real text/QR downloads, corrupt-image handling, mobile/keyboard flows,
  automated dark/light accessibility and denial of account/admin/Pro/payment APIs.
- Connected-browser checks confirm password length `0` now gives an error with
  no downloadable result, and a pathological regex is stopped at the one-second
  worker limit while the page remains responsive. Clerk still shows Hobby and
  invite-only; Cloudflare still shows empty secrets/bindings and Fail closed.
- Screenshots are saved outside Git under the session's `randomtools-proof`
  directory, including deployment success, live preview, password validation,
  regex timeout and public isolation settings.
- **Full GitHub CI passed** on application commit `4cff6cc`: main
  [run 41195878140](https://github.com/RandomToolsHQ/RandomTools/actions/runs/41195878140)
  and branch
  [run 41195878184](https://github.com/RandomToolsHQ/RandomTools/actions/runs/41195878184).
  This includes 50 unit/integration tests, all 48 account/Pro/admin browser cases,
  all 40 public-artifact browser cases, type/lint checks, backup/restore, builds,
  SEO and the Worker dry run. The earlier local selector/setup failures did not
  recur in the clean full CI run. The final follow-up commit changes documentation
  only; the deployed application source remains `4cff6cc`.

## Free pages.dev public tools preview — 31 October 2026

The current owner-approved scope is zero-cost staging on Cloudflare-managed
hostnames, with development authentication restricted to controlled testing.
This entry supersedes earlier plans to require a domain or publish full accounts.

### Live site and isolation

- Public staging: **https://randomtools-preview.pages.dev**. Pages project
  `randomtools-preview` uses Direct Upload in the connected Free account. Its
  stable environment is called "Production" by Cloudflare; the application is
  still a public tools preview, not an authenticated production service.
- All 18 free tools and informational pages are available. Account, admin and
  Pro workspace routes show a restricted-testing message. The public build
  replaces auth/account modules with stubs, contains no Clerk SDK/development
  keys or Pro workspace module, and has no API/D1/secret service bindings.
- The public Pages guard denies every API path with JSON 403/no-store, including
  requests with synthetic cookies or bearer credentials. It never forwards to
  the application Worker. Public assets do not create an authentication cookie.
- Verified HTTPS, CSP, nosniff, frame denial, no-referrer, HSTS and noindex on the
  real host. The first upload exposed a duplicate-header-rule issue; combined
  it into one rule, redeployed and reran hosted tests successfully. Local Pages
  previews need restart after artifact replacement to reload header configuration.
- The Cloudflare dashboard confirms no public-project secrets or application
  bindings. Configured Pages Functions to **fail closed** on free-tier exhaustion;
  static public assets remain outside the API execution routes.
- Deployed public code corresponds to `3f57beb` (the header correction after
  `d905593`). Uploaded archive SHA256:
  `8f1e6506f5b0bd235dcede65a1bb72e871093a21cefe0722adfecfd0ab630e90`.

### Clerk and D1

- Implemented maintained Clerk frontend/backend SDK integration, explicit session
  signature/issuer/frontend-party checks, active-session and verified-email
  checks, immutable subject mapping, D1 roles/Pro checks, logout/revocation,
  exports, recent-reauth deletion and signed deletion synchronization.
- Retained the legacy 600k PBKDF2 adapter solely for local regression tests;
  hosted modes reject it. Production rejects development Clerk keys.
- Existing Clerk Hobby development instance is now **invite-only**. Staging API
  also denies everyone unless their immutable Clerk subject is explicitly in
  CLERK_TESTER_IDS. No paid provider features were enabled and no invitations,
  real account emails or real payment transactions were sent by this agent.
- Staging D1 `randomtools-staging` was created free; ID
  `24d38e43-b765-4d21-b713-fce893d7317d`. All three migrations were applied via
  the connected dashboard to the empty database. Verified schema and the
  Wrangler-compatible migration ledger. Existing resources/data were preserved.
- The standalone development-authenticated Worker is **not deployed publicly**.
  Its config disables workers.dev/preview URLs and has no Paid CPU override.
  The authenticated staging frontend was not uploaded to the public site.

### Validation and source audit

| Check | Current evidence |
| --- | --- |
| TypeScript and ESLint | Passed |
| Unit/integration | 44 tests passed in 10 files; real local D1 plus mocked managed-provider boundary and real JWT verification |
| Public preview local browsers | 32 checks passed, plus four added header checks passed after restarting preview |
| Actual hosted preview | 36 checks passed in Chromium desktop/mobile, Firefox and WebKit, including all tools, themes, accessibility, headers and restriction checks |
| Existing local browser suite | All 36 cases passed across the final run and focused rerun: 34 passed in parallel; Firefox axe and one WebKit click timed out, then both passed with one worker. Includes legacy account/recovery/deletion and explicit Pro fixtures |
| Backup/restore | Real isolated Wrangler SQL export/import rehearsal passed with synthetic data |
| API Worker | Dry-run passed; no claim of hosted account CPU validation |
| Dependency audit | 0 runtime vulnerabilities |
| Secret audit | Gitleaks 8.30.1 (official archive/checksum verified) scanned history, staged patches and generated artifacts; no real secrets found |
| GitHub CI | [Run 41193014120](https://github.com/RandomToolsHQ/RandomTools/actions/runs/41193014120) succeeded on `aa13bd1`, including all 44 unit/integration tests, both full browser suites, builds, backup and dry-run checks |

An exact public Clerk publishable-key allowlist was added to Gitleaks after
reviewing that false positive. It does not allow backend secret keys. Environment
files, Wrangler state, archives, generated builds and the nested untracked
`RandomTools/` checkout were excluded from commits. Source work is on
`codex/clerk-free-staging`, retaining the original six local commits without
rewriting history. CI validates both local and public artifacts; it does not
automatically publish the authenticated application.

Verified fast-forward publication of the original six commits and subsequent
validated work to both GitHub `main` and `codex/clerk-free-staging` at `aa13bd1`.
The final evidence-only documentation update follows that CI-verified source
revision and does not change the deployed artifact or application code.

### Remaining controlled-test/production work

Wrangler login and secure staging secret provisioning remain required for the
application API. The owner created a named Clerk backend key in the dashboard;
its masked presence does not provision the Worker. Configure a separate
controlled origin, approved tester subjects and signed deletion webhooks before
hosted signup/recovery/OAuth/export/deletion tests. Measure actual Worker CPU,
rate limits and cleanup on Free before opening account functionality. The public
tools guard has passed hosted checks without executing password hashes; that
does not prove the separate authenticated API fits the 10 ms budget.

Future full production requires production identity configuration, isolated data
and secrets, ownership/recovery/lifecycle validation and policy/security review.
Clerk's production-domain requirement is a future provider constraint, not a
requirement for the live free-hostname preview. No domain has been purchased.

**No money was spent, no paid plan/trial/payment method or billing obligation was
created, and live Ko-fi payments remain disabled.** See [STAGING.md](docs/STAGING.md)
and [CLERK.md](docs/CLERK.md) for the current runbooks and limitations.

## Free-plan feasibility review — 31 October 2026

Reviewed staging/progress notes and authentication source; documented options,
security constraints, conditional deployment plan and exact approval boundaries
in [FREE-PLAN-REVIEW.md](docs/FREE-PLAN-REVIEW.md). Recommend evaluating managed
authentication while retaining Pages/Worker/D1 on Free, subject to explicit
architecture approval and hosted CPU validation. No work factor or authentication
architecture changed. The Paid-only 30k CPU override remains unchanged pending
that decision. Fresh fetch confirms the same six unpushed application commits.
Targeted audit of 67 tracked files/109 reachable historical blobs found no live
secrets; reviewed findings were test fixtures. A dedicated full secret scanner
and final-index scan remain release gates. Browser tab inventory was accessible
but page reconnection failed, so account subscription was not freshly verified.
No accounts/resources created, secrets provisioned, code pushed, service purchased,
public deployment performed or live payments enabled during this review.

## Staging preparation follow-up — 31 October 2026

- Verified access to origin with fetch/ls-remote. GitHub main remains `ab08aa1`
  (initial commit); the existing local application at `e71b218` is six commits
  ahead. No push or project recreation occurred. Preserved nested untracked
  `RandomTools/` checkout.
- Inspected the connected Cloudflare account: no Workers/Pages projects and no
  D1 databases. Displayed quotas are consistent with Free; local Wrangler is
  unauthenticated. No remote setup, purchase, email delivery, payments or
  production deployment occurred.
- Added isolated staging Worker/Pages configs, a staging build with noindex
  headers, and [the staging runbook](docs/STAGING.md). Production security mode
  is enabled; payments and email delivery remain disabled. Real origin, D1 ID,
  secrets, approved email and suitable Worker plan remain blockers.
- Revalidated TypeScript, lint, all 29 Vitest tests, Pages build and SEO checks;
  staging Worker dry-run passed and both migrations applied to isolated local
  staging D1. Confirmed Pages selects the staging service binding after adding
  the separate staging package boundary. Local staging HTML returned 200 with
  noindex headers; `/api/me` returned JSON 503 for the deliberately missing
  production security secret. Hosted behaviour and the prior browser E2E suite
  were not revalidated in this follow-up.

Updated 31 October 2026 after the follow-up implementation and hardening pass. Work is in the existing RandomToolsHQ repository. No public deployment, remote push, real email delivery, live payment activation or service purchase has occurred.

## Follow-up work completed

- Implemented an optional production Resend transport, sender/configuration validation, bounded requests, idempotency, background delivery, token invalidation on delivery failure and content-free audit events. Added resend-verification UI/API. Production cannot expose development links. Real sending remains unconfigured; see docs/EMAIL.md.
- Made verification/reset state changes and token consumption transactional. The verified mailbox owner chooses the final password, preventing credentials chosen by a pre-verification registrant from surviving activation. Added streaming byte limits, malformed-UTF-8 rejection, exact content-type/origin checks, no-referrer headers and additional secret-file ignores. Membership reconciliation and saved-preset quotas now resist concurrent writes. Reconciliation rejects non-AUD/insufficient payments and annual dates while yearly purchasing is disabled. Account exports include membership claims and linked payment records.
- Added and applied 0002_query_indexes.sql for expiry cleanup, resend lookup, audit ordering and account/payment export. Integration tests now apply every migration.
- Fixed WebKit image compression with a validated canvas fallback. Downloads use the actual WebP/JPEG/PNG format. Batch images download in a single ZIP, avoiding multiple-download blocking, with bounded output size.
- Fixed contrast issues in both themes, kept keyboard focus/skip/search controls working, and added automated axe WCAG A/AA checks on representative public pages in every browser project.
- Added static content and unique metadata for 24 public routes, noindex for 10 private/account routes, and conditional canonical URLs, structured data, sitemap and robots entry. Metadata updates on SPA navigation, including removing private-page noindex from public tools. Checked both configured-fixture and unconfigured-origin builds without retaining a fabricated public domain; the final navigation changes passed eight focused checks across all browser projects.
- Isolated browser tests on ports 5180/8788 with fresh local databases and forced development email/payment settings. Added Firefox and WebKit alongside desktop/mobile Chromium. Expanded recovery/deletion and actual ZIP-download tests, and fixed a logout navigation race in the test itself. Replaced asynchronous tool-input resets with keyed route instances so rapid initial typing cannot be cleared by a mount effect.
- Rehearsed real Wrangler SQL export/import with synthetic data, checking quoted values, workflow restoration, foreign keys and cascade deletion. No production/local application records were exported or restored. See docs/BACKUP-RESTORE.md.

## Implemented locally

- React / TypeScript / Vite / Tailwind frontend, dark blue/purple design, light preference, responsive navigation/footer, searchable category directory, favourites, reduced motion, keyboard focus/skip link and search shortcut.
- All 18 free utilities work without an account. Text stays in the browser. Regex has an isolated worker and timeout; images/hashes use a shared file worker. Unicode Base64, rejection-sampled random integers, cryptographic passwords, QR PNGs, HEX/RGB/HSL conversion with a picker, image WebP output, SHA-256 hashing and Discord tools are implemented.
- Landing, directory, tool screens, login, register, forgot/reset password, verification, dashboard, settings, subscription, upgrade, admin, privacy, terms, support and 404 routes.
- D1 accounts, salted 600k-iteration PBKDF2, verification/reset token digests, HTTP-only session cookies, expiry, logout, password changes and revocation, profile name editing, data export and password-confirmed deletion. Development verification/reset links explicitly state that no email was sent.
- All 12 Pro capabilities have implementations: batch images, batch hashes, canonical JSON comparison, bulk QR SVG generation, multi-case regex captures/replacements, batch text changes, saved presets, cloud favourites/preferences, TXT/JSON/CSV exports, multi-file workspace, saved text workflows and private history/retention. Server-backed operations check paid-through dates or admin authorization. Browser-only processing is convenience gating, not DRM.
- Ko-fi form webhook verification, unique message/transaction IDs, idempotent records, pending ownership claims, reviewed paid-through dates, manual renewal reconciliation, conservative expiry, subscription revocation and a development-only mock event provider. No email-match auto-linking. Live webhook processing is disabled by default; checkout remains disabled even if webhook testing is enabled.
- Admin counts, capped user search, disable/re-enable with session revocation, payment/claim/subscription views, audited reconciliation/revocation, tool availability and opt-in aggregate tool counts. Admin bootstrap uses an authorized D1 CLI, never submitted email or a public role endpoint.
- D1 migration, daily cleanup for expired tokens/sessions/history, data caps, origin/JSON mutation checks, validation, parameterized queries, security headers/CSP, no auth localStorage, secret ignores and environment templates.
- Separate Pages and Worker configuration, compiled API service proxy, CI checks, MIT licence and the requested contributor/security/architecture/deployment/admin/local/Ko-fi documentation.

## Validation evidence

| Check | Result |
| --- | --- |
| TypeScript | Passed |
| ESLint | Passed; generated Wrangler directories are excluded |
| Vitest | 29 tests passed in 7 files |
| Playwright | 36 tests across Chromium desktop/mobile, Firefox and WebKit; account and ZIP flows included |
| Automated accessibility | Representative public pages pass axe WCAG A/AA checks in dark/light themes across all four browser projects; not a complete manual WCAG audit |
| Local D1 migrations | Both applied successfully |
| Production frontend + Pages proxy bundle | Built successfully |
| API Worker dry run | Passed with `--config wrangler.api.toml --dry-run` |
| Built Pages local smoke test | `/tools/json` returned HTML with CSP; `/api/me` returned JSON through API service binding with `Cache-Control: no-store` |
| npm dependency audit | Full audit cleared after minimatch override; final runtime audit: 0 vulnerabilities |
| Visual inspection | Desktop landing render inspected; desktop/mobile horizontal overflow checked |
| Local backup/restore | Real Wrangler exporter/importer passed with isolated synthetic data, both migrations, constraints and deletion |
| Static SEO | 24 public/10 private pages validated with and without a fixture HTTPS origin |

Vitest uses an isolated Miniflare/workerd D1 database, not a production service. It covers registration/verification/login, reset single use, session invalidation/expiry, role injection rejection, Pro/admin restrictions, exports/deletion, webhook token rejection/duplicates, reviewed membership linking, renewal/expiry/refund revocation, concurrent reconciliation/quotas and scheduled cleanup. Production-email tests use mocked transport and check generic responses/failure cleanup without sending mail. Pro browser-engine tests use an explicitly identified entitled-account API fixture; server authorization is independently exercised in D1 integration tests. Account browser tests use the actual isolated local API.

Earlier failures (hash-library input types, test discovery, labels/selectors, corrupt image fixture and Pages config selection) were fixed and rerun. Pages preview originally selected the wrong root Worker config; the final layout makes root `wrangler.toml` Pages-only and passes `wrangler.api.toml` explicitly for all API commands.

## Remaining launch work and limits

1. Configure an owner-approved Resend account, verified sender and Worker secret; test delivery to authorized staging recipients. Delivery/resend code is implemented and tested with mocked transport. Without configuration, production registration fails closed. No real inbox delivery has been exercised.
2. Obtain owner approval for Cloudflare staging resources; replace the D1 placeholder ID, set an owned APP_ORIGIN, production secrets and isolated preview bindings. No actual hosted configuration has been tested.
3. Benchmark password hashing on the selected Workers plan. Native PBKDF2 can have a platform iteration ceiling; the audited JS fallback keeps 600k iterations but measured around 10–15 seconds under concurrent local Wrangler requests. A 30-second CPU ceiling is configured and requires a suitable paid plan. No plan has been purchased.
4. Review actual Ko-fi dashboard payloads and supported billing cadence, independently rehearse proof-of-ownership, renewals/refunds/disputes and staging webhook delivery. Do not enable payments/checkout without explicit approval. Annual purchasing remains unavailable.
5. Run independent security/accessibility review, staging rate/load tests, verify Secure cookies/headers on hosting and configure edge abuse protection. A local backup/restore rehearsal and automated cross-browser axe checks now pass; actual remote recovery and a complete manual accessibility audit remain untested.
6. Review initial legal policies for the actual business and operators. Add production contact/business details as appropriate.
7. Set VITE_SITE_URL to the owned HTTPS domain before the release build. Static public pages, canonical URLs, structured data, sitemap and robots entry are implemented and validated with a fixture origin; actual domain ownership and hosted crawler behaviour are not verified.
8. Validate physical mobile devices and production Safari/Firefox versions. Desktop/mobile Chromium, Firefox and mobile-emulated WebKit engines now pass locally. OffscreenCanvas has a fallback; Web Crypto and browser Workers remain required.

## Exact continuation

Read README, SECURITY and docs/DEPLOYMENT first. Do not scaffold again. Use Node 22.12+ and PowerShell:

```powershell
npm.cmd ci
npm.cmd run db:migrate
npm.cmd run dev:api
# Second terminal; open http://localhost:5173:
npm.cmd run dev
# Validation:
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run test:e2e
npm.cmd run check:backup
npm.cmd run build:pages
node scripts/check-seo.mjs
npx.cmd wrangler deploy --config wrangler.api.toml --dry-run
# Optional built-site local preview, while API is running:
npm.cmd run preview:pages
```

Root wrangler.toml is for Pages; wrangler.api.toml is for the standalone API. Default local authentication Origin is http://localhost:5173. Preview runs on port 8790; use the Vite origin for account mutations unless APP_ORIGIN is intentionally changed. GitHub Actions validates only and never deploys. Keep `.dev.vars`, `.env`, `.wrangler`, node_modules, dist and test artifacts untracked. Continue the launch items above before calling this production-ready.
