// Device preferences are optional, never an authentication or authorization source.
let unavailable = false;
export function deviceGet(key: string): string | null {
  if (key === "analytics" && unavailable) return null;
  try {
    return localStorage.getItem(key);
  } catch {
    unavailable = true;
    return null;
  }
}
export function deviceSet(key: string, value: string): boolean {
  if (key === "analytics" && unavailable) return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    unavailable = true;
    return false;
  }
}
