let tokenProvider: (() => Promise<string | null>) | null = null;
export function setTokenProvider(provider: typeof tokenProvider) {
  tokenProvider = provider;
}
export async function api<T = any>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
  if (publicToolsOnly) {
    if (path === "/me" && !body && (!method || method === "GET"))
      return { user: null, pro: false } as T;
    if (path === "/tools" && !body && (!method || method === "GET"))
      return { availability: [] } as T;
    throw Error(
      "Accounts and Pro features are restricted to authorized testing.",
    );
  }
  const bearer = await tokenProvider?.();
  const headers: Record<string, string> = {};
  if (body) headers["Content-Type"] = "application/json";
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const response = await fetch("/api" + path, {
    method: method || (body ? "POST" : "GET"),
    headers,
    body: body ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  let data: { error?: string };
  try {
    data = await response.json();
  } catch {
    throw Error(
      response.ok
        ? "The server returned an unreadable response. Please try again."
        : `Service unavailable (${response.status}). Please try again.`,
    );
  }
  if (!response.ok) throw Error(data.error || "Request failed");
  return data as T;
}
import { publicToolsOnly } from "./deployment";
