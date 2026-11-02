import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  characterSets,
  fictionalProfiles,
  passphraseBatch,
  passwordBatch,
  profilesCsv,
  usernames,
} from "./generators";
import { tools } from "./catalog";

export default function GeneratorTools() {
  const { id } = useParams();
  const tool = tools.find((t) => t.id === id)!;
  const [length, setLength] = useState(id === "password" ? 20 : 12),
    [count, setCount] = useState(1),
    [mode, setMode] = useState("password"),
    [words, setWords] = useState(6),
    [separator, setSeparator] = useState("-"),
    [sets, setSets] = useState<(keyof typeof characterSets)[]>([
      "upper",
      "lower",
      "digits",
      "symbols",
    ]),
    [custom, setCustom] = useState(""),
    [ambiguous, setAmbiguous] = useState(false),
    [theme, setTheme] = useState<"random" | "aesthetic" | "gaming" | "nature">(
      "random",
    ),
    [format, setFormat] = useState<"mixed" | "lower" | "underscore">("mixed"),
    [prefix, setPrefix] = useState(""),
    [domain, setDomain] = useState("example.com"),
    [template, setTemplate] = useState("{first}.{last}.{n}"),
    [output, setOutput] = useState(""),
    [csv, setCsv] = useState(""),
    [bits, setBits] = useState<number | null>(null),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function generate() {
    setNotice("");
    setOutput("");
    setCsv("");
    setBits(null);
    setBusy(true);
    try {
      if (id === "password") {
        const result =
          mode === "passphrase"
            ? await passphraseBatch(words, count, separator)
            : passwordBatch({
                length,
                count,
                sets,
                custom,
                excludeAmbiguous: ambiguous,
              });
        setOutput(result.values.join("\n"));
        setBits(result.entropyBits);
      } else if (id === "roblox-usernames")
        setOutput(
          usernames({ length, count, theme, format, prefix }).join("\n"),
        );
      else {
        const profiles = fictionalProfiles({ count, domain, format: template });
        setOutput(JSON.stringify(profiles, null, 2));
        setCsv(profilesCsv(profiles));
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setBusy(false);
    }
  }
  function download(text: string, extension: string) {
    const url = URL.createObjectURL(
      new Blob([text], {
        type:
          extension === "json"
            ? "application/json"
            : "text/plain;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `randomtools-${id}.${extension}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section className="text-page generator-page">
      <p className="eyebrow">FREE · RUNS IN YOUR BROWSER</p>
      <h1>{tool.name}</h1>
      <p>{tool.description}</p>
      {id === "password" && (
        <p>
          Results stay in this tab. They are never sent to RandomTools, saved as
          history or included in analytics. Clear them when finished; copied
          text remains on your clipboard.
        </p>
      )}
      {id === "roblox-usernames" && (
        <p>
          Ideas only: availability and moderation eligibility are not checked.
          Roblox requires 3–20 letters/numbers and at most one internal
          underscore. No accounts are created.
        </p>
      )}
      {id === "test-identities" && (
        <p>
          Fictional test data only. Reserved email domains do not provision
          inboxes. Do not use these identities to impersonate people.
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void generate();
        }}
        className="generator-form"
      >
        {id === "password" && (
          <>
            <label>
              Generation mode
              <select
                value={mode}
                onChange={(e) => {
                  setMode(e.target.value);
                  setOutput("");
                  setBits(null);
                }}
              >
                <option value="password">Random password</option>
                <option value="passphrase">Random passphrase</option>
              </select>
            </label>
            {mode === "password" ? (
              <>
                <label>
                  Password length (8–128)
                  <input
                    type="number"
                    min="8"
                    max="128"
                    value={length}
                    onChange={(e) => setLength(+e.target.value)}
                  />
                </label>
                <fieldset>
                  <legend>
                    Character sets (ignored when using a custom alphabet)
                  </legend>
                  {(
                    Object.keys(characterSets) as (keyof typeof characterSets)[]
                  ).map((s) => (
                    <label key={s} className="check">
                      <input
                        type="checkbox"
                        checked={sets.includes(s)}
                        onChange={(e) =>
                          setSets(
                            e.target.checked
                              ? [...sets, s]
                              : sets.filter((x) => x !== s),
                          )
                        }
                      />
                      {s}
                    </label>
                  ))}
                </fieldset>
                <label>
                  Custom alphabet (optional)
                  <input
                    value={custom}
                    maxLength={256}
                    autoComplete="off"
                    onChange={(e) => setCustom(e.target.value)}
                  />
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={ambiguous}
                    onChange={(e) => setAmbiguous(e.target.checked)}
                  />
                  Exclude ambiguous I, l, 1, O, 0, o
                </label>
              </>
            ) : (
              <>
                <label>
                  Words (4–12)
                  <input
                    type="number"
                    min="4"
                    max="12"
                    value={words}
                    onChange={(e) => setWords(+e.target.value)}
                  />
                </label>
                <label>
                  Word separator
                  <select
                    value={separator}
                    onChange={(e) => setSeparator(e.target.value)}
                  >
                    <option value="-">Hyphen</option>
                    <option value=" ">Space</option>
                    <option value="_">Underscore</option>
                    <option value=".">Dot</option>
                  </select>
                </label>
                <p>
                  Uniformly selected from the 7,776-word{" "}
                  <a
                    href="https://www.eff.org/dice"
                    target="_blank"
                    rel="noreferrer"
                  >
                    EFF long word list
                  </a>
                  .
                </p>
              </>
            )}
          </>
        )}
        {id === "roblox-usernames" && (
          <>
            <label>
              Username length (3–20)
              <input
                type="number"
                min="3"
                max="20"
                value={length}
                onChange={(e) => setLength(+e.target.value)}
              />
            </label>
            <label>
              Theme
              <select
                value={theme}
                onChange={(e) => setTheme(e.target.value as typeof theme)}
              >
                {["random", "aesthetic", "gaming", "nature"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Format
              <select
                aria-label="Format"
                value={format}
                onChange={(e) => setFormat(e.target.value as typeof format)}
              >
                {["mixed", "lower", "underscore"].map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              Prefix (optional)
              <input
                value={prefix}
                maxLength={11}
                onChange={(e) => setPrefix(e.target.value)}
              />
            </label>
          </>
        )}
        {id === "test-identities" && (
          <>
            <label>
              Reserved email domain
              <input
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                maxLength={100}
              />
            </label>
            <label>
              Email format
              <input
                value={template}
                onChange={(e) => setTemplate(e.target.value)}
                maxLength={80}
              />
            </label>
            <p>
              Placeholders: {"{first}, {last}, {n}, {username}"}. Include{" "}
              {"{n}"} for distinct addresses within a batch.
            </p>
          </>
        )}
        <label>
          How many?
          <input
            type="number"
            min="1"
            max={id === "password" ? 50 : 100}
            value={count}
            onChange={(e) => setCount(+e.target.value)}
          />
        </label>
        <button className="primary" disabled={busy}>
          {busy ? "Generating…" : "Generate"}
        </button>
      </form>
      <p role="status" aria-live="polite">
        {notice}
      </p>
      {output && (
        <div className="generator-result">
          <label>
            Generated result
            <textarea
              readOnly
              value={output}
              rows={Math.min(16, count + 4)}
              spellCheck={false}
              autoComplete="off"
            />
          </label>
          {bits !== null && (
            <p>
              Ideal random generation entropy: {bits.toFixed(1)} bits per
              result. This estimates the generation space, not real-world
              account security or cracking time.
            </p>
          )}
          <div className="actions">
            <button
              onClick={() => {
                void navigator.clipboard.writeText(output).then(
                  () =>
                    setNotice("Copied. Clear your clipboard when finished."),
                  () =>
                    setNotice(
                      "Clipboard unavailable. Select and copy the result manually.",
                    ),
                );
              }}
            >
              Copy results
            </button>
            <button
              onClick={() =>
                download(output, id === "test-identities" ? "json" : "txt")
              }
            >
              Download {id === "test-identities" ? "JSON" : "TXT"}
            </button>
            {csv && (
              <button onClick={() => download(csv, "csv")}>Download CSV</button>
            )}
            <button
              onClick={() => {
                setOutput("");
                setCsv("");
                setBits(null);
                setNotice("Results cleared from this page.");
              }}
            >
              Clear results
            </button>
          </div>
          {id === "roblox-usernames" && (
            <p>
              <a
                href="https://www.roblox.com/search/users"
                target="_blank"
                rel="noreferrer"
              >
                Open Roblox people search manually
              </a>
              . Search results do not guarantee username availability.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
