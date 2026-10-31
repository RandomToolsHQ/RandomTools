# RandomTools HQ

A React / TypeScript toolkit with 18 browser utilities, a D1-backed account API and an explicitly reviewed Ko-fi membership workflow. This is an implementation in progress, **not a production-ready release**. See [PROGRESS.md](PROGRESS.md) for the exact verification and release gaps.

## Local development (Windows PowerShell)

Use Node 22.12+ and npm. The `.cmd` suffix works when PowerShell blocks npm.ps1.

```powershell
npm.cmd install
Copy-Item .env.example .dev.vars
npm.cmd run db:migrate
npm.cmd run dev:api
# In a second terminal:
npm.cmd run dev
```

Open http://localhost:5173 (the configured origin). API requests are proxied to Wrangler on port 8787. Do not use a different hostname for account mutations without updating APP_ORIGIN.

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npx.cmd playwright install chromium firefox webkit
npm.cmd run test:e2e
```

## Product

All free tools process inputs locally. Local favourites and theme use localStorage; authentication never does. Free utilities include JSON, Base64, URL, Unix timestamps, UUIDs, text diff, regex (isolated worker timeout), HTML entities, passwords, QR codes, text counts, case, colours, random integers, image compression, SHA-256 files and Discord utilities.

Accounts have verification/resend, reset, password changes, session revocation, export and deletion. Development links are returned directly and explicitly labelled. An optional Resend transport supports production delivery after the owner configures real credentials and a verified sender; otherwise requests fail closed. See [email configuration](docs/EMAIL.md).

Pro storage is enforced by the Worker. The Pro workspace includes batch images/hashes, canonical JSON comparison, bulk QR SVG output, multi-case regex with captures/replacements, batch text transformations, presets, synced preferences, TXT/JSON/CSV exports, multi-file processing, saved text workflows and private history. Client-only batch operations offer convenience rather than a security boundary; open-source browser processing cannot be made inaccessible to someone inspecting the code. No claim of unlimited processing is made.

Pricing is configured in `src/catalog.ts`: Free A$0, proposed monthly A$4.99 AUD and yearly A$39.99 AUD. Checkout is disabled; yearly is not purchasable.

## Hosting

The frontend targets Cloudflare Pages. A Pages Function proxies `/api/*` through a **service binding** to a separately configured standalone Worker. D1 belongs to that Worker. This avoids cross-origin auth cookies. No R2 or user uploads are needed. `build:pages` creates the complete Pages artifact. The root `wrangler.toml` configures Pages; `wrangler.api.toml` configures the standalone API. See [deployment](docs/DEPLOYMENT.md) and [architecture](docs/ARCHITECTURE.md).

## Licence

MIT was chosen to allow personal and commercial reuse, modification and contributions with a simple attribution requirement. Branding is not a grant of trademark rights. See [LICENSE](LICENSE).

Contact: randomtoolshq@gmail.com · [GitHub](https://github.com/RandomToolsHQ/RandomTools) · [Ko-fi](https://ko-fi.com/itzrealfisheryt)
