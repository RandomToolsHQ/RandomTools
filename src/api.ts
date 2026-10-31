let tokenProvider: (() => Promise<string | null>) | null = null;
export function setTokenProvider(provider: typeof tokenProvider) {
  tokenProvider = provider;
}
export async function api<T = any>(
  path: string,
  body?: unknown,
  method?: string,
): Promise<T> {
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
  const data = (await response.json()) as { error?: string };
  if (!response.ok) throw Error(data.error || "Request failed");
  return data as T;
}
