export type ApiClientOptions = {
    baseUrl: string;
    headers?: Record<string, string>;
    timeoutMs?: number;
};

type RequestOptions = {
    headers?: Record<string, string>;
    body?: unknown;
    params?: Record<string, any>;
    timeoutMs?: number;
};

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(value);

const joinUrl = (baseUrl: string, path: string, params?: Record<string, any>) => {
    if (!baseUrl || !baseUrl.trim()) {
        throw new Error("API base URL is missing.");
    }
  let base = baseUrl
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\uFEFF/g, "")
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .replace(/\/$/, "");
    if (base && !base.startsWith("/") && !isAbsoluteUrl(base)) {
        base = `http://${base}`;
    }
    const next = path.startsWith("/") ? path : `/${path}`;
    const merged = base ? `${base}${next}` : next;
    const query = params
        ? new URLSearchParams(
            Object.entries(params)
                .filter(([, value]) => value !== undefined && value !== null)
                .map(([key, value]) => [key, String(value)])
        ).toString()
        : "";

    if (!query) {
        return merged;
    }
    return merged.includes("?") ? `${merged}&${query}` : `${merged}?${query}`;
};

async function request<T>(
    method: string,
    baseUrl: string,
    path: string,
    options: RequestOptions = {},
    defaultTimeoutMs = 10000
): Promise<T> {
    const url = joinUrl(baseUrl, path, options.params);
    const isFormData =
        typeof FormData !== "undefined" &&
        options.body != null &&
        typeof options.body === "object" &&
        typeof (options.body as FormData).append === "function" &&
        (options.body instanceof FormData || "_parts" in (options.body as Record<string, unknown>));
    const isBinary =
        options.body != null &&
        typeof options.body === "object" &&
        ((typeof Blob !== "undefined" && options.body instanceof Blob) ||
            (typeof File !== "undefined" && options.body instanceof File));
    const headers: Record<string, string> = {
        ...options.headers
    };
    if (isFormData || isBinary) {
        delete headers["Content-Type"];
        delete headers["content-type"];
    } else {
        headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
    }
    const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
    const controller = typeof AbortController !== "undefined" ? new AbortController() : undefined;
    const timeoutId = controller ? setTimeout(() => controller.abort(), timeoutMs) : undefined;

    try {
        const body = options.body
            ? isFormData || isBinary
                ? (options.body as BodyInit)
                : JSON.stringify(options.body)
            : undefined;
        const response = await fetch(url, {
            method,
            headers,
            body,
            signal: controller?.signal
        });

        if (!response.ok) {
            const text = await response.text();
            let data: unknown = undefined;
            if (text) {
                try {
                    data = JSON.parse(text);
                } catch {
                    data = undefined;
                }
            }
            const messageFromPayload =
                data && typeof data === "object" && "message" in data
                    ? String((data as { message?: unknown }).message ?? "")
                    : "";
            const message = messageFromPayload || text || `Request failed (${response.status})`;
            throw new Error(message);
        }

        if (response.status === 204) {
            return undefined as T;
        }
        const contentLength = response.headers.get("content-length");
        if (contentLength === "0") {
            return undefined as T;
        }
        const contentType = response.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) {
            const text = await response.text();
            return (text as unknown) as T;
        }
        const text = await response.text();
        if (!text) {
            return undefined as T;
        }
        return JSON.parse(text) as T;
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
