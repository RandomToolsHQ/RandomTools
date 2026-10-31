# Deployment preparation — no deployment performed

Architecture: Pages frontend + Pages Function service proxy + separate Worker + D1. Review Cloudflare's [Pages service bindings](https://developers.cloudflare.com/pages/functions/bindings/#service-bindings) and [Worker configuration](https://developers.cloudflare.com/workers/wrangler/configuration/). The root `wrangler.toml` is the Pages config. `wrangler.api.toml` is exclusively the standalone API Worker config; its bindings do not automatically appear in Pages.

After explicit approval, create a staging D1 and replace the placeholder database_id. Use an isolated database for previews; never bind preview code to production data. Apply migrations remotely only with approval. Set the Worker APP_ORIGIN to the exact staging Pages custom origin. Set ENVIRONMENT=production, PAYMENTS_ENABLED=false and secrets via Wrangler secret put. Production must never run the development email adapter or local admin mocks.

Suggested commands (review first; these modify remote resources):

```powershell
npx.cmd wrangler d1 create randomtools --config wrangler.api.toml
npx.cmd wrangler d1 migrations apply randomtools --config wrangler.api.toml --remote
npx.cmd wrangler secret put RATE_LIMIT_SECRET --config wrangler.api.toml
npx.cmd wrangler deploy --config wrangler.api.toml
npm.cmd run build:pages
npx.cmd wrangler pages deploy dist
```

The Pages CLI reads the root `wrangler.toml`, which points at `dist` and declares the API service binding. `build:pages` compiles the root `functions/` proxy into the advanced-mode `dist/_worker.js` directory. `public/_routes.json` limits execution to `/api/*`, preserving static asset handling elsewhere. Pages provides its default SPA fallback because no top-level `404.html` is present; no catch-all rewrite loop is added. Do not deploy a plain Vite `dist` without compiling the proxy first. API commands must always supply `--config wrangler.api.toml`.

Set service binding API to `randomtools-api` in Pages production and preview settings as appropriate. Confirm `/api/me` returns JSON rather than the SPA and that Set-Cookie is passed through. Set a canonical production URL only once an owned domain is known. Generate sitemap URLs then; no domain is invented here.

Before launch: implement real email delivery, run staging account/payment/E2E tests, validate security headers on actual hosting, validate secure cookies/CSRF/password costs, review policies, test backups/deletion and restore, configure edge rate limits and reconcile Ko-fi payloads against actual dashboard samples. Local unit, D1 integration and browser tests are available; Worker dry-run and Pages Function compilation have been exercised. A successful local bundle does not prove production readiness.

PBKDF2 uses the native library adapter when supported, with an audited JS fallback at the same 600,000 iterations. Some Workers environments cap native iteration counts; local native success is not evidence that production supports them. The fallback is significantly slower. Benchmark and load-test staging before opening registration. The configured 30-second CPU ceiling needs an appropriate paid Workers plan; obtain owner approval before purchasing anything. See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [native PBKDF2 compatibility discussion](https://github.com/cloudflare/workerd/issues/1346).

Set an owned production origin for SEO before building:

```powershell
$env:VITE_SITE_URL = 'https://YOUR-OWNED-DOMAIN'
npm.cmd run build
```

This produces a sitemap and enables canonical page URLs. Add the sitemap URL to robots.txt after selecting the domain. Without this variable, local builds deliberately omit sitemap/canonical URLs rather than invent a public domain. Per-route title, description and Open Graph metadata update in the SPA; static prerendering for crawlers remains a launch improvement.

No workflow deploys or enables payments automatically. CI runs checks only.
