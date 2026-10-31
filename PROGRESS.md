# RandomTools implementation status

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
