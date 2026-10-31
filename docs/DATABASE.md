# D1 schema

Canonical SQL: [0001_initial.sql](../migrations/0001_initial.sql). Time values are integer Unix seconds except the aggregate usage day (ISO date). IDs are opaque UUIDs except token digests and provider event/transaction IDs. All application queries bind user values.

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

Account FKs cascade deletion of sessions, tokens, claims, subscriptions, preferences, presets and history. Payment user references become NULL. Audit records intentionally do not hold email/content and can survive deletion. The daily cleanup retains audit records 180 days, usage 90 days and history according to user retention (default 30 days). Rate limits and expired secrets/sessions are purged. Payment event retention requires final business review before launch.

Pro is derived from paid_through at request time, never a client-settable user role. Account role promotion is CLI-only. Payment events and subscription updates use unique constraints and transactional D1 batches to avoid duplicate granting. A pending claim alone never changes entitlement.
