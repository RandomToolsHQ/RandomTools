import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { api } from "./api";
import { convert, download } from "./engines";
import { runRegex } from "./regex";
import { processFile } from "./files";
type Action = (fn: () => Promise<any>) => Promise<any>;
export default function ProWorkspace({
  action,
  busy = false,
}: {
  action: Action;
  busy?: boolean;
}) {
  const [text, setText] = useState("");
  const [other, setOther] = useState("");
  const [result, setResult] = useState("");
  const [operation, setOperation] = useState("case");
  const [mode, setMode] = useState("upper");
  const [name, setName] = useState("");
  const [days, setDays] = useState(30);
  const [steps, setSteps] = useState("lower,slug");
  const [fileMode, setFileMode] = useState("hash");
  const [regexPattern, setRegexPattern] = useState("(?<word>\\w+)");
  const [regexFlags, setRegexFlags] = useState("g");
  const [replacement, setReplacement] = useState("$<word>");
  const presets = useQuery({
    queryKey: ["presets"],
    queryFn: () => api("/pro/presets"),
  });
  const history = useQuery({
    queryKey: ["history"],
    queryFn: () => api("/pro/history"),
  });
  const preferences = useQuery({
    queryKey: ["preferences"],
    queryFn: () => api("/pro/preferences"),
  });
  async function run() {
    return action(async () => {
      let output: string;
      if (operation === "json") {
        const canonical = (v: any): any =>
          v && typeof v === "object"
            ? Array.isArray(v)
              ? v.map(canonical)
              : Object.fromEntries(
                  Object.keys(v)
                    .sort()
                    .map((k) => [k, canonical(v[k])]),
                )
            : v;
        const a = JSON.stringify(canonical(JSON.parse(text)), null, 2),
          b = JSON.stringify(canonical(JSON.parse(other)), null, 2);
        output = a === b ? "Structurally equal" : convert("diff", a, "", b);
      } else if (operation === "regex") {
        const cases = text.split("\n");
        if (cases.length > 50)
          throw Error("Limit: 50 regex test cases, one per line.");
        const results = [];
        for (const value of cases) {
          results.push({
            input: value,
            ...JSON.parse(
              await runRegex(regexPattern, regexFlags, value, replacement),
            ),
          });
        }
        output = JSON.stringify(results, null, 2);
      } else if (operation === "workflow") {
        const list = steps.split(",").map((s) => s.trim());
        if (
          list.length > 10 ||
          list.some(
            (s) => !["upper", "lower", "title", "slug", "trim"].includes(s),
          )
        )
          throw Error("Use up to 10 steps: upper, lower, title, slug, trim.");
        output = list.reduce(
          (v, s) => (s === "trim" ? v.trim() : convert("case", v, s, "")),
          text,
        );
      } else if (operation === "qr") {
        const lines = text.split("\n").filter(Boolean);
        if (lines.length > 50 || lines.some((l) => l.length > 2000))
          throw Error("Limit: 50 codes, 2,000 characters each.");
        const svgs = await Promise.all(
          lines.map((l) => QRCode.toString(l, { type: "svg" })),
        );
        output = JSON.stringify(
          lines.map((value, i) => ({ value, svg: svgs[i] })),
          null,
          2,
        );
      } else {
        if (text.split("\n").length > 1000)
          throw Error("Limit: 1,000 lines per batch.");
        output = text
          .split("\n")
          .map((line) => convert("case", line, mode, ""))
          .join("\n");
      }
      setResult(output);
      return {
        message:
          "Workspace processed locally. Save history explicitly if desired.",
      };
    });
  }
  async function files(files: FileList | null) {
    if (!files) return;
    await action(async () => {
      if (files.length > 20) throw Error("Limit: 20 files per batch.");
      let total = 0;
      const records = [];
      for (const f of Array.from(files)) {
        total += f.size;
        if (f.size > 25 * 1024 * 1024 || total > 100 * 1024 * 1024)
          throw Error("Limit: 25 MB per file, 100 MB per batch.");
        if (fileMode === "hash") {
          const hash = (await processFile(f, "hash")).hash!;
          records.push({
            name: f.name,
            bytes: f.size,
            sha256: hash,
          });
        } else {
          const blob = (await processFile(f, "image")).blob!;
          download(blob, f.name + ".webp");
          records.push({
            name: f.name,
            original: f.size,
            compressed: blob.size,
          });
        }
      }
      setResult(JSON.stringify(records, null, 2));
      return { message: "Batch processed on this device." };
    });
  }
  return (
    <fieldset
      className="dashboard-grid"
      style={{ marginTop: 24 }}
      disabled={busy}
      aria-busy={busy}
    >
      <div className="panel">
        <h2>Transformation workspace</h2>
        <p>
          Process up to 1,000 text lines or 50 QR codes locally. JSON comparison
          ignores object key order.
        </p>
        <label>
          Operation
          <select
            value={operation}
            onChange={(e) => setOperation(e.target.value)}
          >
            <option value="case">Batch text transformation</option>
            <option value="json">Advanced JSON comparison</option>
            <option value="qr">Bulk QR codes → SVG JSON</option>
            <option value="workflow">Transformation workflow</option>
            <option value="regex">Advanced regex workspace</option>
          </select>
        </label>
        {operation === "case" && (
          <label>
            Case
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              {["upper", "lower", "title", "slug"].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </label>
        )}
        {operation === "workflow" && (
          <label>
            Ordered workflow steps
            <input value={steps} onChange={(e) => setSteps(e.target.value)} />
          </label>
        )}
        {operation === "regex" && (
          <>
            <p>
              Test up to 50 cases (one per line), inspect captures and preview
              replacements. Each expression has a 1 second timeout.
            </p>
            <label>
              Regex pattern
              <input
                value={regexPattern}
                maxLength={5000}
                onChange={(e) => setRegexPattern(e.target.value)}
              />
            </label>
            <label>
              Regex flags
              <input
                value={regexFlags}
                onChange={(e) => setRegexFlags(e.target.value)}
              />
            </label>
            <label>
              Replacement template
              <input
                value={replacement}
                onChange={(e) => setReplacement(e.target.value)}
              />
            </label>
          </>
        )}
        <label>
          Input
          <textarea
            aria-label="Input"
            maxLength={200000}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </label>
        {operation === "json" && (
          <label>
            Comparison JSON
            <textarea
              aria-label="Comparison JSON"
              value={other}
              onChange={(e) => setOther(e.target.value)}
            />
          </label>
        )}
        <button className="primary" onClick={() => void run()}>
          Run transformation
        </button>
        <label>
          Result
          <textarea aria-label="Result" value={result} readOnly />
        </label>
        <button
          className="secondary"
          onClick={() => download(result, "workspace.txt")}
        >
          Text export
        </button>
        <button
          className="secondary"
          onClick={() =>
            download(
              JSON.stringify({ operation, result }, null, 2),
              "workspace.json",
            )
          }
        >
          JSON export
        </button>
        <button
          className="secondary"
          onClick={() =>
            download(
              "operation,result\r\n" +
                [operation, result]
                  .map(
                    (v) =>
                      '"' +
                      (/^[=+\-@\t\r]/.test(v) ? "'" : "") +
                      v.replaceAll('"', '""') +
                      '"',
                  )
                  .join(","),
              "workspace.csv",
            )
          }
        >
          CSV export
        </button>
        <button
          className="secondary"
          disabled={result.length > 10000 || !result}
          onClick={() =>
            void action(() =>
              api("/pro/history", {
                tool: operation,
                data: result,
              }),
            )
          }
        >
          Save private history
        </button>
        <p>
          History stores up to 100 entries, 10,000 characters each. Downloads
          support larger results.
        </p>
      </div>
      <div className="panel">
        <h2>Multi-file workspace</h2>
        <p>
          Up to 20 files, 25 MB each, 100 MB total. Images limited to 24
          megapixels. Keep this tab open while processing.
        </p>
        <label>
          Batch operation
          <select
            value={fileMode}
            onChange={(e) => setFileMode(e.target.value)}
          >
            <option value="hash">SHA-256 hashing</option>
            <option value="image">WebP image compression</option>
          </select>
        </label>
        <label>
          Choose files
          <input
            type="file"
            multiple
            accept={
              fileMode === "image"
                ? "image/jpeg,image/png,image/webp"
                : undefined
            }
            onChange={(e) => void files(e.target.files)}
          />
        </label>
        <h2>Saved presets & workflows</h2>
        <label>
          Preset name
          <input
            value={name}
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          className="primary"
          onClick={() =>
            void action(() =>
              api("/pro/presets", {
                kind: operation === "workflow" ? "workflow" : "preset",
                name,
                data: {
                  operation,
                  mode,
                  steps,
                  regexPattern,
                  regexFlags,
                  replacement,
                },
              }),
            )
          }
        >
          Save current configuration
        </button>
        {presets.data?.map((p: any) => (
          <div key={p.id}>
            <button
              className="secondary"
              onClick={() => {
                const d = JSON.parse(p.data);
                setOperation(d.operation || "case");
                setMode(d.mode || "upper");
                setSteps(d.steps || "lower,slug");
                setRegexPattern(d.regexPattern || "(?<word>\\w+)");
                setRegexFlags(d.regexFlags || "g");
                setReplacement(d.replacement || "$<word>");
                setName(p.name);
              }}
            >
              {p.name} · load
            </button>
            <button
              aria-label={"Delete " + p.name}
              onClick={() =>
                void action(() => api("/pro/presets", { id: p.id }, "DELETE"))
              }
            >
              Delete
            </button>
          </div>
        ))}
      </div>
      <div className="panel">
        <h2>Cloud preferences & favourites</h2>
        <p>Explicitly sync the theme and favourites saved on this device.</p>
        <label>
          History retention
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
          >
            {[0, 7, 30, 90].map((d) => (
              <option key={d} value={d}>
                {d === 0 ? "Disabled" : d + " days"}
              </option>
            ))}
          </select>
        </label>
        <p>
          Current saved retention: {preferences.data?.retention_days ?? 30}{" "}
          days.
        </p>
        <button
          className="primary"
          onClick={() =>
            void action(() =>
              api(
                "/pro/preferences",
                {
                  data: {
                    theme: localStorage.getItem("theme") || "dark",
                    favorites: JSON.parse(
                      localStorage.getItem("favorites") || "[]",
                    ),
                  },
                  retentionDays: days,
                },
                "PUT",
              ),
            )
          }
        >
          Upload preferences
        </button>
        <button
          className="secondary"
          onClick={() => {
            const p = JSON.parse(preferences.data?.data || "{}");
            if (["light", "dark"].includes(p.theme))
              localStorage.setItem("theme", p.theme);
            if (Array.isArray(p.favorites))
              localStorage.setItem(
                "favorites",
                JSON.stringify(
                  p.favorites.filter((s: unknown) => typeof s === "string"),
                ),
              );
            window.location.reload();
          }}
        >
          Restore from cloud
        </button>
      </div>
      <div className="panel">
        <h2>Private history</h2>
        <p>
          Only explicitly saved output is stored. Retention cleanup runs daily,
          when your history is accessed and when preferences change.
        </p>
        <button
          className="secondary"
          onClick={() => void action(() => api("/pro/history", {}, "DELETE"))}
        >
          Clear all history
        </button>
        {history.data?.map((h: any) => (
          <details key={h.id}>
            <summary>
              {h.tool} · {new Date(h.created_at * 1000).toLocaleString()}
            </summary>
            <pre>{h.data}</pre>
          </details>
        ))}
      </div>
    </fieldset>
  );
}
