import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import QRCode from "qrcode";
import { Copy, Download, RotateCcw, ShieldCheck, Play } from "lucide-react";
import { tools } from "./catalog";
import { deviceGet } from "./device-storage";
import { convert, download } from "./engines";
import { runRegex } from "./regex";
import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import { processFile } from "./files";
import { imageExtension } from "./image-core";
export default function ToolPage() {
  const { id } = useParams();
  const tool = tools.find((t) => t.id === id);
  const [input, setInput] = useState("");
  const [other, setOther] = useState("");
  const [mode, setMode] = useState("");
  const [output, setOutput] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [hasResult, setHasResult] = useState(false);
  const job = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(
    () => () => {
      job.current++;
    },
    [],
  );
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState("");
  const [compressed, setCompressed] = useState<{
    blob: Blob;
    name: string;
  } | null>(null);
  const availability = useQuery({
    queryKey: ["tools"],
    queryFn: () => api("/tools"),
    staleTime: 300000,
  });
  if (!tool) return <h1>Tool not found</h1>;
  if (
    availability.data?.availability?.some(
      (t: any) => t.tool === id && !t.enabled,
    )
  )
    return (
      <section className="text-page">
        <h1>{tool.name} is temporarily unavailable.</h1>
        <p>Please check back later.</p>
      </section>
    );
  function begin() {
    job.current++;
    setError("");
    setNotice("");
    setOutput("");
    setImage("");
    setCompressed(null);
    setHasResult(false);
    setBusy(true);
    return job.current;
  }
  async function run() {
    const current = begin();
    try {
      if (id === "qr") {
        if (!input || input.length > 2000)
          throw Error("Enter 1–2,000 characters.");
        const result = await QRCode.toDataURL(input, { width: 640, margin: 2 });
        if (current !== job.current) return;
        setImage(result);
        setOutput(input);
      } else if (id === "regex") {
        const result = await runRegex(input, mode || "g", other);
        if (current !== job.current) return;
        setOutput(result);
      } else setOutput(convert(id!, input, mode, other));
      setHasResult(true);
      if (deviceGet("analytics") === "true")
        void api("/usage", { tool: id }).catch(() => {});
    } catch (e) {
      if (current === job.current) setError((e as Error).message);
    } finally {
      if (current === job.current) setBusy(false);
    }
  }
  async function file(file?: File) {
    if (!file) return;
    const current = begin();
    try {
      if (file.size > 25 * 1024 * 1024)
        throw Error("Files must be under 25 MB.");
      if (id === "hash") {
        const result = await processFile(file, "hash");
        if (current !== job.current) return;
        setOutput(result.hash!);
      } else {
        const blob = (await processFile(file, "image")).blob!;
        if (current !== job.current) return;
        const extension = imageExtension(blob);
        setCompressed({
          blob,
          name: file.name.replace(/\.[^.]+$/, "") + "." + extension,
        });
        setOutput(
          `Original: ${file.size.toLocaleString()} bytes\nCompressed (${extension.toUpperCase()}): ${blob.size.toLocaleString()} bytes\nSaved ${Math.round((1 - blob.size / file.size) * 100)}% (some images may grow).\nWebP is preferred; browsers without that encoder use JPEG for JPEG inputs and PNG otherwise. Maximum dimension: 1920px.`,
        );
      }
      setHasResult(true);
      if (deviceGet("analytics") === "true")
        void api("/usage", { tool: id }).catch(() => {});
    } catch (e) {
      if (current === job.current) setError((e as Error).message);
    } finally {
      if (current === job.current) setBusy(false);
    }
  }
  const modes: Record<string, string[]> = {
    json: ["pretty", "compact"],
    base64: ["encode", "decode"],
    url: ["encode", "decode"],
    html: ["encode", "decode"],
    unix: ["timestamp", "date"],
    case: ["upper", "lower", "title", "slug"],
    discord: ["F", "f", "R", "t", "T", "d", "D"],
  };
  return (
    <section className="tool-page">
      <div className="eyebrow">{tool.category} / FREE TOOL</div>
      <h1>{tool.name}</h1>
      <p className="lead">{tool.description}</p>
      <div className="privacy">
        <ShieldCheck size={16} />
        Processed in your browser. Your input stays on your device.
      </div>
      <div className="editor panel">
        <div className="panel-head">
          <h2>Workspace</h2>
          <span className="badge">Free forever</span>
        </div>
        {["hash", "image"].includes(id!) ? (
          <label className="drop">
            Choose a {id === "hash" ? "file" : "JPEG, PNG or WebP image"} · Max
            25 MB
            <input
              ref={fileInput}
              disabled={busy}
              type="file"
              accept={
                id === "image" ? "image/jpeg,image/png,image/webp" : undefined
              }
              onChange={(e) => void file(e.target.files?.[0])}
            />
          </label>
        ) : (
          <>
            {id === "colour" && (
              <label>
                Pick a colour
                <input
                  aria-label="Colour picker"
                  type="color"
                  value={/^#[a-f\d]{6}$/i.test(input) ? input : "#6366f1"}
                  onChange={(e) => setInput(e.target.value)}
                />
              </label>
            )}
            {(id === "discord" || (id === "unix" && mode === "date")) && (
              <label>
                Select date and time
                <input
                  aria-label="Date and time"
                  type="datetime-local"
                  value={
                    /^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d)?$/.test(input)
                      ? input
                      : ""
                  }
                  onChange={(e) => setInput(e.target.value)}
                />
              </label>
            )}
            <label htmlFor="input">
              {id === "password"
                ? "Password length (8–128)"
                : id === "random"
                  ? "Minimum"
                  : id === "regex"
                    ? "Regular expression"
                    : id === "uuid"
                      ? "Number of UUIDs (1–100)"
                      : "Input"}
            </label>
            <textarea
              id="input"
              value={input}
              maxLength={200000}
              placeholder={
                id === "json"
                  ? ' { "hello": "world" }'
                  : id === "colour"
                    ? "#6366f1"
                    : "Enter your input…"
              }
              onChange={(e) => setInput(e.target.value)}
            />
            {["diff", "regex", "random"].includes(id!) && (
              <>
                <label htmlFor="other">
                  {id === "random"
                    ? "Maximum"
                    : id === "regex"
                      ? "Test text"
                      : "Comparison text"}
                </label>
                <textarea
                  id="other"
                  maxLength={200000}
                  value={other}
                  onChange={(e) => setOther(e.target.value)}
                />
              </>
            )}
            {modes[id!] && (
              <label>
                Operation
                <select
                  value={mode || modes[id!][0]}
                  onChange={(e) => setMode(e.target.value)}
                >
                  {modes[id!].map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              </label>
            )}
            {id === "regex" && (
              <label>
                Flags
                <input
                  value={mode}
                  placeholder="g"
                  onChange={(e) => setMode(e.target.value)}
                />
              </label>
            )}
            <button
              className="primary"
              disabled={busy}
              onClick={() => void run()}
            >
              <Play size={16} />
              {busy ? "Processing…" : "Run tool"}
            </button>
          </>
        )}
        {busy && <p role="status">Processing locally…</p>}
        {notice && <p role="status">{notice}</p>}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="panel-head">
          <label htmlFor="output">Result</label>
          <div className="actions">
            <button
              aria-label="Copy result"
              disabled={!hasResult || busy}
              onClick={() =>
                void Promise.resolve()
                  .then(() => navigator.clipboard.writeText(output))
                  .then(() => setNotice("Copied to clipboard."))
                  .catch(() =>
                    setError(
                      "Clipboard unavailable; select and copy the result.",
                    ),
                  )
              }
            >
              <Copy size={16} />
            </button>
            <button
              aria-label="Download result"
              disabled={!hasResult || busy}
              onClick={() => {
                if (compressed) {
                  download(compressed.blob, compressed.name);
                } else if (image) {
                  const a = document.createElement("a");
                  a.href = image;
                  a.download = "qr-code.png";
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                } else download(output, `${id}-result.txt`);
              }}
            >
              <Download size={16} />
            </button>
            <button
              aria-label="Reset"
              onClick={() => {
                job.current++;
                setBusy(false);
                setHasResult(false);
                setNotice("");
                if (fileInput.current) fileInput.current.value = "";
                setInput("");
                setOther("");
                setOutput("");
                setImage("");
                setCompressed(null);
                setError("");
              }}
            >
              <RotateCcw size={16} />
            </button>
          </div>
        </div>
        {image && <img className="qr" src={image} alt="Generated QR code" />}
        <textarea
          id="output"
          readOnly
          value={output}
          placeholder="Your result will appear here"
        />
      </div>
    </section>
  );
}
