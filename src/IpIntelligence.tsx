import { useState } from "react";
import { api } from "./api";
import { download } from "./engines";
import { exportIpIntelligence } from "./ip-intelligence-export";
import type { IpIntelligence } from "../worker/ip-intelligence";
import "./ip-intelligence.css";
type Props = { request?: (path: string, body: unknown) => Promise<any> };
export default function IpIntelligenceLookup({ request = api }: Props) {
  const [ip, setIp] = useState(""),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<IpIntelligence | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const display = (v: unknown) =>
    v === null || v === undefined || v === ""
      ? "Unavailable"
      : typeof v === "boolean"
        ? v
          ? "Flagged by provider"
          : "Not flagged by provider"
        : String(v);
  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setResult(null);
    setError("");
    setNotice("");
    try {
      setResult(await request("/pro/ip-lookup", { ip: ip.trim(), consent }));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Lookup failed. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      if (!navigator.clipboard || !result) throw Error();
      await navigator.clipboard.writeText(exportIpIntelligence(result, "txt"));
      setNotice("Results copied.");
    } catch {
      setError("Clipboard is unavailable. Download the results instead.");
    }
  }
  return (
    <section
      className="panel ip-intelligence"
      aria-labelledby="ip-lookup-title"
      aria-busy={busy}
    >
      <span className="eyebrow">PRO · NETWORK TOOLS</span>
      <h2 id="ip-lookup-title">IP Intelligence Lookup</h2>
      <p>
        Look up a public IPv4 or IPv6 address. Geolocation is approximate and
        cannot identify a person’s physical address.
      </p>
      <form onSubmit={(e) => void lookup(e)}>
        <label>
          Public IP address
          <input
            value={ip}
            onChange={(e) => {
              setIp(e.target.value);
              setResult(null);
              setError("");
              setNotice("");
            }}
            maxLength={45}
            autoComplete="off"
            spellCheck={false}
            required
            disabled={busy}
            placeholder="1.1.1.1 or 2606:4700:4700::1111"
          />
        </label>
        <label className="consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
            disabled={busy}
          />
          <span>
            Send this IP to FreeIPAPI. RandomTools does not save searches or
            results; the provider may log API requests.{" "}
            <a
              href="https://freeipapi.com/privacy"
              target="_blank"
              rel="noreferrer"
            >
              Provider privacy
            </a>
          </span>
        </label>
        <button className="primary" type="submit" disabled={busy || !consent}>
          {busy ? "Looking up…" : "Look up IP"}
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {result && (
        <div className="ip-results">
          <h3>Network and approximate location</h3>
          <dl>
            {Object.entries({
              IP: result.ip,
              Country: result.country,
              "Region / state": result.region,
              City: result.city,
              "Approximate latitude": result.latitude,
              "Approximate longitude": result.longitude,
              "Exact timezone": result.timezone,
              "Country timezone candidates": result.countryTimezones.join(", "),
              ISP: result.isp,
              Organization: result.organization,
              ASN: result.asn,
              "ASN organization": result.asnOrganization,
              "Proxy indicator (FreeIPAPI)": result.indicators.proxy,
              "VPN indicator": result.indicators.vpn,
              "Hosting / datacenter indicator": result.indicators.hosting,
            }).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{display(value)}</dd>
              </div>
            ))}
          </dl>
          <p>{result.notice}</p>
          <p>
            Data from{" "}
            <a href="https://freeipapi.com" target="_blank" rel="noreferrer">
              FreeIPAPI
            </a>
            .
          </p>
          <div className="ip-actions">
            <button
              type="button"
              className="secondary"
              onClick={() => void copy()}
            >
              Copy IP results
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                download(
                  new Blob([exportIpIntelligence(result, "json")], {
                    type: "application/json",
                  }),
                  "randomtools-ip.json",
                )
              }
            >
              Download IP JSON
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() =>
                download(
                  exportIpIntelligence(result, "txt"),
                  "randomtools-ip.txt",
                )
              }
            >
              Download IP TXT
            </button>
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setResult(null);
              setIp("");
              setNotice("");
              setError("");
            }}
          >
            Clear IP results
          </button>
        </div>
      )}
    </section>
  );
}
