# Phase 2 quality and controlled SaaS testing

Public staging: https://randomtools-preview.pages.dev/

The public deployment remains tools and informational pages only. It has no
Clerk frontend, account forms, Pro workspace, admin dashboard, API service binding,
D1 binding or secrets. Its API guard denies every API request. Ko-fi is disabled.
This audit continues the existing application and migrations.

## Free tools and UX

All 18 tools are exercised through the hosted four-browser-project suite:
JSON, Base64, URL, Unix time, UUID, diff, regex, HTML, passwords, QR, word count,
case conversion, colour, random integers, images, hashes, Discord time and
snowflakes. The suite includes desktop/mobile Chromium, Firefox and mobile WebKit,
dark/light automated accessibility checks, search/navigation, API isolation and
security headers. Automated accessibility checks do not replace manual assistive
technology testing.

Fixed invalid explicit password lengths silently generating default passwords;
empty random bounds being interpreted as zero; accented slugs/title casing;
incomplete HTML entity decoding (now standards-based, without interpreting HTML);
stale downloads after invalid input; late async results undoing Reset; file input
reset/reselection; date picker synchronization; clipboard success announced as an
error; missing result/loading download guards; whitespace-padded tool searches;
Escape dismissal/focus return for mobile navigation; and unreadable platform API
errors. Pro transformations clear obsolete results and exports are disabled while
processing or empty. Account loading has an announced status and retry action.
Development mock-payment controls are absent from managed-auth account UI.

## Twelve Pro capabilities

| Capability | Evidence and authorization boundary |
| --- | --- |
| Batch image compression | Browser test downloads ZIP and verifies two image entries |
| Batch file hashes | Browser test checks known SHA-256 outputs for multiple files |
| Canonical JSON comparison | Browser test compares reordered object keys |
| Bulk QR SVG generation | Browser test generates multiple SVG records |
| Multi-case regex captures/replacements | Browser test and isolated worker limits |
| Batch text conversion | Browser test transforms multiple lines; Unicode unit regressions |
| Saved presets | Stateful browser fixture plus real D1 ownership/CRUD and quota tests |
| Cloud favourites/preferences | Browser upload/restore plus real D1 validation and ownership |
| TXT/JSON/CSV exports | Actual downloaded contents checked, including CSV formula protection |
| Multi-file workspace | Multiple hash/image inputs and archive limits |
| Saved workflows | Save/load/delete browser checks and real D1 workflow storage |
| Private history/retention | Browser save/clear plus real D1 retention-off and expiry tests |

Client-side algorithms are downloadable code and cannot provide DRM. Account UI
checks entitlement for convenience; every server-backed Pro verb checks current
paid-through entitlement (or the internal admin role). Managed-auth tests cover all
eight preferences/presets/history methods before entitlement and after expiry,
cross-user deletion attempts, immutable internal ownership and isolated exports.
No query/body-supplied user ID selects another account.

Admin browser fixtures exercise search, disable, tool availability, reconciliation,
revocation and ordinary-member denial. Real D1 tests separately cover role injection,
all admin route gates, self-disable denial, parameterized search, audit attribution,
disabled users, duplicate/concurrent reconciliation, quota races and membership
revocation. Browser fixtures prove UI behavior, not provider authentication.
Missing account/subscription targets now return 404 without misleading audit
entries; tool availability changes reject unknown catalogue IDs. Backup/restore
also verifies immutable identity mappings and deletion guards.

## Security review and remaining identity gates

D1 statements bind user values. Export table names are a fixed internal list.
Identity mapping uses issuer plus immutable Clerk subject, never email ownership
or frontend role claims. Verified mailbox, provider session status/expiry, banned/
locked status, local disabled state and staging subject allowlist are checked.
The staging allowlist defaults to deny all. Hosted legacy password endpoints are
disabled; the legacy 600,000-iteration PBKDF2 work factor is unchanged.

Clerk deletion needs recent signed reauthentication. D1 is disabled before provider
deletion; failure leaves a disabled `deleting` identity requiring operator recovery.
Signed deletion webhooks and tombstones prevent reactivation of deleted mappings.
Account data deletion cascades workspace data; minimal audit records and unlinked
payment events remain. A production retention/privacy policy must cover those
records and provider-side data, not promise deletion of every billing record.

Ko-fi accepts bounded form payloads only when explicitly enabled with a backend
verification token, compares hashed secrets, deduplicates transaction/event IDs,
stores minimal fields and grants no access automatically. Reconciliation requires
independent ownership verification and a matching pending AUD membership payment.
Renewals/refunds/disputes need operational reconciliation; no automatic cancellation
detection is promised. Live payments remain disabled and were not tested live.

Wrangler is unauthenticated and the existing Clerk backend key has not been
provisioned locally or in a Worker. There is no controlled authenticated hosted
frontend/API deployment. Real registration, Google/GitHub login, logout, recovery,
session expiry, deletion and signed webhook delivery therefore remain unverified.
Local provider mocks, real RSA verifier tests and legacy account browser tests must
not be reported as hosted Clerk success. See STAGING.md and CLERK.md for setup.

## Workers Free CPU acceptance procedure (blocked, not measured)

[Cloudflare limits](https://developers.cloudflare.com/workers/platform/limits/)
currently specify 10 ms CPU per Free invocation. Network waiting is not CPU;
neither HTTP wall time nor local test duration establishes compatibility. Managed
auth removes password hashing from the hosted API, but signature verification,
SDK processing, two provider lookups, D1 work and serialization still require
measurement. Do not weaken password hashing or remove revocation checks to pass.

After the owner completes secure CLI authentication and secret provisioning:

1. Establish a separate controlled Pages origin and API service binding with
   workers.dev/preview URLs disabled. Verify edge access restrictions on both
   stable and immutable URLs before loading development authentication.
2. Set exact HTTPS APP_ORIGIN and named tester subjects in Worker secret storage;
   verify outsiders, missing/expired/revoked tokens and legacy cookies are denied.
3. Use only authorized synthetic test accounts/data. Capture Free-plan Worker CPU
   metrics/logs through available free dashboard diagnostics; never log tokens,
   keys, emails, request bodies or exported data. Do not enable a paid feature.
4. Measure cold starts and warm `/me`, subscription, preferences, presets, history,
   account export and admin reads/writes. Include maximum supported preset/history
   sizes, expired memberships, revoked sessions and provider failure paths.
5. Start with 20 sequential requests per case; then 100 requests at concurrency
   five. Stay inside Clerk/Cloudflare Free quotas and stop on throttling or resource
   errors. Record CPU p50/p95/p99/max separately from end-to-end latency, cold/warm
   status, errors and request counts. Exercise scheduled retention on bounded
   synthetic datasets separately.
6. Require representative CPU below 10 ms with margin and no 1102 errors before
   opening account access. If it fails, investigate measured hotspots and review
   alternatives explicitly; never activate a paid plan or silently change auth.

Missing credentials and verified private hosting block these measurements. Public
tool timing is unrelated because tools run in the browser. Future production also
requires a production identity instance/domain arrangement, OAuth configuration,
abuse/load and manual accessibility review, operational recovery/backup exercises,
and explicit approval before any paid feature or payment activation.
