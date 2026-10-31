# Transactional email

RandomTools has a development testing adapter and an optional Resend transport using its [documented send-email endpoint](https://resend.com/docs/api-reference/emails/send-email). No real email has been sent or provider account configured during development.

## Development

Use `ENVIRONMENT=development` and `EMAIL_PROVIDER=development`. Registration, resend verification and forgot password return a clearly labelled development link. No network delivery occurs. The development adapter cannot run in production even if explicitly selected.

## Production configuration

The verification screen asks the mailbox owner to choose the final account password (which may be the password chosen during registration). Verification atomically sets this password and revokes sessions. A person who registered someone else's email cannot retain their pre-activation password after that mailbox owner activates the account. This scenario is covered by a D1 integration test.

After the owner selects and configures the provider, verify an owned sender domain with Resend and use a sending-only API key restricted to the sender domain where supported. Do not use a fabricated sender or API key. Set these on the API Worker, not Pages:

| Variable | Value |
| --- | --- |
| ENVIRONMENT | production |
| APP_ORIGIN | Exact owned HTTPS origin, no trailing slash |
| RATE_LIMIT_SECRET | Random secret of at least 32 characters |
| EMAIL_PROVIDER | resend |
| EMAIL_FROM | Bare, verified sender email address |
| RESEND_API_KEY | Worker secret, never frontend configuration |

Registration, resend and reset requests fail closed with 503 when email is not configured. Merely selecting ENVIRONMENT=production no longer disables a correctly configured provider.

New and existing registration requests return the same status and generic message. Reset/resend requests likewise do not disclose account existence. Email work uses the Worker's `waitUntil` lifecycle, a fixed provider URL, a 10-second request timeout and a token-derived idempotency key. No response contains a production token or provider key. A generic accepted request does not assert that an email reached an inbox.

Only SHA-256 digests of random one-time tokens are stored in D1. Verification expires after 24 hours; password reset after 30 minutes. Consuming a token, changing account state and revoking sessions occur in one D1 transaction. A failed delivery removes that token and records only `email.delivery.failed` with an opaque account ID in the admin audit log. The user can request another link; reset/resend is limited to three requests per email per 15 minutes, with an additional network limit. No raw provider error, address or email body is put into audit logs. No-referrer headers keep token-bearing page URLs out of navigation/request referrers.

Before launch, test with owner-authorized recipients on staging: sender verification, inbox/spam delivery, link origin, expiry, replay, recovery after provider rejection and provider outage. Local tests mock the provider transport and verify API contracts, failure cleanup and enumeration-resistant responses. No independent inbox delivery or provider security review has been performed.
