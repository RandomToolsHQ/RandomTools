# Launch readiness — 3 November 2026

5 November checkpoint: separate Spark project and fail-closed Cloudflare reference
are provisioned under explicit approvals. Keyless synthetic provider verification,
login, disable and revocation checks passed. Matched accepted hosted backend
benchmarks, application lifecycle checks and cleanup remain outstanding. Existing
public/Clerk deployments are unchanged; recommendation remains MORE TESTING REQUIRED.

The approved Supabase rt11 schema and disabled Edge Function are now provisioned.
Hosted rollback-only SQL permission/ownership/Pro/admin tests pass with zero
retained fixtures. There are no custom configuration secrets and the additional
legacy JWT gate remains on. No actual hosted Firebase sessions or accepted CPU
benchmarks have run. Separate Spark setup and later privileged permissions remain
approval gates; no public account launch or migration is authorized.

Phase 11 local [Supabase/Firebase evaluation](PHASE11-SUPABASE.md) is **MORE TESTING
REQUIRED**. It does not approve migration, public registration or new production
infrastructure. Larger documented CPU limits are not measured performance. Hosted
Supabase, separate Spark identities, matched reference clone, browser cookie
boundary, cold starts, recovery/backup and cleanup verification remain gates.

## Hosted decision — 4 November 2026

