# Architecture

Hosted accounts now use Clerk's frontend SDK and server-verified short-lived
session tokens; D1 retains internal users, roles and entitlements. See
[CLERK.md](CLERK.md) for the additive identity migration and deployment gates.
Legacy password/session tables remain for local regression testing and explicit
operator-reviewed migration, not a hosted fallback.

React + Vite + Tailwind provide the UI; Router lazy-loads tool/account screens, Motion respects reduced motion, Lucide supplies icons, TanStack Query handles account reads and cache invalidation. Pure engines are shared by free and batch tools. Regex runs in an isolated worker terminated after one second. Image compression uses OffscreenCanvas in a shared file worker where supported and a validated canvas fallback in WebKit; hashing runs in the file worker. WebP is preferred; browsers without that encoder use JPEG for JPEG inputs and PNG otherwise, preserving transparency. Downloads use the actual format. Batch images download as a single ZIP to avoid browser multiple-download restrictions. File workers time out after 30 seconds. Browser files are limited to 25 MB, images to 24 MP. Batch files are sequential, max 20 / 100 MB input and 100 MB output. Web Crypto and browser Workers are required.

Pages serves `dist`; `functions/api/[[path]].ts` forwards same-origin requests using service binding API. `build:pages` compiles it into advanced-mode `dist/_worker.js`. A standalone Worker owns D1. The root `wrangler.toml` defines Pages output and the service binding; **`wrangler.api.toml` separately configures the API Worker**. Every API Wrangler command supplies `--config wrangler.api.toml`. Vite proxies API traffic locally instead of running Pages Functions.

Schema: users (unique email, immutable client role); sessions (hashed token, expiry); verification/reset tokens (digest, single use, expiry); subscriptions (confirmed paid-through date); payment_events (unique message and transaction IDs); membership_claims (pending ownership verification); preferences; presets/workflows; private history; audit logs; rate limits; availability; aggregate usage. Foreign keys cascade account workspace deletion. Subscription expiry is checked on every Pro request.

No R2 needed. No uploads. Only explicitly saved workspace content goes to the API. Database writes use bound parameters. Anonymous daily tool counts are opt-in via the footer and omit input content and account IDs. Temporary rate-limit records hash network addresses. Tool availability controls filter the directory and block the corresponding tool screen when the API is reachable; browser tools remain usable offline and availability is an operational control, not DRM.

A daily scheduled Worker handler removes expired sessions, one-time tokens, rate limits and out-of-retention history; audit retention is 180 days and aggregate usage retention 90 days. History also cleans up on read/preferences change and is capped at 100 entries. Saved presets/workflows are capped at 100. Daily retention deletion may lag the chosen period by up to 24 hours.

Streamed API request bodies are byte-limited before full buffering. Malformed UTF-8 is a 400 error. Verification/reset consumption and account/session updates share a transaction. Preset quotas and membership reconciliation use conditional SQL writes so simultaneous requests cannot exceed the quota or consume the same event twice. Reconciliation currently requires an authenticated AUD membership payment of at least the configured monthly price and a confirmed date within 32 days; annual purchases remain disabled.
