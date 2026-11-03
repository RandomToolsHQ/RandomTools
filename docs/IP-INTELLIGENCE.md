# IP Intelligence Lookup — release candidate

This is the thirteenth planned Pro capability, implemented on
`codex/phase10-release-readiness`. It is not deployed to the public website or
enabled on hosted staging. The existing twelve capabilities and 21 free tools
remain available in their current environments.

## Provider decision (4 November 2026)

| Provider | Decision |
| --- | --- |
| FreeIPAPI | Selected for the bounded prototype. The free HTTPS endpoint accepts IPv4/IPv6 without an account, key or payment method; commercial use is permitted. |
| ipapi.is | Rejected: its terms prohibit third-party IP lookup services despite general commercial-use statements. |
| ipwhois.io | Not selected: terms restrict redistribution/reselling without prior permission. |

Primary references: [FreeIPAPI terms](https://freeipapi.com/terms),
[limits](https://freeipapi.com/rate-limit),
[response contract](https://freeipapi.com/docs/api-reference/get-ip-info),
[privacy](https://freeipapi.com/privacy),
[ipapi.is terms](https://ipapi.is/terms.html),
[ipwhois terms](https://ipwhois.io/terms).

Only `https://free.freeipapi.com/api/v1/json/{ip}` is used. Paid regional endpoints
are not configured. Free limits are 10 requests/10 seconds and 60/minute shared
by backend outgoing IP. This application allows three/user/minute, five/shared
10 seconds and 30/shared minute. A provider 429 starts a 60-second shared cooldown.
Other Cloudflare customers may share outgoing addresses, so availability is not
guaranteed. There is no paid fallback or SLA.

Two bounded local probes of public infrastructure IPv4/IPv6 addresses returned
HTTP 200 and the documented fields. This is provider compatibility evidence,
not hosted Pro authorization or Worker CPU evidence.

## Supported data and privacy

Country, region, city, coordinates, ASN, ASN organization and the provider proxy
indicator are supported when present. Country timezone candidates are labelled
as such; an exact IP timezone, ISP, ownership organization, VPN and hosting flags
are unavailable with this response contract. No missing field is inferred.
Location is approximate and cannot identify a physical address. Indicators are
provider classifications, not proof of proxy/VPN use.

Users explicitly consent before an IP is sent to the provider. RandomTools keeps
the input/results only in component memory and offers local copy, JSON and TXT
exports. No lookup history is recorded. The provider may log API requests; do
not claim end-to-end anonymity or zero third-party retention.

## Deployment boundary

`POST /api/pro/ip-lookup` requires existing authentication, gateway restrictions,
fresh enabled/verified D1 identity and active Pro (or existing admin entitlement).
Origin and JSON checks, strict public-IP validation, SSRF safeguards, bounded
responses, timeouts and atomic rate counters apply. Client role/Pro fields cannot
grant access. No migration or secret/provider API key is needed.

The Worker returns 503 unless `IP_LOOKUP_ENABLED` is exactly `true`. Do not enable
or deploy this candidate automatically. First pass full CI, review provider terms
and privacy disclosure, then validate on the approved restricted environment.
The public build continues denying APIs and account routes. Rollback is the
previous Worker/Pages version or removing the feature flag; no schema rollback
or genuine account mutation is needed.

## Tests

`tests/ip-intelligence.test.ts` covers public IPv4/IPv6, malformed and reserved
inputs, response normalization, fresh entitlement expiry/revocation, client
claim rejection, disabled users, CSRF/consent, shared/user limits, timeout,
oversize/malformed/mismatched provider responses and exports. Existing Worker
and Firebase integration tests also check direct endpoint authorization.
`e2e/ip-intelligence.spec.ts` covers responsive accessible results, loading/error
states, local downloads, free-user denial and saved workflow regression cases.
All automated provider responses are mocked. Do not load-test the real provider.
