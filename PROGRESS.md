# RandomTools implementation status

Updated 31 October 2026. Work is in the existing RandomToolsHQ repository. No public deployment, remote push, real email delivery, live payment activation or service purchase has occurred.

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
| Vitest | 20 tests passed in 5 files |
| Playwright | 12 desktop/mobile tests passed |
| Local D1 migration | Applied successfully |
| Production frontend + Pages proxy bundle | Built successfully |
| API Worker dry run | Passed with `--config wrangler.api.toml --dry-run` |
| Built Pages local smoke test | `/tools/json` returned HTML with CSP; `/api/me` returned JSON through API service binding with `Cache-Control: no-store` |
| npm dependency audit | Full audit cleared after minimatch override; final runtime audit: 0 vulnerabilities |
| Visual inspection | Desktop landing render inspected; desktop/mobile horizontal overflow checked |

Vitest uses an isolated Miniflare/workerd D1 database, not a production service. It covers registration/verification/login, reset single use, session invalidation/expiry, role injection rejection, Pro/admin restrictions, exports/deletion, webhook token rejection/duplicates, reviewed membership linking, expiry and scheduled cleanup. Pro browser-engine tests use an explicitly identified entitled-account API fixture; server authorization is independently exercised in D1 integration tests. The account browser tests use the actual local API.

Earlier failures (hash-library input types, test discovery, labels/selectors, corrupt image fixture and Pages config selection) were fixed and rerun. Pages preview originally selected the wrong root Worker config; the final layout makes root `wrangler.toml` Pages-only and passes `wrangler.api.toml` explicitly for all API commands.

## Remaining launch work and limits

1. Configure an approved production email provider and implement delivery/resend. Production registration currently fails closed. The documented development adapter fully supports local testing and is not a mail service.
2. Obtain owner approval for Cloudflare staging resources; replace the D1 placeholder ID, set an owned APP_ORIGIN, production secrets and isolated preview bindings. No actual hosted configuration has been tested.
3. Benchmark password hashing on the selected Workers plan. Native PBKDF2 can have a platform iteration ceiling; the audited JS fallback keeps 600k iterations but measured around 10–15 seconds under concurrent local Wrangler requests. A 30-second CPU ceiling is configured and requires a suitable paid plan. No plan has been purchased.
4. Review actual Ko-fi dashboard payloads and supported billing cadence, independently rehearse proof-of-ownership, renewals/refunds/disputes and staging webhook delivery. Do not enable payments/checkout without explicit approval. Annual purchasing remains unavailable.
5. Run independent security/accessibility review, staging rate/load tests, verify Secure cookies and headers on hosting, configure edge abuse protection and test database backup/restore. Current tests cover accessibility basics, not a full WCAG audit.
6. Review initial legal policies for the actual business and operators. Add production contact/business details as appropriate.
7. Set VITE_SITE_URL to the owned HTTPS domain before the release build. Canonical URLs and sitemap generation are conditional rather than fabricated. Add the sitemap URL to robots.txt; consider static prerendering for search engines (current route metadata updates client-side).
8. Validate real mobile Safari/Firefox behaviour. Browser tests currently use Chromium at desktop/mobile viewports. OffscreenCanvas/Web Crypto/Workers are required.

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
npm.cmd run build:pages
npx.cmd wrangler deploy --config wrangler.api.toml --dry-run
# Optional built-site local preview, while API is running:
npm.cmd run preview:pages
```

Root wrangler.toml is for Pages; wrangler.api.toml is for the standalone API. Default local authentication Origin is http://localhost:5173. Preview runs on port 8790; use the Vite origin for account mutations unless APP_ORIGIN is intentionally changed. GitHub Actions validates only and never deploys. Keep `.dev.vars`, `.env`, `.wrangler`, node_modules, dist and test artifacts untracked. Continue the launch items above before calling this production-ready.
