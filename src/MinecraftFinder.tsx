import { useState } from "react";
import { servers, serverStatus, type ServerStatus } from "./minecraft";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
export default function MinecraftFinder() {
  const client = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: () => api("/me") });
  const favourites = useQuery({
    queryKey: ["server-favourites", me.data?.user?.id],
    queryFn: () => api<{ favourites: string[] }>("/account/server-favourites"),
    enabled: !!me.data?.user,
  });
  const [saving, setSaving] = useState(false);
  async function favourite(id: string) {
    setSaving(true);
    try {
      await api(
        "/account/server-favourites",
        { serverId: id },
        favourites.data?.favourites.includes(id) ? "DELETE" : "POST",
      );
      await client.invalidateQueries({ queryKey: ["server-favourites"] });
      setNotice("Server favourites updated.");
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not save favourite.");
    } finally {
      setSaving(false);
    }
  }
  const [search, setSearch] = useState(""),
    [country, setCountry] = useState("All"),
    [version, setVersion] = useState(""),
    [region, setRegion] = useState("All"),
    [edition, setEdition] = useState("All"),
    [category, setCategory] = useState("All"),
    [auth, setAuth] = useState("All"),
    [statuses, setStatuses] = useState<Record<string, ServerStatus>>({}),
    [consent, setConsent] = useState(false),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [address, setAddress] = useState(""),
    [customEdition, setCustomEdition] = useState<"java" | "bedrock">("java");
  async function check(key: string, host: string, kind: "java" | "bedrock") {
    setBusy(true);
    setNotice("");
    try {
      const status = await serverStatus(host, kind);
      setStatuses((s) => ({ ...s, [key]: status }));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Status unavailable.");
    } finally {
      setBusy(false);
    }
  }
  const filtered = servers.filter(
    (s) =>
      (s.name + " " + s.address).toLowerCase().includes(search.toLowerCase()) &&
      (region === "All" || region === s.region) &&
      (edition === "All" || edition === s.edition) &&
      (country === "All" || country === s.country) &&
      (!version.trim() ||
        statuses[s.id]?.version
          ?.toLowerCase()
          .includes(version.trim().toLowerCase())) &&
      (category === "All" || category === s.category) &&
      (auth === "All" || auth === s.authentication),
  );
  function status(key: string) {
    const s = statuses[key];
    return s ? (
      <p role="status">
        {s.online ? "Online" : "Offline"}
        {s.online && s.players !== undefined
          ? ` · ${s.players}${s.max !== undefined ? ` / ${s.max}` : ""} players`
          : ""}
        {s.version ? ` · Reported version: ${s.version}` : ""} · Checked{" "}
        {new Date(s.checkedAt).toLocaleTimeString()}. Provider data may be
        cached.
      </p>
    ) : (
      <p>
        Status not checked. Supported client versions and game latency are not
        verified.
      </p>
    );
  }
  return (
    <section className="text-page generator-page">
      <p className="eyebrow">FREE · SOURCE-LINKED SERVER BROWSER</p>
      <h1>Minecraft server finder</h1>
      <p>
        A small curated starting list, not a complete server directory. Regional
        routes are published names, not verified physical locations. Country,
        Survival/SMP/Anarchy coverage and cracked/offline authentication are
        unverified and are not invented.
      </p>
      <div className="generator-form">
        <label>
          Country
          <select
            aria-label="Country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            <option>All</option>
            <option>Unknown</option>
          </select>
        </label>
        <label>
          Reported version
          <input
            value={version}
            onChange={(e) => setVersion(e.target.value)}
            placeholder="Check status first, then filter"
            maxLength={100}
          />
        </label>
        <label>
          Search servers
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            type="search"
          />
        </label>
        {[
          ["Edition", edition, setEdition, ["All", "java", "bedrock"]],
          [
            "Region",
            region,
            setRegion,
            ["All", "Europe", "North America", "Asia", "Unknown"],
          ],
          [
            "Category",
            category,
            setCategory,
            [
              "All",
              "Minigames",
              "PvP",
              "Survival",
              "SMP",
              "Anarchy",
              "Unclassified",
            ],
          ],
          [
            "Authentication",
            auth,
            setAuth,
            ["All", "Official account required", "Not verified"],
          ],
        ].map(([label, value, set, options]) => (
          <label key={label as string}>
            {label as string}
            <select
              aria-label={label as string}
              value={value as string}
              onChange={(e) => (set as (v: string) => void)(e.target.value)}
            >
              {(options as string[]).map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </label>
        ))}
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        Allow manual status lookups via mcstatus.io (sends your IP and server
        address to that provider).
      </label>
      <p>
        <a href="https://mcstatus.io/docs" target="_blank" rel="noreferrer">
          Provider documentation
        </a>
        . One lookup at a time; responses cached for at least a minute. HTTP
        timing is not game ping.
      </p>
      <p role="status">{notice}</p>
      {!filtered.length && (
        <p>
          No verified entries match these filters. Try another filter or check a
          public address below.
        </p>
      )}
      <p>
        Server favourites sync only for signed-in accounts in restricted
        testing. Public signup remains closed.
      </p>
      {favourites.error && (
        <p role="alert">Could not load server favourites.</p>
      )}
      <div className="server-grid">
        {filtered.map((s) => (
          <article className="server-card" key={s.id}>
            <h2>{s.name}</h2>
            <p>
              <code>{s.address}</code>
            </p>
            <p>
              {s.edition} · {s.category} · {s.region} · Country: {s.country}
            </p>
            <p>Authentication: {s.authentication}</p>
            <a href={s.source} target="_blank" rel="noreferrer">
              Official source
            </a>
            {status(s.id)}
            <div className="actions">
              <button
                disabled={!consent || busy}
                onClick={() => void check(s.id, s.address, "java")}
              >
                Check status
              </button>
              <button
                onClick={() =>
                  void navigator.clipboard.writeText(s.address).then(
                    () => setNotice("Server address copied."),
                    () =>
                      setNotice(
                        "Copy unavailable; select the address manually.",
                      ),
                  )
                }
              >
                Copy address
              </button>
              {me.data?.user && (
                <button
                  disabled={
                    saving || favourites.isPending || !!favourites.error
                  }
                  aria-pressed={
                    favourites.data?.favourites.includes(s.id) || false
                  }
                  onClick={() => void favourite(s.id)}
                >
                  {favourites.data?.favourites.includes(s.id)
                    ? "Remove favourite"
                    : "Save favourite"}
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
      <h2>Check a public Java or Bedrock address</h2>
      <form
        className="generator-form"
        onSubmit={(e) => {
          e.preventDefault();
          void check("custom", address, customEdition);
        }}
      >
        <label>
          Public server hostname
          <input
            required
            value={address}
            placeholder="server.example.org:25565"
            onChange={(e) => setAddress(e.target.value)}
            maxLength={253}
          />
        </label>
        <label>
          Server edition
          <select
            value={customEdition}
            onChange={(e) =>
              setCustomEdition(e.target.value as typeof customEdition)
            }
          >
            <option value="java">Java</option>
            <option value="bedrock">Bedrock</option>
          </select>
        </label>
        <button className="primary" disabled={!consent || busy}>
          {busy ? "Checking…" : "Check public address"}
        </button>
      </form>
      {status("custom")}
    </section>
  );
}
