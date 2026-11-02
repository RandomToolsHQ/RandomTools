import { tools } from "./catalog";
export function storedTools(key: string): string[] {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(value)
      ? [
          ...new Set(
            value.filter(
              (v: unknown): v is string =>
                typeof v === "string" && tools.some((t) => t.id === v),
            ),
          ),
        ].slice(0, 50)
      : [];
  } catch {
    return [];
  }
}
export function rememberTool(id: string) {
  if (!tools.some((t) => t.id === id)) return;
  try {
    localStorage.setItem(
      "recent-tools",
      JSON.stringify(
        [id, ...storedTools("recent-tools").filter((v) => v !== id)].slice(
          0,
          8,
        ),
      ),
    );
  } catch {
    /* Optional device history must never block a tool. */
  }
}
