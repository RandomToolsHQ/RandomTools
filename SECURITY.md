# Security

Hosted authentication has migrated to Clerk; see [CLERK.md](docs/CLERK.md) for
the current token/session boundary, identity ownership, revocation and deletion
requirements. The custom password/cookie description below applies to the local
legacy regression adapter. Hosted modes reject that adapter, and production
rejects Clerk development keys. Hosted Clerk acceptance and CPU testing remain
required before a release.

Report vulnerabilities privately to randomtoolshq@gmail.com. Do not include live credentials or personal data in public issues. Provide a minimal reproduction and affected commit.

Passwords use `@noble/hashes` PBKDF2-HMAC-SHA256, 600,000 iterations and random 256-bit salts. The library's native Web Crypto adapter runs first; runtimes that reject its work factor with NotSupportedError fall back to the audited JavaScript implementation with the **same** parameters. Tests verify byte-for-byte equivalence. The cost is never reduced to accommodate a runtime limit. Session and one-time tokens are random 256-bit values; only SHA-256 token digests are stored. Cookies are HTTP-only, SameSite=Strict and Secure in production. Password changes revoke all sessions. Email verification/reset tokens expire and are consumed once.

Mutations require the exact configured Origin and JSON content type, except the separately authenticated form-encoded Ko-fi webhook. API responses are not cached; no-referrer headers prevent token-bearing URLs from appearing in referrers. Request limits count streamed bytes, including bodies without Content-Length. Production launch requires configured email delivery, deployment validation, load tests for password hashing, distributed rate-limit review and independent security review. Local D1 integration tests cover accounts, permissions, payments and retention; these do not prove deployed behaviour. D1 rate limits use atomic counters, but no claim of comprehensive DDoS protection is made. Apply Cloudflare edge limits before launch. Password hashing requires benchmarking on the selected Workers plan; the JS fallback measured around 10–15 seconds under concurrent local Wrangler requests. The Worker has a 30-second CPU ceiling configured, which requires a suitable paid Workers plan; no service has been purchased.

Saved tool content is private by authorization, not end-to-end encrypted. Avoid saving secrets. Account deletion cascades personal workspace data; minimal unlinked audit and payment records remain for reconciliation. History cleanup runs on access, retention changes and daily cron (up to 24-hour scheduling lag). Retention and expired-session behaviour are tested locally.

The minimatch override addresses a development-tool advisory while upstream lint packages update; lint and the full build are checked with it. Dependency versions are reproducible through package-lock.json. Run npm audit regularly rather than applying forced major downgrades blindly.

Production email uses a fixed provider endpoint, a verified sender configuration, bounded requests and idempotency. Account-existence responses are generic; development token links are impossible in production. Provider acceptance is not claimed as inbox delivery. Failed sends invalidate the corresponding token and emit a content-free audit event. See [EMAIL.md](docs/EMAIL.md). No raw tokens are stored in an email queue. Verification/reset state changes and token consumption are transactional. Preset quota and payment reconciliation concurrency are tested locally.
