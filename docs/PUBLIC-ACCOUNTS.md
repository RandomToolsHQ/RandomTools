# Phase 8 public accounts release gate

Restricted release candidate only. Public registration and changes to public
Pages require explicit owner approval. Keep the 21-tool artifact, payment hard
stops and isolated vault branch intact.

## Identity decision — verified 3 November 2026

Retain Clerk in restricted staging. Its [production guide](https://clerk.com/docs/guides/development/deployment/production)
requires an owned domain, DNS control, live keys and independent OAuth/webhook
configuration. We cannot add DNS under the assigned Pages hostname. Its
[advanced proxy](https://clerk.com/docs/guides/dashboard/dns-domains/proxy-fapi)
replaces Frontend API CNAME routing; it does not establish a supported deployment
without ownership/DNS for other services. No supported zero-purchase Clerk
production setup on `randomtools-preview.pages.dev` has been verified. Do not
publish development auth or implement a speculative proxy. Provider confirmation
is needed before treating a DNS-free configuration as viable.

For strict zero spending, recommend an isolated **Firebase Authentication Spark
proof of concept next**, with owner approval before changing existing providers.
[Spark requires no payment method](https://firebase.google.com/pricing).
Use its provided auth domain, authorize the exact Pages hostname, and test popup
sign-in or the official [redirect storage guidance](https://firebase.google.com/docs/auth/web/redirect-best-practices).
A domain purchase is not inherently required for that design. Actual hosted
Pages compatibility and security still need proof; no Firebase integration or
account migration has been performed.

| Option | Recovery, deletion, revocation | Migration and free limits |
| --- | --- | --- |
| Retain Clerk | Existing managed verification/recovery, live session/profile checks, signed deletion delivery | Lowest churn, but production DNS and Worker CPU reliability remain blockers. |
| Firebase Spark | Built-in verification/reset, recent-login deletion, Admin revocation; Worker-compatible [REST APIs](https://firebase.google.com/docs/reference/rest/auth) | Medium: replace bridge, verify JWT issuer/audience/signature and fresh revoked/disabled/verified state. Preserve D1 permissions. [Limits](https://firebase.google.com/docs/auth/limits): 1,000 verification and 150 reset emails/day, only 5 email-link sign-ins/day. SMS requires billing; exclude it. Identity Platform Spark has a 3,000 DAU cap. No paid upgrade. |
| Supabase Auth Free | Managed recovery/deletion, but JWT validity alone does not prove live session state | Medium/high; migration is not approved. [Default SMTP](https://supabase.com/docs/guides/auth/auth-smtp) is team-only, two emails/hour and not production delivery. Requires a production sender and hosted revocation proof. No need to move D1 for auth alone. |
| Auth0 Free | Hosted OIDC login, privileged Management API for deletion/revocation | Medium/high. [Signup](https://auth0.com/pricing) needs no card, but custom domains require card verification. Its [built-in sender is not for production](https://auth0.com/blog/branded-login-urls-email-workflows-production-auth/); an external sender and API/revocation quotas need proof. Not yet a proven better fit. |

Never reintroduce Worker password hashing, link users by matching email, copy
genuine credentials or automatically transfer admin privileges between issuers.
Any future owner identity requires independent immutable-ID verification and an
explicitly confirmed audited bootstrap. Current genuine staging admin remains.

## Deletion, owner protection and recovery

Production API defaults closed unless `PUBLIC_ACCOUNTS_ENABLED=true`, separately
from live provider configuration. Signed deletion delivery remains available
during an account shutdown. Public-only Pages still denies every API.

All app admins are protected from app self-deletion and disabling by other admins.
No web role mutation exists. Normal deletion requires typed DELETE, recent auth
and ownership. Fresh D1 role check, request audit and access disable precede
provider deletion. Provider 404 is already deleted. Completion audit, cascades and
tombstone are atomic/idempotent, including events preceding first provisioning.

Provider failure leaves a disabled `deleting` identity. An operator must review
the exact issuer/subject, request audit and provider status; do not reactivate to
bypass cleanup. If provider deletion succeeded, redeliver its genuine signed
event; otherwise complete that exact user-requested deletion at Clerk and verify
delivery. Recovery is operator assisted, not an automatic retry queue.

Authentic provider deletions must be honored, including deletions performed
outside this app. App safeguards cannot prevent the owner deleting their
identity directly at Clerk. Protect the provider dashboard and recovery factors;
never test deletion on the genuine Founder. No provider settings are silently
changed by this candidate.

Owned sessions, reset/verification tokens, preferences, presets, history,
favourites, requests and grants cascade. Payment references use schema SET NULL;
no payment processing runs. Minimal tombstones and audit IDs remain to prevent
recreation (current audit retention 180 days). Backups are not erased by deletion;
finalize retention, access and deletion policies before launch.

## Launch sequence — approval still required

1. Resolve production identity and CPU gates. Prove registration, verification,
   Google/GitHub, reset, logout, expiry, live revocation, deletion, provider outage
   recovery and cross-user isolation with synthetic restricted accounts.
2. After approval, create separate empty production D1/API. Never connect public
   clients to staging, its owner account or development keys. Before schema
   changes export/restore locally, compare data/FKs and protect the backup.
3. Configure exact HTTPS origin, live keys, signing/rate-limit secrets, CSP/CORS,
   no-store responses and least-privilege deployment. Disable previews/direct
   Worker URLs. Preserve fresh D1 entitlements and live provider revocation.
4. Prove recovery email delivery and abuse controls. Origin/IP checks alone do
   not stop provider signup abuse. No wildcard redirects, authorization caches
   or email-based linking. Test email changes, MFA recovery and physical browsers.
5. Re-run CI and repeated cold/warm/populated/read/write/admin CPU workloads,
   separating caught HTTP errors, runtime errors and provider throttling. Require
   CPU headroom rather than one sub-10ms p99. Set quota/abuse monitoring.
6. Rehearse recovery; publish accurate privacy, retention and support policies.
   Freeze manifest/source and obtain explicit owner approval for that exact
   public artifact, API and registration switch. Only then enable accounts.

## Rollback

Close the production account switch on security/CPU failures; restore the frozen
free-only Pages release and verify API 403/no-store. Preserve D1 and signed
deletion delivery; never overwrite new accounts with a stale backup. Retain the
previous Worker/configuration, but code rollback must preserve tombstones and
audits. Restore backups into isolated D1, reconcile later changes and request
approval before switching bindings. Never restore revoked entitlements or grant
owner privileges based on email. Revoke compromised keys/sessions and audit
incidents before reopening.

Current public deployment: `81de8536-ed2f-4204-941b-ada7fcba1c2a`.
Previous free-only rollback: `d1c4fd47-296d-4b2f-b6a5-28ed82c7ba34`.
Neither is changed by this phase.
