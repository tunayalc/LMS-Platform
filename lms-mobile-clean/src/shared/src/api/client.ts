export type ApiClientOptions = {
  baseUrl: string | (() => string);
  headers?: Record<string, string>;
  timeoutMs?: number;
};

type RequestOptions = {
  headers?: Record<string, string>;
  body?: unknown;
  params?: Record<string, any>;
  timeoutMs?: number;
};

const joinUrl = (baseUrl: string, path: string, params?: Record<string, any>) => {
  const base = baseUrl.replace(/\/$/, "");
  const next = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${base}${next}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        url.searchParams.append(key, String(value));
      }
    });
  }
  return url.toString();
};

async function request<T>(
  method: string,
  baseUrl: string | (() => string),
  path: string,
  options: RequestOptions = {},
  defaultTimeoutMs = 10000
): Promise<T> {
  const resolvedBaseUrl = typeof baseUrl === "function" ? baseUrl() : baseUrl;
  const url = joinUrl(resolvedBaseUrl, path, options.params);
  const headers = {
    "Content-Type": "application/json",
    ...options.headers
  };
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined;
  const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller?.signal
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Request failed (${response.status}): ${text}`);
    }

    return response.json() as Promise<T>;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Request timeout after ${timeoutMs}ms`);
    }
    throw error;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

export function createApiClient(options: ApiClientOptions) {
  const defaultTimeoutMs = options.timeoutMs ?? 10000;
  return {
    get: <T>(path: string, opts?: RequestOptions) =>
      request<T>("GET", options.baseUrl, path, opts, defaultTimeoutMs),
    post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
      request<T>("POST", options.baseUrl, path, { ...opts, body }, defaultTimeoutMs),
    patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
      request<T>("PATCH", options.baseUrl, path, { ...opts, body }, defaultTimeoutMs),
    del: <T>(path: string, opts?: RequestOptions) =>
      request<T>("DELETE", options.baseUrl, path, opts, defaultTimeoutMs)
  };
}
