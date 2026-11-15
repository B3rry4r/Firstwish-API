/** Small JSON-over-HTTPS helper for provider adapters. Errors carry the provider name and status, never the request body. */
export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly status: number,
    message: string,
  ) {
    super(`${provider} answered ${status}: ${message}`);
    this.name = "ProviderError";
  }
}

export async function postJson<T>(provider: string, url: string, headers: Record<string, string>, body: unknown): Promise<T> {
  return requestJson<T>(provider, url, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
}

export async function getJson<T>(provider: string, url: string, headers: Record<string, string>): Promise<T> {
  return requestJson<T>(provider, url, { method: "GET", headers });
}

async function requestJson<T>(provider: string, url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  const text = await res.text();
  if (!res.ok) throw new ProviderError(provider, res.status, text.slice(0, 300));
  return (text ? JSON.parse(text) : {}) as T;
}
