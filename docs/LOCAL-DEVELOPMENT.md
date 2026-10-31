# Local development

Follow README commands. Wrangler creates local SQLite/D1 state under ignored `.wrangler`. Copy `.env.example` to `.dev.vars`; never commit that file. No live credentials are needed. Keep ENVIRONMENT=development and PAYMENTS_ENABLED=false.

Register and open the development verification link displayed by the form; no email was sent. Sign in after verifying. Forgot password likewise displays a local reset link. Links expire (verification 24 hours; reset 30 minutes). Sessions last seven days.

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

Production email provider variables do not exist yet because that adapter is intentionally not implemented. Do not create dummy provider keys.
