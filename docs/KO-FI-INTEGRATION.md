# Ko-fi integration

**ARCHIVED / INACTIVE — free-first roadmap, 2 November 2026.** The material below
documents preserved payment implementation, not current setup instructions.
Do not configure a provider, secret, payment link or live webhook. Current code
hard-disables webhook ingestion, paid claims, reconciliation, mock payments and
paid-subscription management in every environment. Environment flags cannot
reactivate these routes. Historical payment rows do not grant Pro. Use manual
requests/grants in [ADMIN-SETUP.md](ADMIN-SETUP.md). Any future payment launch needs
explicit owner approval plus a new code, security and data migration review.

Official reference: https://help.ko-fi.com/hc/en-us/articles/360004162298-Does-Ko-fi-have-an-API-or-webhook

POST `/api/webhooks/kofi` accepts Ko-fi's form field `data` containing JSON. It requires a configured verification token and PAYMENTS_ENABLED=true. The token is compared through fixed-length hashes, never logged or persisted. Payloads are size-limited and validated. Message IDs and transaction IDs are unique; duplicate notifications acknowledge without extending access. Only membership notifications can be reconciled. Client-supplied payment amounts never grant access.

Notifications are stored as pending events with amount, currency, membership flag and receipt time; payer emails/messages are deliberately not stored. A signed-in account submits a transaction ID as a **claim**, not proof of ownership. An administrator independently verifies a receipt and ownership through support and the Ko-fi dashboard, confirms AUD amount/period, then links exactly one authenticated event with a confirmed paid-through date. Matching email or knowing an ID never grants Pro. Repeat renewal payments need a fresh authenticated event and reconciliation. Yearly purchases remain unavailable.

The server additionally requires AUD, at least the configured monthly amount, and a paid-through date no more than 32 days ahead while yearly purchasing is disabled. Conditional transactional writes prevent concurrent claims from consuming one event twice. Tests exercise renewal, expiry, refund revocation, conflicting reconciliation, unsupported currency/amount and annual-date rejection. These are local provider fixtures, not evidence of live Ko-fi delivery.

Ko-fi does not provide complete membership lifecycle/cancellation events. Do not claim automatic cancellation detection. Check expiry on every server-backed Pro request; administrators reconcile refunds/disputes and confirmed paid-through dates conservatively. The subscription overview can revoke a paid period with a recorded reason (refund, dispute, incorrect link or manual review). This changes RandomTools access; it does not issue a refund or cancel billing at Ko-fi.

Development: use `/api/admin/mock-payment` as an authenticated admin with ENVIRONMENT=development. A visibly marked mock transaction can be claimed and reconciled locally. Mock endpoint returns 404 in production. No provider credentials or external requests are used.

Activation checklist: explicit owner approval, actual Ko-fi dashboard payload review, supported membership cadence, concurrency/load review, staging webhook delivery and renewal/expiry/refund tests, ownership support procedure, secret rotation process, correct AUD pricing. Local D1 tests verify webhook-token rejection, duplicate acknowledgement, reviewed linking and membership expiry. Keep live checkout disabled until all launch checks pass. No live integration has been exercised.
