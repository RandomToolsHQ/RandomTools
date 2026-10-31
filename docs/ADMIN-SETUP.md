# Admin bootstrap

Register and verify an ordinary local account first. Administrators are never selected by email configuration or public request fields. There is no role mutation API.

Using an authorized terminal with access to the **local** D1 database, query the account ID and promote that ID:

```powershell
npx.cmd wrangler d1 execute randomtools --config wrangler.api.toml --local --command "SELECT id,email FROM users;"
# Replace the UUID below with the independently verified account ID:
npx.cmd wrangler d1 execute randomtools --config wrangler.api.toml --local --command "UPDATE users SET role='admin' WHERE id='REPLACE-VERIFIED-UUID';"
```

For production, use a protected Cloudflare operator identity, independently verify the account holder and record the bootstrap in audit_logs using an authorized database procedure. Remote bootstrap is not automatic and requires explicit owner approval. Protect and restrict Cloudflare account/CLI access; the web app cannot promote anyone.

Admin changes disable/re-enable users and revoke sessions, review events/claims, reconcile membership and persist tool availability. Sensitive changes are audited. Mock payment creation is development-only. Search results are capped at 30 and events/logs at 50. Do not paste payment credentials into support tickets or audit fields.
