# RandomTools implementation status

## Hosted Firebase validation completed — 4 November 2026

This section supersedes the historical blocked/deployment statements below.
Source 3d11136 passed [CI 41761967310](https://github.com/RandomToolsHQ/RandomTools/actions/runs/41761967310).
Only the isolated Firebase POC was updated: Pages bbf58e34-9d62-47c8-b775-8384b8b5e38e,
Worker 9315cec5-3272-4bfc-b454-e609e3f38cdf. Public and Clerk deployment IDs
remain unchanged. No schema migration, genuine account change or public launch.

Three synthetic accounts completed official email action verification, password
sign-in and immutable D1 mapping. Hosted checks covered expired/invalid tokens,
independent-session disable/revocation, refresh-token rejection, logout, application
session expiry, ownership, export, manual Pro request/denial/approval, 7/30-day and
permanent grants, expiry/revocation, admin denials and audit events. Official recovery
and password change passed, including consumed-link and previous-password rejection.
The actual account-deletion API removed the member at Firebase and cascaded D1 data.
All remaining synthetic Firebase users were deleted. Former admin immediately lost
Admin and inherent Pro. D1 users/grants/sessions/presets returned to zero; minimal
audit records and identity tombstones remain. The 100-preset cap passed hosted
testing; 97 precisely identified quota fixtures were removed, preserving originals.

Hosted desktop/mobile account/admin checks: 34/34, including accessibility and
overflow. Functional ledger records 150 passing checks and three historical harness
failures: a mismatched gateway/session cookie pair, redundant gateway authentication
rate limiting, and an expired gateway during cleanup. Corrected, server-validated
gateway contexts passed the intended tests; failures were retained as evidence.
Verification initially encountered Firebase TOO_MANY_ATTEMPTS_TRY_LATER; paced
official actions subsequently succeeded. Inbox delivery and Google OAuth remain
untested (no approved synthetic Google identity). In-memory persistence is deliberate;
browser reload requires sign-in. Hosted tests do not establish production readiness.

Repeated successful owned workloads on Worker 9315cec5 (milliseconds):

| Workload/run | Requests | CPU p50 | CPU p95 | CPU p99 | Trace max | Client p50/p95/p99 |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Populated reads 1 | 40 | 5.441 | 7.155 | 9.516 | 9 | 603.84 / 728.40 / 731.95 |
| Populated reads 2 | 40 | 5.264 | 7.341 | 7.519 | 7 | 598.88 / 636.54 / 640.35 |
| Populated reads 3 | 40 | 5.582 | 7.771 | 9.615 | 9 | 606.97 / 682.82 / 702.55 |
| Mixed read/write 1 | 12 | 11.465 | 17.981 | 17.981 | 17 | 722.40 / 1035.46 / 1035.46 |
| Mixed read/write 2 | 12 | 10.213 | 15.188 | 15.188 | 15 | 662.69 / 795.48 / 795.48 |
| Mixed read/write 3 | 12 | 11.347 | 14.907 | 14.907 | 14 | 663.97 / 709.50 / 709.50 |

CPU quantiles are adaptive GraphQL estimates; coarse boundary buckets include one
extra read preflight and two mixed preflights in first runs. Trace maxima are
whole-millisecond realtime measurements matched to exactly 40/12 accepted owned
requests per run. Mixed traces exceeded 10 ms on 17/36 requests. All 156 workload
requests succeeded: zero authentication failures, provider throttles or CPU-limit
errors. Negative security requests were excluded. First observed authenticated
request used 16 ms CPU/766 ms wall; it is a cold-start candidate, not a forced-cold
measurement. Successful bursts do not prove reliable Workers Free compliance.

Recommendation: Firebase Spark is a viable authentication candidate on pages.dev,
but NO-GO for public migration/launch on this backend until mixed CPU reliability
and remaining delivery/OAuth/abuse/recovery gates are resolved. Stop speculative
optimization. A separately approved isolated Supabase API/Postgres benchmark is a
possible next experiment, not a migration recommendation. Keep both current sites.

Fresh approved two-hour IAM setup used only four Firebase Auth permissions and
15-minute impersonated tokens. Both bindings removed; test service account and two
custom roles deleted; old token denied; project IAM/service-account baseline matched.
Remote token/fixture files removed, no permanent key or source credentials exported.
gcloud cannot revoke Cloud Shell's GCE-provided credentials; the VM session was
explicitly terminated using Restart and the tab closed without authorizing a new VM.
Local temporary fixture credentials were removed after cleanup verification.
Billing remained unattached/disabled; live payments and IP lookup remain disabled.

Local final unit/integration tests: 177/177; offline IAM guards: 7/7.
Typecheck and lint passed. Final operator/documentation milestone CI is recorded
in the branch workflow after push; earlier source CI is linked above.

Full implementation CI for 5cce6db passed
[run 41689385444](https://github.com/RandomToolsHQ/RandomTools/actions/runs/41689385444):
175 unit/integration tests, five offline IAM-helper guards, 84 application
browser cases, 52 public-artifact cases, 12 Firebase UI cases and five Auth
Emulator lifecycle checks (333 checks). Typecheck, lint, dependency audit,
backup/restore, SEO, builds and both Worker dry runs passed. An additional 52
hosted public-site browser cases passed without changing deployments. These are
not positive hosted Firebase lifecycle or CPU evidence.

## Phase 10 release candidate — 4 November 2026

Branch `codex/phase10-release-readiness` continues 5947737 without changing public,
Clerk or Firebase deployments. Founder/Admin, genuine data, password-vault
isolation and payment hard stops remain untouched.

Implemented the thirteenth planned Pro capability, IP Intelligence Lookup,
behind a default-off Worker flag. Fresh D1 Pro checks precede a fixed free HTTPS
provider request. Public-IP validation, consent, timeout/size limits, per-user
and shared counters, cooldown, no-store responses and no search persistence are
tested. Missing fields are unavailable; country timezone candidates are not an
exact timezone. Provider terms/privacy and deployment gates are documented in
docs/IP-INTELLIGENCE.md. No provider account or payment method was configured.

Fixed saved workflow configuration validation, corrupt-JSON loading, preservation
of empty regex flags/replacement and stale exported results. Added a busy-state
guard for batch file inputs and stronger WebKit readiness assertions. The prior
WebKit hash/image batch failure now passes individually. Local unit/integration
suite: 175 passing tests across 24 files. All 80 application browser cases and
52 public-artifact cases passed across desktop/mobile Chromium, Firefox and
WebKit. Another 52 read-only hosted cases passed against the unchanged public
website, including direct denial of the new Pro lookup path. Firebase UI has
12 passing fixture cases, and the official local Auth Emulator passed five
lifecycle checks. Five offline keyless-helper guards pass even under python -O.
Typecheck, lint, root npm audit (zero findings), redacted staged/commit secret
scans, backup/restore, SEO, all builds and both Worker dry runs passed locally.
Firebase UI fixes clear stale privileged views and complete local logout while
warning if server revocation fails. Final source CI is being verified separately.

CI subsequently caught Linux mobile overflow in the account workspace. Grid
tracks now use minmax(0,1fr), panels can shrink and input margins stay within the
available width; overflow assertions remain enabled and now include diagnostics.
A deterministic regression reproduced busy-state leakage across unfinished
account forms. Account route elements now have distinct keys, and recovery tests
wait for the destination form before filling it. Added browser coverage for IP
copy success/failure and dark/light accessibility. No assertion was disabled.
The expanded application suite contains 84 cases. Final run status is available
in [branch CI](https://github.com/RandomToolsHQ/RandomTools/actions?query=branch%3Acodex%2Fphase10-release-readiness).

Source 5cce6db passed all 84 application cases on Linux CI, including the former
overflow failures. A fresh Windows run passed 83; the grouped 13-tool Firefox
test reached the final correct result but exhausted its 30-second whole-test
budget under tracing. Its budget is now 90 seconds, matching the existing
multi-page accessibility budget; per-assertion checks and retries are unchanged.
The final workflow verifies this adjustment. Another metadata-only hosted check
confirmed the isolated Firebase D1 ID, existing gateway/rate-limit secret names,
absence of the genuine D1 binding, and IP lookup disabled. No values were shown.

The full account/staging build still emits Vite's existing >500 KiB chunk warning;
the tools-only build's largest entry is about 438 KiB before gzip. Firebase CLI's
temporary emulator install emits upstream deprecation/Node 26 engine warnings;
CI uses Node 22. These warnings were not suppressed or represented as audit passes
for the Firebase CLI's separate dependency tree.

Phase 9.2 fixed missing Firebase rate-limit-secret handling to fail closed
(753d257). Positive hosted Firebase lifecycle and representative CPU validation
remain blocked; no authenticated success CPU quantiles are claimed. Spark is a
possible no-domain alternative, but public launch/migration remain NO-GO until
hosted lifecycle, revocation, recovery/deletion and CPU gates are complete.

Phase 9.1 update superseding the historical entry below: owner device verification
and earlier Cloud Shell source authorization succeeded. IAM/IAM Credentials APIs
were enabled with billingEnabled=false. The prepared helper was not executed;
this workflow issued no temporary grants or impersonated tokens. Current console
inventory shows only the original SDK service account with No keys. Full project
IAM policy/custom-role verification remains pending. The old two-hour approval
window is no longer current; renewed scoped approval is needed before new grants.

## React Router compatibility upgrade — 4 November 2026

Reviewed package.json, the lockfile and every routing import on the existing
codex/firebase-free-poc branch. The app used react-router-dom 7.18.5 (and its
react-router 7.18.5 dependency) with React/React DOM 19.3.1. Routing is declarative
BrowserRouter + Routes/Route, including /tools/:id, account/admin routes and
public-tools-only account restrictions. No data loaders or React Router framework
plugin is used. Server-side permissions remain authoritative.

Confirmed react-router 8.5.1 is npm's stable latest release. react-router-dom
ends at 7.18.5: v8 removes the compatibility package, so imports now use
react-router directly, pinned to 8.5.1. Existing React and type versions meet
the peer requirements. Documented/enforced Node minimum is now 22.22.0.
No route paths, Clerk configuration, API permissions or deployments were changed.
The Firebase POC has its own independent frontend and no React Router imports.

Commit 5947737 GitHub validation run 41680865066 passed, including the then-current
unit, browser, Firebase UI/emulator, build and deployment dry-run checks.


## Phase 9.1 — keyless hosted validation in progress, 3 November 2026

Rechecked branch/CI and Cloudflare deployment IDs: public, Clerk Pages/API and
isolated Firebase Pages/API are unchanged. Firebase remains Spark ($0); Google
Cloud explicitly reports no billing account. The existing Firebase service
account shows No keys. The old private-key dialog was cancelled. Owner approved
Google Cloud terms (marketing off) and the exact temporary custom-role setup
documented in docs/FIREBASE-POC.md. No IAM grants, API activation or token issuance
has occurred: Cloud Shell requires Google device/phone verification, which is
left to the owner and must not incur SMS/payment charges or be bypassed.

Prepared narrower-than-Auth-Admin role JSON: four Firebase user permissions and
only getAccessToken on a dedicated test service account, both time-bounded to
two hours. Admin token input is capped at 15 minutes and verification links must
match the exact isolated Firebase domain. Added a bounded, paced hosted read
workload runner and three measurement-policy regression tests. Denied,
wrong-owner, mixed or incomplete intervals cannot produce authenticated CPU
quantiles. Hosted preflight correctly refused the still-unverified test member;
no benchmark samples or representative CPU measurements were generated.


## Phase 9 — isolated Firebase Spark proof of concept, 3 November 2026

Branch `codex/firebase-free-poc` continues verified Phase 8 commit 2a4f38e.
It adds a separate Firebase frontend/API and synthetic-only D1; the public
21-tool site, Clerk staging, genuine Founder account, billing and payments remain
unchanged. No migration, public signup activation or merge to main is authorized.

Firebase project `randomtools-firebase-poc` is Spark ($0), with email/password
and Google enabled and the separate pages.dev hostname accepted. The POC is at
https://randomtools-firebase-poc.pages.dev/ behind a distinct named-key gateway,
exact synthetic UID allowlist and isolated-database marker. Worker and preview
URLs are disabled. The Worker verifies real RS256 Firebase tokens, performs a
fresh provider lookup/revocation check on every request, and requires a revocable
D1-backed application cookie. Existing fresh Pro/admin authorization is reused.

119 local unit/integration tests pass, including actual RSA signatures and D1
ownership/session/audit rollback tests. Eight POC desktop/mobile browser cases and
five official local Auth Emulator lifecycle checks pass; those are explicitly
not hosted provider-flow evidence. Hosted testing passed 28 checks: actual
synthetic password sign-in, anonymous gateway denial, unverified-email denial,
signature-tampering denial, protected frontend rendering and mobile/desktop
accessibility. A Pages immutable-response-header failure found during smoke
testing was corrected and covered by a regression test. The Firebase popup
resolver is configured explicitly; provider initialization failure is tested,
while successful Google enrollment remains unproven. Initial Windows Firefox
timeouts in existing app/public suites passed on serial targeted reruns.
Source 92c9bb3 passed full GitHub CI 41610414829: 119 unit/integration,
eight Firebase UI, five Auth Emulator lifecycle, 68 existing app browser and
52 public-artifact browser tests; lint/typecheck, restore rehearsal, SEO,
builds and Worker dry runs all passed. Root npm audit and branch secret scans
have zero findings. Only this isolated POC was deployed; no existing public or
Clerk staging deployment was changed.

No Firebase Admin private key was generated. The owner requested a keyless
approach. Ordinary Worker requests already need no privileged credential.
Privileged verification/reset-link and provider-revocation tests await approved
short-lived administrative authorization; local gcloud/ADC is absent and browser
control became unavailable. Prefer a dedicated Auth-only service account with
temporary impersonation over a persistent key, verifying no billing requirement
first. The local admin harness refuses private/refresh-key files.

Verified hosted workspace/Pro/admin/deletion/revocation workloads, actual mailbox
recovery, Google enrollment and representative CPU measurements remain blocked.
Unverified-token denials are not presented as successful authenticated workload
or Free-plan compliance. See docs/FIREBASE-POC.md for credential alternatives,
quotas, implementation boundaries and the migration design (not executed).


## Phase 8 — restricted account release candidate, 3 November 2026

Branch `codex/phase8-account-readiness` continues the Founder bootstrap and
preserves the public 21-tool deployment `81de8536-ed2f-4204-941b-ada7fcba1c2a`.
Main remains ab76f00. No vault merge, schema migration, genuine account change,
billing, payment activation or public authentication deployment occurred.

Implemented typed managed deletion confirmation, guarded/busy account controls,
recovery and verification guidance, profile ownership explanation, Pro reason
privacy guidance and responsive structured audit events. Server guards protect
all admins against app self-deletion and other-admin disabling. Deletion rereads
the role, atomically audits/disables, treats provider 404 as already deleted, and
atomically completes audit/tombstone/cascades. Unknown signed deletion events
retain tombstones. Provider outages stay disabled; operator-assisted recovery is
documented. App protection cannot prevent direct provider deletion by the owner.

Production accounts now require an explicit PUBLIC_ACCOUNTS_ENABLED=true switch
and live provider configuration. Signed deletion delivery remains available when
accounts are closed, but production webhook configuration must still be live.
No JWT, expiry, revocation, ownership, Pro/admin or audit protection was removed.

Source c9192bb passed full CI 41578261883: 104 unit/integration tests, 68 app
browser and 52 public-artifact browser cases, typecheck, lint, restore rehearsal,
builds, SEO and deploy dry run. Eight hosted anonymous gateway browser tests
passed. Follow-up 8067d9c adds webhook/recovery regression coverage; full CI
41579892734 passed with 106 unit/integration tests, 68 app and 52 public browser
cases plus the other build/security/backup checks. Its 24 Clerk tests also pass
locally with typecheck and lint.

Hosted synthetic testing passed 81 assertions (66 distinct checks), including
real Clerk SDK ticket sessions, immutable mapping, role injection denial,
request duplication/decisions, direct grants, expiry, revocation, populated
workspace ownership/export, mobile/desktop settings/admin/Pro accessibility,
actual managed account deletion with cascades/audit, live revoked-token denial,
and ordinary-member denial after synthetic admin demotion. Tickets provisioned
test sessions; they do not prove public registration, mailbox recovery or Google/
GitHub enrollment. Human verification/security flows were not bypassed.

All 120 paced authenticated measurement requests returned 200; sampled CPU p99
was 9.553 / 8.692 / 9.120 ms, with zero sampled runtime errors. No Clerk throttling.
One analytics budget delay resolved after reset. See PERFORMANCE.md for counts,
latencies and limitations. Earlier Free-plan >10ms spikes remain a launch gate.

Cleanup removed all three synthetic provider/D1 accounts and their owned records,
retaining minimal deleted identity tombstones/audits. Seventeen original tables,
original identity rows and original audits were preserved; one genuine enabled
verified Admin remains. All retired gateway keys/cookies reject with 403. The
original key works. An existing gateway login rate bucket was allowed to expire
without clearing or bypassing it. Twenty-four cleanup/preservation assertions
passed. A subsequent full gateway/CSP/Clerk-required/payment smoke check passed.

Final deployment: Worker cd310326-d6c2-4b5b-af3c-0f499e84d32f at 100% from
8067d9c; private Pages 5d3c61a8-a658-409a-941d-1a07147dcfd6 from frontend
c9192bb. All 30 final gateway/CSP/Clerk-required/payment checks passed. Direct
Worker and preview URLs remain disabled; public Pages has no D1/service binding.

All 21 live public routes retain correct tool titles and no Clerk configuration;
the public deployment ID is unchanged. Gitleaks scanned all 34 reachable commits
with no leaks; the subsequent 8067d9c commit also passed its own scan. Local
secrets, staging env and .wrangler files are Git ignored. Eight synthetic
credential/session files were removed after final activation/verification.

The frozen 57-file restricted frontend artifact has manifest SHA256
46ac1b6265c48cda53accd6b5b9799a7126b9cec19099e65bd1dbabf8e8473dd (c9192bb).
It is not authorized for public deployment. PUBLIC-ACCOUNTS.md contains the
source-linked auth comparison, release gates, deletion recovery and rollback.
Clerk production needs owned-domain DNS; no supported DNS-free Pages production
setup was verified. Recommend an isolated Firebase Authentication Spark proof of
concept for strict zero purchasing, not an unapproved provider switch. Supabase
and Auth0 default email delivery also have production constraints.

## Founder/Admin bootstrap — applied and verified, 3 November 2026

After explicit owner confirmation, promoted Clerk account
`user_3LUhsYBgMoYC8DxgFjnXhOKh19G` from free to permanent staging admin.
Existing admin authorization provides inherent Pro without an expiry or separate
grant. Atomic audit `founder_bootstrap_66d01a3dc47f2d40d7cf05a2648a9f05`
records `admin.bootstrap.founder`; receipt verifies audit success, temporary
trigger removal and unchanged non-role account fields. No other account changed.

Verified with the owner's genuine existing Chrome/Clerk session after refreshing:
Pro workspace rendered; Admin dashboard loaded one registered/admin account and
one active Pro user; audit UI displayed the exact bootstrap event. No admin writes
were performed during UI verification. Anonymous private dashboard/API requests
remain 403, as does the public API. Public deployment and restricted gateway,
Clerk configuration, payments and billing were not modified.

Bootstrap commit 76d0d9d passed full GitHub CI run 41576500441, including unit,
integration, browser, public-build, backup, typecheck, lint and deployment dry-run
checks. Re-ran all 24 focused bootstrap/manual-Pro tests after promotion: passed,
including ordinary-user authorization and escalation protection. The protected
plan is consumed; this is the explicitly approved genuine owner role, not a
temporary fixture to remove. Main remains unchanged.

### Preparation history

Inspected live Clerk identity and active D1 issuer/subject mapping. The genuine
verified enabled account was free, with no admins or Pro grants. No remote
privilege/schema/audit changes were made during preparation.

Added an operator-only, staging-pinned bootstrap CLI and atomic audit SQL. Its
24-hour protected plan binds the exact Clerk ID, D1 ID, account fingerprint and
one-time operation; application roles/claims/emails cannot invoke it. Applying
requires exact confirmation arguments after owner approval. A temporary audit
trigger makes promotion and admin.bootstrap.founder atomic, then is removed.
Admin inherits non-expiring Pro through existing server checks; no payment or
separate subscription/grant is introduced. Owner dashboard verification will use
normal Clerk authentication, with any human security prompts left to the owner.

All 95 unit/integration tests passed, including 24 focused bootstrap/manual-Pro
cases, plus typecheck and lint. Root lint now explicitly scopes its TS config and
ignores the pre-existing untracked nested checkout, which was left untouched.
No application deployment, public registration, billing or main merge occurred.

## Approved Phase 7 public-only release — 3 November 2026

The owner explicitly approved only frozen artifact SHA256
41e903db978d3ab79af68175bc05af8fa99cc4270d52a23b714ea94428ba7bc9.
Recomputed the complete 51-file manifest before deployment and matched the exact
approved files; no rebuild. Deployed source a04a522 to randomtools-preview Pages:
81de8536-ed2f-4204-941b-ada7fcba1c2a. Live: https://randomtools-preview.pages.dev/.
Previous deployment d1c4fd47-296d-4b2f-b6a5-28ed82c7ba34 remains available for
immediate rollback. Rollback was not required.

All 21 tool routes and all 48 externally served static file hashes matched.
124 deployment assertions passed, including 45 GET/POST/DELETE API-denial cases,
21 directory cards, mobile overflow checks and unchanged private deployment IDs.
All 52 hosted browser cases passed across Chromium desktop/mobile, Firefox and
WebKit, including accessibility, navigation, generators and downloads. One real,
opt-in Java status lookup returned provider HTTP 200; ordinary deterministic
Minecraft tests use provider fixtures. No Clerk authentication loaded publicly.
Private staging /api/me, /api/admin and /api/pro/presets still return anonymous
403. Public API guard remains 403/no-store, with no D1/service bindings and
fail-open disabled. Evidence/screenshots: ignored .wrangler/phase7-public-release.

Restricted Pages 3c60091c-ad13-4ebd-9263-159c46d06890 and API version
876ed2a4-b1c7-4d36-a6d5-6633cdfc51a1 remain unchanged. No restricted staging,
D1, Clerk, payment, billing or Supabase change; no vault deployment or main merge.
Public free tools are released; production authenticated SaaS remains restricted
by the previously documented CPU/identity/recovery launch gates.

## Phase 7 — restricted acceptance and public candidate, 3 November 2026

Branch `codex/phase7-release-candidate` continues validated Phase 6 source 39668c9.
Vault branch excluded; main remains ab76f00. Follow-ups: 68e0832 waits for fonts /
two paint frames before contrast snapshots; a04a522 fixes documented Bedrock
version.name parsing. Full source CI 41478963634 passed: 93 unit/integration,
68 app-browser and 52 public-artifact cases, TypeScript, lint, backup/restore,
builds, SEO and dry run. Eight local private-gateway cases also passed.

Before remote migration 0005, the D1 export was restored locally with all 18 old
tables equal and no FK errors. Applying the additive migration preserved all
17 old application tables. Final cleanup confirms 15 non-operational old tables
unchanged and all original audits retained: one genuine ordinary account and
one identity remain, zero admins/grants/requests/favourites, no FK violations.
Backups/snapshots remain ignored and user/SYSTEM-only. No genuine-user mutation.

92 hosted checks passed using three disposable Clerk accounts, normal supported
SDK ticket sessions and expiring named gateway keys. Real desktop/mobile flows
cover free generators/downloads, recent tools, favourite persistence/ownership /
export, Pro requests/decisions/direct grants/expiry/revocation and admin audits.
Live opt-in Java status succeeded. A final hosted provider-schema fixture verifies
the Bedrock fix; it is not a live Bedrock availability assertion. Revoking a real
synthetic Clerk session rejected its still-unexpired JWT with 401.

All 847 paced requests returned 200. Candidate CPU p99 in three initial runs:
10.388/9.418/9.164 ms. Matched prior runs: 10.204/19.760 ms; matched candidate:
6.968/10.132 ms. No consistent regression observed, but no Free CPU guarantee;
aggregated/adaptive samples, cold/write-heavy/max-data and provider retries limit
the evidence. Details: docs/PERFORMANCE.md. No authentication checks were weakened.

Teardown caught stale tester authorization after ordinary secret updates. A
fail-closed binding reset plus clean version upload / version-aware secrets /
explicit 100% deployment resolved it. All three retired keys now deny; original
tester gateway works; gateway alone cannot access account favourites. Temporary
diagnostics and seven credential/session files were removed. 21 final hosted
checks and final preservation checks pass. See docs/STAGING.md for the procedure.

Current private source a04a522: API version 876ed2a4-b1c7-4d36-a6d5-6633cdfc51a1,
Pages 3c60091c-ad13-4ebd-9263-159c46d06890. Public deployment remains
d1c4fd47-296d-4b2f-b6a5-28ed82c7ba34. Payments off, Worker public/preview URLs off,
Pages fail closed. No spending, billing, Supabase migration or main merge.

Public-only RC is frozen under ignored .wrangler/phase7/public-release-candidate-v2:
51 files, 21 tools / 27 public pages, source a04a522, aggregate manifest SHA256
41e903db978d3ab79af68175bc05af8fa99cc4270d52a23b714ea94428ba7bc9.
No Clerk/QA/vault markers were found. It remains UNDEPLOYED pending explicit
approval to update only randomtools-preview.pages.dev and its API-denial guard.
No public signup, account/Pro/admin API, D1 migration, vault, payment or main merge
is included in that approval. Preserve the current public deployment for rollback.

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
