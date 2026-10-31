self.onmessage = (
  event: MessageEvent<{
    pattern: string;
    flags: string;
    text: string;
    replacement?: string;
  }>,
) => {
  try {
    const { pattern, flags, text, replacement } = event.data;
    if (text.length > 200000 || pattern.length > 5000)
      throw Error("Regex input exceeds workspace limits.");
    const r = new RegExp(pattern, flags);
    const matches = [];
    for (const m of text.matchAll(
      new RegExp(r.source, r.flags.includes("g") ? r.flags : r.flags + "g"),
    )) {
      if (matches.length === 1000) break;
      matches.push({
        match: m[0],
        index: m.index,
        captures: m.slice(1),
        groups: m.groups,
      });
    }
    const result = {
      matches,
      capped: matches.length === 1000,
      ...(replacement !== undefined
        ? { replaced: text.replace(r, replacement) }
        : {}),
    };
    self.postMessage({ result: JSON.stringify(result, null, 2) });
  } catch (e) {
    self.postMessage({ error: String(e) });
  }
};