Official hosted verification/recovery, password changes, disabled/revoked/deleted
users, fresh D1 Pro/admin permissions and ownership passed with synthetic accounts.
Temporary IAM grants/service account/roles were removed and token denial verified.
Only the isolated Firebase POC was updated; public and Clerk sites are unchanged.
See [measurements and cleanup evidence](../PROGRESS.md#hosted-firebase-validation-completed--4-november-2026).

Firebase Spark is technically viable as an authentication candidate on pages.dev.
Public launch and automatic migration remain NO-GO: repeated mixed workloads
exceeded Workers Free 10 ms CPU despite zero runtime failures. Do not weaken live
revocation/permissions or infer reliability from successful burst tolerance.
Inbox delivery, approved synthetic Google OAuth, abuse/recovery review, backup and
migration rehearsal remain gates. No genuine account or privilege was changed.

A possible next separately approved experiment is API plus Postgres on Supabase
Free, preserving Firebase/Auth and the public Pages frontend. Its documented
[Edge runtime](https://supabase.com/docs/guides/functions/limits) allows 2 seconds
CPU/request and 150 seconds wall duration on Free. That is a measurable CPU-budget
opportunity, not measured application performance or a recommendation to migrate.
It requires adapting D1 SQL/transactions and evaluating free project inactivity,
backups, quotas, operational reliability and secret handling. Do not add a
Supabase-to-D1 proxy hop or switch hosting without approval. Existing isolated
prototype work must be reviewed before another experiment.

## Phase 10 candidate boundary — 4 November 2026

The release-readiness branch adds default-off IP Intelligence Lookup and saved
workflow fixes. No deployment, public signup, identity migration or main merge
is included. Clerk Founder/Admin access and all existing environments remain
unchanged. Firebase Spark accepts the isolated pages.dev authorized domain and
requires no domain purchase for this POC, but positive hosted verification,
recovery, disabled/deleted/revoked-user tests and representative CPU measurements
remain required. Current recommendation: continue the restricted experiment;
NO-GO for a public account launch or provider migration.

Before any future authentication release: pass the full hosted lifecycle and
ownership matrix, verify IAM cleanup, test recovery/deletion reconciliation and
synthetic migration rehearsal, measure repeated accepted authenticated workloads,
back up/restore D1, and obtain explicit owner launch approval. Keep existing
Clerk identity mappings and Founder privileges intact. Roll back to the recorded
Pages/Worker versions, disable new signup and revoke affected application
sessions; do not automatically reverse identity mappings or delete account data.

## Approved public free-tools release

The owner approved the exact frozen artifact identified below. It is now live at
https://randomtools-preview.pages.dev/, deployment
81de8536-ed2f-4204-941b-ada7fcba1c2a. All 21 tool routes, 48 served asset hashes,
124 deployment checks and 52 hosted browser cases passed; previous deployment
d1c4fd47-296d-4b2f-b6a5-28ed82c7ba34 remains available for rollback. No rollback
was required. No authenticated SaaS, vault, payment, private infrastructure or Git
main change was included. The production-authentication launch gates below remain.

## Phase 7 release decision

Restricted acceptance is complete for application source a04a522. The public-only
21-tool candidate is prepared and remains undeployed pending explicit approval.
Manifest SHA256: 41e903db978d3ab79af68175bc05af8fa99cc4270d52a23b714ea94428ba7bc9
(51 files; 27 public pages plus closed account placeholders/assets/denial guard).
Upload would target the existing randomtools-preview Pages project on its main
production branch, retaining pages.dev, noindex and the API-denial guard. It does
not merge Git main, expose Clerk/accounts/Pro/admin/vault, bind D1, enable payments
or change restricted staging. Current public deployment is retained for rollback.

Source CI 41478963634 passed; 93 unit/integration, 68 application-browser and 52
public-artifact cases passed, plus eight local private-gateway cases. Restricted
hosted evidence: 92 feature/security checks, actual revoked-JWT 401, 21 final gate /
cleanup/Bedrock fixture checks, 847/847 successful bounded workload requests.
All synthetic accounts/privileges removed; original account/identity/data/audits
preserved. Migration 0005 was additive, backed up/restored/verified, private only.
An operational secret-activation issue required a fail-closed binding reset and
explicit Worker version deployment; verify actual retired-key rejection rather
than trusting secret-write success. See STAGING.md and PROGRESS.md for exact IDs.

The approved release can cover free browser tools independently of the SaaS.
Public authenticated launch remains blocked by CPU tail reliability, production
Clerk/domain/OAuth/email/recovery/deletion rehearsals and the operator/recovery
gates below. Candidate p99 occasionally exceeds 10 ms; no consistent regression
was observed against the prior backend, but this is not Free-plan compliance
proof. Minecraft metadata remains curated/limited and Roblox availability is not
checked. The vault remains separate and requires independent security review.

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

## Phase 6 validation and release sequence

Free-tool source c2dfa09 is on `codex/phase6-free-tools` and
`codex/phase6-integration`. CI 41465576263 passed: 91 unit/integration/security
tests, 64 application browser cases and 48 public-artifact cases, including
Chromium desktop/mobile, Firefox, WebKit and axe checks. TypeScript, lint,
Pages/public/private builds, SEO, local D1 backup/restore and Worker dry run
passed. Eight local private-gateway browser cases also passed. Redacted staged
secret scanning found no leaks; local credentials remain ignored. No hosted
account/CPU testing was repeated for these undeployed features.

There are 21 catalog entries on the integration branch; the live public preview
still has the original 18. Minecraft coverage is deliberately limited and
source-linked; country/compatibility/ping completeness and Roblox availability
are deferred. See [FREE-TOOLS.md](FREE-TOOLS.md). The EFF dictionary is lazy-loaded
only for passphrases. The public entry chunk is about 144 KB gzip; no new package
dependency was added. Future optimization should use measured user navigation,
not remove authentication or entitlement checks.

The synthetic-only vault is separate commit 05d6a22 on
`codex/password-vault-prototype`, not part of this integration branch. Its local
crypto/controller tests and eight four-target browser cases passed; its own CI
also builds/tests the separate loopback-only artifact. Threat model and recovery
limits are in that branch's `prototype/vault/README.md`. Independent review is
required before real credentials, sync, autofill or any public access.

Fresh read-only checks confirmed unchanged public/private deployment IDs and
both projects' direct-upload configuration. Git pushes do not deploy these
projects. Public home returned 200; unauthenticated private origin/API returned
403 with private/no-store and DENY framing. No hosted migration 0005 was applied.

Recommended release order:

1. Review the integration diff and source/data disclosures; obtain explicit main
   merge and public-preview deployment approval. Exclude the vault branch.
2. Back up private D1, apply additive 0005 only to restricted staging, compare old
   rows and foreign keys, then deploy matching Worker/Pages. Rehearse account
   favourites/export/deletion with approved synthetic users and remove fixtures.
3. Deploy only the free-tools public artifact after approval; verify no Clerk,
   account, Pro/admin or vault bundle is exposed. Keep the private gateway.
4. Complete cold/write-heavy/max-data CPU evidence, production identity and
   provider OAuth/email/recovery/deletion rehearsals, backup/incident procedures
   and operator privacy/accessibility reviews before considering public signup.

Clerk's current [production guide](https://clerk.com/docs/guides/development/deployment/production)
requires an owned domain/DNS control, production keys and operator-supplied OAuth
credentials. With no domain purchase authorized, production Clerk signup remains
blocked; no purchase or provider switch is proposed automatically. Cloudflare's
current [limits](https://developers.cloudflare.com/workers/platform/limits/)
still list 10 ms Free CPU per invocation. Three prior passing bounded runs do
not establish compliance for every representative workload.
