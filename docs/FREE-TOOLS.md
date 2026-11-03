# Free tools expansion — restricted staging and public candidate

Phase 7 added three catalog entries (21 total) and an advanced local password
generator. That frozen public release is deployed; the Phase 10 account/Pro
candidate does not change the public deployment or merge main.

The Phase 10 audit retains every free tool. Automated coverage exercises text
conversions, local file/hash/image and QR output, download content and stale-file
rejection, advanced passwords/identities/usernames, consent-based Minecraft
lookups, local favourites/recents, search, keyboard navigation, blocked device
storage, desktop/mobile overflow and WCAG A/AA checks in both themes. External
provider replies are fixtures; browser emulation is not a physical-device audit.

## External data and limitations

Minecraft uses a small, explicitly source-linked seed list. Hypixel's official
support page confirms official Java accounts; CubeCraft publishes its Java
address; Minemen's store publishes its three regional route addresses. Regional
names do not prove country or physical server location. Authentication elsewhere
is unknown. No offline/cracked compatibility is inferred. No licensed complete
directory was established, so comprehensive country/category coverage is deferred.
Bedrock supports manual public-hostname checks; no unsourced seed addresses.

Optional browser requests use the documented public mcstatus.io v2 API:
https://mcstatus.io/docs and https://mcstatus.io/about. The API documents five
requests/second per client IP and cached data. This client allows one outstanding
lookup, at least one second between calls, a minute cache, eight-second timeout
and 429 backoff. Independent tabs/other clients can still exhaust that shared
quota. No bulk polling or privileged proxy. Reported versions can be filtered
after lookup; they do not establish compatible client versions. Country is
explicitly unknown. HTTP duration is never labelled game latency. Metadata is
untrusted text; no HTML/icons supplied by servers are rendered. Provider outage,
CORS failure or throttling means unknown, not offline. A bounded real Chromium
CORS request to the Java endpoint returned HTTP 200 with expected schema during
development; automated tests use fixtures rather than depend on live servers.

Roblox generation follows the published 3–20-character/one internal underscore
format: https://en.help.roblox.com/hc/en-us/articles/4412614080532-Xbox-Error-901.
Availability and moderation remain unverified. No supported bulk availability
integration was established; manual People Search does not prove availability.
No registration, credential collection or CAPTCHA handling is implemented.

Identities are marked fictional and email domains restricted to reserved
example.com/net/org, .test and .invalid. These do not create inboxes. CSV cells
are quoted and formula-leading characters escaped. Formatting can deliberately
produce duplicate emails; include {n} for per-batch uniqueness.

Passwords use crypto.getRandomValues with unbiased rejection sampling. Required
character groups condition uniformly sampled strings rather than fixing their
positions. Entropy counts the constrained generation space; it is not a promise
about cracking time or account security. Passphrases lazily load EFF's 7,776-word
list (attribution in src/data/NOTICE.md). Results are held in component memory,
cleared on navigation, and never stored/sent as history or usage. Copies and
downloaded plaintext are under the user's control and cannot be remotely erased.

## New account data and migration

0005_server_favourites.sql creates one new table only. Existing tables are not
rewritten. Fixed curated IDs, account-scoped queries, verified-account checks,
mutation limits and existing Clerk/gateway/session checks apply. This is a free
account feature, not a Pro entitlement. Export includes it; account deletion
cascades. Tool-recents store only catalog IDs on the device (maximum eight).

Staging deployment must first back up D1, apply 0005, verify old rows unchanged
and foreign keys, then deploy the matching API/frontend behind the gateway.
Safe application rollback keeps the additive table. Dropping the table is
destructive: first export it and obtain explicit approval if it has user data.
CI never applies remote migrations. Phase 7 separately applied 0005 only to the
existing restricted staging database after a verified backup/restore. Hosted
favourite ownership/export/deletion checks passed and synthetic rows were removed.
The deployed public artifact has no D1 binding or account access. Its deployment
is recorded in LAUNCH-READINESS.md and remains unchanged during Phase 10 work.
