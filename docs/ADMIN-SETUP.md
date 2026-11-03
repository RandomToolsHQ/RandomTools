# Admin bootstrap

## Owner-confirmed Clerk staging bootstrap

The existing schema has `free` and `admin` roles. Founder is an owner designation,
not a client-controlled role or extra login mechanism. A verified enabled admin
has inherent Pro access with no scheduled expiry; no subscription/payment or
separate grant is required. Disabling the account or revoking its admin role
remains effective through fresh database checks. Keep the staging gateway and
Clerk live session/profile checks intact.

Use the protected operator CLI, never a web role-mutation endpoint:

1. Run `node scripts/admin-bootstrap.mjs --prepare --subject user_EXACT_ID`.
   It performs remote reads only, verifies the provider's primary email, enabled
   status and exact active issuer/subject-to-D1 mapping, and requires the first
   admin baseline. It writes a 24-hour plan under ignored, user/SYSTEM-only
   `.wrangler/founder-bootstrap` without copying API keys.
2. Present the exact Clerk ID, D1 ID and `free` → `admin` / inherent permanent Pro
   change to the owner. **Do not apply until the owner explicitly confirms.**
3. After confirmation, use `--apply --confirm-subject EXACT_CLERK_ID
   --confirm-user EXACT_D1_ID --confirm-operation EXACT_PLAN_OPERATION
   --confirm-permissions admin-with-inherent-pro`. Do not put API keys in args.
   The account/provider/plan are rechecked before any remote write.
4. A temporary, narrowly scoped D1 trigger atomically records
   `admin.bootstrap.founder` in existing audit_logs with the role update. Audit
   failure rolls back the role change. The exact active identity, verified/
   enabled state, absence of another admin, and unused operation ID are checked
   in the update. The trigger is removed immediately; no hidden access remains.
5. Verify one audit event, unchanged non-role account fields, inherent Pro and
   the restricted dashboard with the owner's normal Clerk session. Never mint
   an impersonation session or bypass a password/code/security prompt merely to
   test the genuine account. Run ordinary-user escalation/security tests too.

Replays do not promote again; consumed operations and expired plans are refused.
The operator needs existing Cloudflare D1 authorization and the ignored local
Clerk development backend key. No public registration, billing, authentication
configuration, application deployment or Git main merge is part of this process.

## Current free-first access workflow

Apply `0004_manual_pro.sql` to an isolated development database before running
this branch. It adds `pro_access_requests` and `pro_grants` without changing or
deleting historical payment records. Do not apply it remotely or deploy this
branch as part of local testing.

The existing admin dashboard now includes **Pro access management**. Find a
verified enabled account, choose it as the recipient, and grant 7 days, 30 days
or permanent access. No request or payment is required. Permanent has no scheduled
expiry, but remains revocable. A new grant replaces the previous grant and retains
its history. Direct grants automatically approve a pending request for that user.

Review pending requests using the status filter; approve with a duration or deny.
An ordinary authenticated user can submit one pending request with an optional
500-character reason and see their own last 20 requests/grants. Denial, expiry
or revocation permits another request; active Pro users need not request again.
Submissions are rate limited to five attempts per 15 minutes. Requests and grants
are capped in admin lists at 100 rows; use the request status filter and user search.
Selecting a recipient filters grant history to that account, so an older current
grant remains accessible even when other users have newer grants.

Revoke a grant with a reason from its history card. The next server request reads
fresh database authorization. Expired grants need no cleanup job to stop access.
Administrators retain inherent Pro permissions through their admin role; revoking
a separate grant does not remove that role. There is still no web role-promotion API.

Successful approvals, denials, grants, replacements and revocations are audited
atomically with their state changes. Audit action names start with `pro.` and
target the request/grant ID. Grant records retain the recipient, duration, actor,
expiry and revocation reason. Existing 180-day audit retention still applies.
Account export includes only owned requests/grants; deleting an account cascades
owned access records. Preserve synthetic audit evidence after testing and remove
all temporary admin roles/grants before ending any hosted test.

**Payments are retired in this branch:** Ko-fi webhook returns 404; authenticated
payment claims and admin reconcile/mock/paid-revocation routes return 410. Normal
authentication/admin checks still apply to protected routes. `PAYMENTS_ENABLED`
cannot reactivate them, and historical `subscriptions` rows do not authorize Pro.
Payment source is preserved behind these hard stops and in Git history; future
activation requires a new code/security review and explicit owner approval.

## Role bootstrap

Register and verify an ordinary local account first. Administrators are never selected by email configuration or public request fields. There is no role mutation API.

Using an authorized terminal with access to the **local** D1 database, query the account ID and promote that ID:

```powershell
npx.cmd wrangler d1 execute randomtools --config wrangler.api.toml --local --command "SELECT id,email FROM users;"
# Replace the UUID below with the independently verified account ID:
npx.cmd wrangler d1 execute randomtools --config wrangler.api.toml --local --command "UPDATE users SET role='admin' WHERE id='REPLACE-VERIFIED-UUID';"
```

For production, use a protected Cloudflare operator identity, independently verify the account holder and record the bootstrap in audit_logs using an authorized database procedure. Remote bootstrap is not automatic and requires explicit owner approval. Protect and restrict Cloudflare account/CLI access; the web app cannot promote anyone.

Admin changes disable/re-enable users and revoke sessions, manage manual Pro
access and persist tool availability. Sensitive changes are audited. User search
results are capped at 30 and audit logs at 50. Never paste secrets into requests,
support tickets or audit fields. Legacy payment controls are inactive in all modes.
