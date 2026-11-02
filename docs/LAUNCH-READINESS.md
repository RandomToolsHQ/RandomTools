# Launch readiness — 3 November 2026

## Verified baseline

Integration branch `codex/phase6-integration` starts at `81d73a5`, containing
manual Pro source `cc98ed9`. CI run 41400048660 passed. No merge to main is
authorized. Supabase experiment `codex/supabase-free-poc` remains separate; no
migration or account data transfer is authorized.

Read-only deployment inspection confirmed private runtime
`a6bb68f5-c199-447f-8fa5-3b4dcdae2aa5`, private Pages
`b27c6262-bde5-45a6-b338-a3ce0648dfd8`, public Pages
`d1c4fd47-296d-4b2f-b6a5-28ed82c7ba34`. Fail-open remains false and direct Worker
URLs remain disabled. These deployments are not changed by feature development.

Ready for controlled staging: manual request/approval/denial/direct grant,
7-day/30-day/permanent access, fresh entitlement reads, revocation and atomic
auditing. Hosted evidence: 54 API/security checks, eight actual desktop/mobile
form checks, revoked-but-unexpired JWT denial, 33 HTTP gate checks and eight
gateway browser checks. Temporary users, sessions, grants and roles were removed;
one genuine ordinary account and its identity/audits were preserved.

## Launch gates

| Area | Status and required next evidence |
| --- | --- |
| Public free tools | Existing 18 deployed and independently tested. New tools require validation and explicit public deployment approval. |
| Production identity | Blocked: Clerk development keys must not become public production authentication. Production instance, DNS/domain requirements, redirect configuration and production secrets need owner decisions. Do not buy a domain or change providers automatically. |
| Registration/recovery | Invited Google registration was verified previously. Full production registration, recovery/email delivery, GitHub enrollment and security-confirmation flows remain incomplete. Synthetic ticket sessions are not substitutes for those tests. |
| Deletion | Local cascades, signed webhook delivery and synthetic provider cleanup verified. Genuine-user recovery/deletion retry/reconciliation and production backups need a dedicated rehearsal; never delete a genuine account as a test. |
| Sessions/authorization | Server JWT issuer/azp/session checks, live provider status/profile, immutable identity mapping, ordinary-member denials and manual grant expiry/revocation verified. Independent review and multi-user abuse tests remain. |
| Admin | Test privileges removed. A real owner-approved admin bootstrap, account protection and recovery procedure must precede public signup. No role-promotion endpoint exists. |
| Rate/abuse | Atomic per-user/IP limits tested. Clerk dev quota constrains load testing. Public registration abuse, edge policy, legitimate-user lockout and outage behavior need broader validation. No paid anti-abuse service is enabled. |
| CPU | Three 121-request hosted runs: p99 7.817/8.671/7.764 ms, zero observed failures. Earlier occasional >10 ms tails remain relevant. Cold, write-heavy, maximum-data and higher-load workloads are not proven Free-compatible. |
| D1/recovery | Four additive migrations and local backup/restore tested; old data preserved during hosted migration. Owner-protected pre-migration backup exists. Scheduled encrypted remote backups, recovery objectives and restore rehearsal remain launch work. |
| Payments | Hard-disabled; no provider/key/checkout activation. Historical source/data retained. Manual Pro requires no payment. |
| Privacy/retention | Local tools avoid uploading inputs; manually saved account content is scoped. Audits retain 180 days, aggregate counts 90 days. New external status lookups must be opt-in and disclosed; new data tables require retention/export/deletion coverage. Policies still need operator/legal review. |
| Secrets | Ignored local credential storage, redacted scans, no secret values in reports. Recheck production key separation, rotation and operator permissions before any launch. |
| Accessibility/mobile | Automated axe and browser-engine checks pass for baseline. Physical mobile devices, assistive technology and real production flows still need manual coverage. |
| Monitoring | Safe dependency status logging and Cloudflare metrics available. Alerting, incident ownership, quota/error monitoring and recovery drills remain unconfigured. Do not log headers, tokens, generated secrets or vault plaintext. |
| Password vault | Experimental only, synthetic data, local-only separate build/branch. No public route, autofill, real credentials or production security claim until independent cryptographic/app review. |

No signup opening, public deployment, main merge, paid service or billing change
is authorized by this checklist. Keep private gateway and provider protections
intact while completing these gates.
