# Migration scope: D1 to isolated Supabase Postgres

This is a plan, not approval to switch backends or import genuine accounts.
The POC schema is executable; only the representative API subset is ported.

## All 15 tables

| Table | Port / required verification |
| --- | --- |
| users | Preserve ID/email uniqueness, free/admin CHECK, verified/disabled state. Clerk remains identity provider; no new local password flow. POC uses CLERK_ONLY placeholders. Do not import password hashes into this prototype. |
| sessions | Legacy local-auth tokens only; Clerk sessions remain at Clerk. Preserve cascades/expiry for compatibility, but never accept these cookies as managed auth. |
| email_verification_tokens | Legacy single-use hashes/expiry; retain schema without enabling a second account-auth architecture. |
| password_reset_tokens | Same legacy boundary; retain single-use transaction semantics if ever migrated. |
| subscriptions | Fresh paid-through read, expiry/removal denial, user FK and unique event reference. Every future grant/revoke mutation must preserve audit atomicity. No live payment sources in POC. |
| payment_events | Unique transaction/message IDs and event idempotency; pending ownership, no email auto-linking. Schema only; payment ingestion stays disabled. |
| membership_claims | Unique user/transaction pair, owner scope and reviewed state transitions; reconcile with event+subscription+audit in one transaction. |
| user_preferences | One row/user, retention CHECK and JSON validation/caps. POC reads only; full write/retention API remains to port. |
| saved_presets | Owner-scoped queries and quota; POC reads/saves/deletes with audit transaction. Preserve workflow kinds and production data caps in full port. |
| tool_history | Owner/time index and retention; POC populated reads. Full history append+retention pruning must be atomic. |
| audit_logs | Preserve append events, actor/target references and bounded retention; application audit remains required even where platform Free audit logs are unavailable. POC records successful writes/deletes/admin reads. |
| rate_limits | Atomic upsert/window; POC distributed budget before Clerk. Full route/IP/subject limits and key hashing must be ported rather than replaced by process memory. |
| tool_availability | Server-enforced admin configuration; POC schema only. Confirm disabled tools are denied on relevant API paths. |
| usage_daily | Composite day/tool key; aggregate counters and retention. No personal usage copying or expanded tracking. |
| auth_identities | Composite issuer/subject PK, unique user mapping, deleting/deleted tombstone and ON DELETE SET NULL. Do not auto-link by mailbox or resurrect deleted subjects. POC requires explicit seeded immutable mapping. |

## Transactions and query compatibility

SQLite `?` bindings become Postgres parameters; use typed RPC arguments, not SQL
strings assembled from request data. SQLite `INSERT OR IGNORE`, conflict updates,
JSON functions, scalar/aggregate min/max, dates, LIMIT/OFFSET, column naming and
integer/boolean serialization require individual review. Do not silently convert
integer timestamp units or remove unique/CHECK/foreign-key constraints.

Replace D1 batch transactions with explicit Postgres transactions/RPCs. Verify:

1. First identity provisioning: collision-safe user/mapping creation; no takeover
   when an email exists, and no partially provisioned user on mapping failure.
2. Preset quotas under concurrency: lock the user before counting/writing. All
   future writers must use the same lock order, including admin operations.
3. History append/prune and preference/retention updates.
4. Membership claim reconciliation, payment idempotency and audit writes.
5. Admin disable/re-enable and role/subscription changes, with fresh permissions.
6. Deletion: mark identity deleting, disable local account, revoke/delete Clerk
   identity using the provider workflow, remove owned data and retain an identity
   tombstone. External HTTP and SQL cannot be one ACID transaction: require an
   idempotent saga, retry-safe states and fail-closed behavior after partial failure.

The POC tests check one write/audit rollback and scope constraints. They do not
prove every production transaction, distributed race or hosted pool behavior.

## Cleanup and webhooks

Port the current daily scheduled cleanup: expired local sessions/verification/reset
tokens, rate windows, user-selected history retention, audit retention and aggregate
usage retention. Verify row caps/indexes and run bounded transactional batches.
Evaluate available scheduling in the Free project; do not add a paid scheduler or
expose a public admin cleanup URL. Keep job credentials server-side and audit runs.

A dedicated Clerk deletion-only webhook must verify the raw-body Svix signature,
timestamp and delivery replay/idempotency before looking up the exact issuer and
subject. Invalid signatures and wrong instances deny. Never share or repoint the
existing Cloudflare webhook. Test duplicate and out-of-order events, failure during
deletion and retry recovery before any real data migration. This webhook is not yet
ported or hosted by the minimal POC.

Ko-fi ingestion, checkout, mock payments and live payment secrets remain absent.
Future payment code would need explicit approval, signature verification, replay
protection, ownership claims and transactional auditing; CPU improvements do not
authorize payments.

## Backup and recovery

Free is not paid automatic backup/PITR. Arrange owner-controlled encrypted
`pg_dump` exports of schema/data/constraints/RPCs/grants and a documented retention
schedule. Credentials/keys are backed up separately in secure storage, never in
Git or database dumps. The private schema must be included explicitly; public-only
exports would lose the application data. Exclude genuine data from this POC.

Restore into a second empty isolated database, reapply expected role grants/RLS,
compare counts/checksums/FKs/tombstones/entitlements and verify deny tests before
restoring traffic. Revoke sessions/grants as appropriate, test deletion retry and
signed webhooks, measure recovery time and document any data-loss window. A local
embedded-engine snapshot is useful regression coverage, not hosted `pg_dump`
recovery proof. Do not expose a restore with broad PostgREST grants.

## Effort and cutover gates

Engineering estimate, not observed timing: **6–12 focused developer-days** for the
full API/data port, deployment/security/transaction tests and recovery rehearsal,
plus owner credential confirmations and elapsed inactivity observation. The POC
reduces uncertainty but does not make this a configuration-only switch.

| Work package | Estimate |
| --- | --- |
| Postgres query/transaction port and managed identity/deletion handling | 2–4 days |
| Gateway/runtime/secrets, jobs, webhook isolation and monitoring | 1–2 days |
| Full security/browser/entitlement regression and real provider flows | 2–4 days |
| Backup restore, matched load tests and rollback rehearsal | 1–2 days |

Before a switch: obtain explicit architecture approval; demonstrate repeated
representative hosted success with measured CPU/latency; establish Free quota and
failure behavior, direct endpoint denials, live session revocation, independent
cross-user tests, all twelve Pro capabilities and admin controls. Confirm Clerk
production-instance/domain requirements separately. A no-cost development POC does
not authorize public production authentication.

Leave Cloudflare/D1 untouched until a separate approved migration plan exists.
That plan needs an export/import boundary, write freeze or a justified sync design,
identity/ownership verification, rollback conditions and deletion/retention handling.
Avoid permanent dual writes or an external D1 REST adapter simply to preserve old
queries: they add security/consistency/operational cost without measured benefit.
