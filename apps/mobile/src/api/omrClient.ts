import { resolveOmrBaseUrl } from "../shared";

import { getEnv, getRuntime } from "../config/env";

const env = getEnv();
const runtime = getRuntime();

export const omrBaseUrl = resolveOmrBaseUrl({ env, runtime });

const joinUrl = (baseUrl: string, path: string) => {
  const base = baseUrl.replace(/\/$/, "");
  const next = path.startsWith("/") ? path : `/${path}`;
  return `${base}${next}`;
};

export type OmrScanResult = {
  dimensions?: { width: number; height: number };
  bubbles?: unknown[];
  warnings?: string[];
};

export type OmrScanResponse = {
  ok: boolean;
  result: OmrScanResult;
};

export async function uploadOmrScan(options: {
  uri: string;
  mimeType?: string | null;
  name?: string;
}): Promise<OmrScanResponse> {
  const form = new FormData();
  const fileName = options.name ?? "scan.jpg";
  const contentType = options.mimeType ?? "image/jpeg";

  form.append("file", {
    uri: options.uri,
    name: fileName,
    type: contentType
  } as unknown as Blob);

  const response = await fetch(joinUrl(omrBaseUrl, "/scan"), {
    method: "POST",
    body: form,
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OMR upload failed (${response.status}): ${text}`);
  }

  return response.json() as Promise<OmrScanResponse>;
}
