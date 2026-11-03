# Security

## Phase 9.2 / Phase 10 release candidate

Firebase POC configuration now fails closed if its rate-limit signing secret is
missing. Signature, issuer, audience, expiry, live provider revocation/disabled
checks, application sessions, D1 ownership and fresh Pro/admin checks remain
required. The prototype is synthetic-only and is not approved for public signup.
Hosted positive lifecycle and CPU evidence remains incomplete; local tests are
not a substitute. See [Firebase validation](docs/FIREBASE-POC.md).

IP Intelligence Lookup is disabled by default. Backend access requires fresh
Pro authorization after the existing authentication/session/gateway middleware.
Only canonical public IPv4/IPv6 literals are accepted; URLs, ports, hostnames,
mapped/private/reserved addresses are rejected. The outbound endpoint is fixed,
redirects fail, responses are capped at 32 KiB and requests time out after 3.5 s.
Atomic per-user and shared D1 counters bound provider requests; provider 429s
trigger a shared cooldown. No searched IP or provider result is stored in D1,
history, analytics or application logs. Responses are no-store. The provider may
log requests, which is disclosed before submission. Missing fields and uncertain
proxy classifications must never be represented as verified physical identity.
The retained public API-denial guard remains authoritative for the public site.

## Free-first manual access

Payments and paid membership routes are hard-disabled in every environment;
`PAYMENTS_ENABLED=true` cannot reactivate them. Archived webhook/reconciliation
code and historical payment rows remain preserved but cannot authorize Pro.
Manual requests/grants use separate tables with partial unique indexes, strict
input schemas, owner-scoped reads and fresh database role/expiry/revocation checks.
Approvals, denials, grants, replacements and revocations recheck administrator
state inside atomic D1 batches that include audit writes. Failed auditing rolls
back the access change. Permanent grants have explicit NULL expiry and remain
revocable. Client roles, payment receipts and arbitrary expiry values are not
accepted as entitlement input. Clerk JWT/live session/profile verification and
the fail-closed private gateway are unchanged; no public development auth is added.

Hosted authentication has migrated to Clerk; see [CLERK.md](docs/CLERK.md) for
the current token/session boundary, identity ownership, revocation and deletion
requirements. The custom password/cookie description below applies to the local
legacy regression adapter. Hosted modes reject that adapter, and production
rejects Clerk development keys. Hosted Clerk acceptance and CPU testing remain
required before a release.

Report vulnerabilities privately to randomtoolshq@gmail.com. Do not include live credentials or personal data in public issues. Provide a minimal reproduction and affected commit.

The password-cost discussion below describes the retained local legacy adapter.
The root development API template contains a 30-second CPU setting and must not
be used for a Workers Free deployment. Restricted Clerk and isolated Firebase
use separate configurations and managed authentication. Their actual hosted CPU
must be measured independently; a successful build or dry-run does not establish
Free-plan compliance. No paid Workers plan has been enabled.

Passwords use `@noble/hashes` PBKDF2-HMAC-SHA256, 600,000 iterations and random 256-bit salts. The library's native Web Crypto adapter runs first; runtimes that reject its work factor with NotSupportedError fall back to the audited JavaScript implementation with the **same** parameters. Tests verify byte-for-byte equivalence. The cost is never reduced to accommodate a runtime limit. Session and one-time tokens are random 256-bit values; only SHA-256 token digests are stored. Cookies are HTTP-only, SameSite=Strict and Secure in production. Password changes revoke all sessions. Email verification/reset tokens expire and are consumed once.

Account mutations require the exact configured Origin and JSON content type. Clerk deletion events have separate signature verification; the Ko-fi endpoint is disabled. API responses are not cached; no-referrer headers prevent token-bearing URLs from appearing in referrers. Request limits count streamed bytes, including bodies without Content-Length. Production launch requires configured email delivery, deployment validation, load tests for password hashing, distributed rate-limit review and independent security review. Local D1 integration tests cover accounts, permissions, payments and retention; these do not prove deployed behaviour. D1 rate limits use atomic counters, but no claim of comprehensive DDoS protection is made. Apply Cloudflare edge limits before launch. Password hashing requires benchmarking on the selected Workers plan; the JS fallback measured around 10–15 seconds under concurrent local Wrangler requests. The Worker has a 30-second CPU ceiling configured, which requires a suitable paid Workers plan; no service has been purchased.

Saved tool content is private by authorization, not end-to-end encrypted. Avoid saving secrets. Account deletion cascades personal workspace data; minimal unlinked audit and payment records remain for reconciliation. History cleanup runs on access, retention changes and daily cron (up to 24-hour scheduling lag). Retention and expired-session behaviour are tested locally.

The minimatch override addresses a development-tool advisory while upstream lint packages update; lint and the full build are checked with it. Dependency versions are reproducible through package-lock.json. Run npm audit regularly rather than applying forced major downgrades blindly.

Production email uses a fixed provider endpoint, a verified sender configuration, bounded requests and idempotency. Account-existence responses are generic; development token links are impossible in production. Provider acceptance is not claimed as inbox delivery. Failed sends invalidate the corresponding token and emit a content-free audit event. See [EMAIL.md](docs/EMAIL.md). No raw tokens are stored in an email queue. Verification/reset state changes and token consumption are transactional. Preset quota and payment reconciliation concurrency are tested locally.
