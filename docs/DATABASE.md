# D1 schema

Current free-first migration: [0004_manual_pro.sql](../migrations/0004_manual_pro.sql)
adds two tables, for 17 total. `pro_access_requests` has pending/approved/denied
states, owner, optional reason, decision actor/time and unique operation ID.
A partial UNIQUE index permits one pending request per user. `pro_grants` retains
duration, nullable expiry (permanent only), grant actor/time, optional request,
revocation actor/time/reason and operation ID. A partial UNIQUE index permits one
unrevoked grant per user. Expired rows remain historical until replaced/revoked;
expiry is always checked using server time, not by a cleanup job.

Manual mutations and audit writes use D1 atomic batches with conditional SQL.
Concurrent approval/denial is decided once; direct grants revoke prior current
grants in the same transaction. Actor/target state is rechecked within mutations.
An audit insertion failure rolls all access changes back. Account deletion
cascades owned requests/grants; deleting an administrator nulls actor FKs while
retaining grant validity/history. Historical payment tables remain intact but
are not an entitlement source. Never bulk-convert historical payments to grants.

Canonical SQL: [0001_initial.sql](../migrations/0001_initial.sql). Time values are integer Unix seconds except the aggregate usage day (ISO date). IDs are opaque UUIDs except token digests and provider event/transaction IDs. All application queries bind user values.

[0002_query_indexes.sql](../migrations/0002_query_indexes.sql) adds indexes for token/session expiry, resend lookup, user payment/claim export, audit ordering and rate-limit cleanup. Both migrations are exercised by integration tests and the local restore rehearsal.

| Table | Fields and constraints |
| --- | --- |
| users | id PK, email UNIQUE, name, password_hash, role CHECK free/admin, verified, disabled, created_at |
| sessions | token_hash PK, user_id FK, expires_at; user index |
| email_verification_tokens | token_hash PK, user_id FK, expires_at |
| password_reset_tokens | token_hash PK, user_id FK, expires_at |
| subscriptions | id PK, user_id FK, event_id UNIQUE, paid_through, source, created_at; user/expiry index |
| payment_events | id PK, transaction_id UNIQUE, event_type, amount, currency, member, received_at, status, nullable user_id FK |
| membership_claims | id PK, user_id FK, transaction_id, status, created_at; UNIQUE user/transaction |
| user_preferences | user_id PK/FK, JSON data, retention_days CHECK 0/7/30/90 |
| saved_presets | id PK, user_id FK, kind CHECK preset/workflow, name, JSON data, created_at; user index |
| tool_history | id PK, user_id FK, tool, data, created_at; user/date index |
| audit_logs | id PK, opaque actor_id, action, opaque target_id, created_at |
| rate_limits | key PK (digest/purpose), count, expires_at |
| tool_availability | tool PK, enabled |
| usage_daily | composite PK day/tool, aggregate count |
| auth_identities | issuer/subject composite PK, unique nullable user FK, active/deleting/deleted tombstone |
| pro_access_requests | id PK, owner FK, reason, pending/approved/denied, decision actor/time/operation; unique pending owner |
| pro_grants | id PK, owner FK, duration/expiry, grant and revocation actors/times, optional unique request FK; unique unrevoked owner |

Account FKs cascade deletion of sessions, tokens, claims, subscriptions, preferences, presets and history. Payment user references become NULL. Audit records intentionally do not hold email/content and can survive deletion. The daily cleanup retains audit records 180 days, usage 90 days and history according to user retention (default 30 days). Rate limits and expired secrets/sessions are purged. Payment event retention requires final business review before launch.

Pro is derived from paid_through at request time, never a client-settable user role. Account role promotion is CLI-only. Payment events and subscription updates use unique constraints and transactional D1 batches to avoid duplicate granting. A pending claim alone never changes entitlement.
