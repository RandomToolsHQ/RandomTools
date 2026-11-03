import type { IpIntelligence } from "../worker/ip-intelligence";
export function exportIpIntelligence(
  data: IpIntelligence,
  format: "json" | "txt",
) {
  if (format === "json") return JSON.stringify(data, null, 2);
  const value = (v: unknown) =>
    v === null || v === undefined || v === "" ? "Unavailable" : String(v);
  return [
    "RandomTools — IP Intelligence Lookup",
    "",
    `IP: ${data.ip}`,
    `Country: ${value(data.country)}`,
    `Region: ${value(data.region)}`,
    `City: ${value(data.city)}`,
    `Approximate latitude: ${value(data.latitude)}`,
    `Approximate longitude: ${value(data.longitude)}`,
    `Exact timezone: ${value(data.timezone)}`,
    `Country timezone candidates: ${data.countryTimezones.join(", ") || "Unavailable"}`,
    `ISP: ${value(data.isp)}`,
    `Organization: ${value(data.organization)}`,
    `ASN: ${value(data.asn)}`,
    `ASN organization: ${value(data.asnOrganization)}`,
    `Proxy indicator (${data.provider}): ${value(data.indicators.proxy)}`,
    `VPN indicator: ${value(data.indicators.vpn)}`,
    `Hosting indicator: ${value(data.indicators.hosting)}`,
    "",
    data.notice,
    data.attribution,
  ].join("\n");
}
