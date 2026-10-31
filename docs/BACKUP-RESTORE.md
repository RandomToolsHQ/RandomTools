# Database backup and restore

`npm.cmd run check:backup` rehearses the real Wrangler SQL exporter and importer with synthetic data in fresh configurations under ignored `.wrangler/backup-check-*` directories. It never uses the application's local database, production bindings or remote operations. It verifies a quoted profile name, saved workflow JSON, foreign-key integrity and cascade deletion after restoration. Artifacts are retained locally for inspection and contain only synthetic data.

Production backups contain personal information and password hashes: restrict access, encrypt the storage volume/archive with an established tool, set retention and test restoration into an isolated staging database. Do not commit SQL dumps, put them in `public`/`dist`, or share them in support tickets.

The following commands are documentation only. They require explicit owner approval and correctly configured Cloudflare access before execution:

```powershell
# Export only to an access-controlled location outside the public web build.
npx.cmd wrangler d1 export randomtools --config wrangler.api.toml --remote --output PRIVATE_BACKUP_PATH.sql
# Restore into a separately reviewed, empty staging database configuration.
npx.cmd wrangler d1 execute STAGING_DATABASE --config REVIEWED_STAGING_CONFIG.toml --remote --file PRIVATE_BACKUP_PATH.sql
```

Confirm the final account/database IDs and destination before restoring. Never run a restore against a live database as a routine check. After restoring, check schema/migration records, row counts, foreign keys, a synthetic account flow and application entitlements. Revoke restored sessions and reset tokens before opening a restored environment to users. Rotate secrets if the backup was exposed. Deletion requests must also be respected when recovering an older backup.

The local rehearsal has been executed; production export availability, recovery time, provider backups and an actual remote restoration remain untested because no remote infrastructure has been authorized.
