# Local development

Follow README commands. Wrangler creates local SQLite/D1 state under ignored `.wrangler`. Copy `.env.example` to `.dev.vars`; never commit that file. No live credentials are needed. Keep ENVIRONMENT=development and PAYMENTS_ENABLED=false.

Register and open the development verification link displayed by the form; no email was sent. Choose your final password on the verification screen and then sign in. Forgot password likewise displays a local reset link. Links expire (verification 24 hours; reset 30 minutes). Sessions last seven days.

Use the protected admin bootstrap in ADMIN-SETUP, create a mock payment, submit its transaction ID as a membership claim, then reconcile as admin. Mock events exist only in development and never call Ko-fi. Entitlement checks use actual paid-through timestamps.

Required bindings/configuration:

| Name                    | Purpose                                                   |
| ----------------------- | --------------------------------------------------------- |
| DB                      | D1 binding, migrations in `migrations/`                   |
| APP_ORIGIN              | Exact browser origin; local http://localhost:5173         |
| ENVIRONMENT             | development, test or production                           |
| PAYMENTS_ENABLED        | false by default; true only after explicit review         |
| KOFI_VERIFICATION_TOKEN | Production Worker secret; required only for live webhooks |
| RATE_LIMIT_SECRET       | Random production secret for hashing rate-limit keys      |
| API                     | Pages service binding to standalone Worker                |

Email is configured with EMAIL_PROVIDER (`development`, `resend`, or `disabled`), EMAIL_FROM and the RESEND_API_KEY Worker secret. See [EMAIL.md](EMAIL.md). Development mode returns testing links and never sends mail; production cannot use that adapter. Real provider credentials and a verified sender are not available in this repository.

Browser tests start dedicated servers on ports 5180/8788, use fresh `.wrangler/e2e-*` database state, and force development email mode with live payments disabled. They do not reuse the normal development database or API. Supported test projects are Chromium desktop/mobile, Firefox and WebKit mobile emulation. Install their engines with `npx.cmd playwright install chromium firefox webkit`. A `CF-Connecting-IP` fixture separates simulated clients for authentication tests; Cloudflare itself sets this header in production.

Run `npm.cmd run check:backup` for a synthetic local backup/restoration rehearsal. No remote resources are needed or touched.
