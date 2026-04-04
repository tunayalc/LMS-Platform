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
  answerKey?: Record<string, string> | null;
  threshold?: number;
  xOffset?: number;
  yOffset?: number;
  debug?: boolean;
  smartAlign?: boolean;
  skipWarp?: boolean;
  manualCorners?: number[][] | null;
}): Promise<OmrScanResponse> {
  const form = new FormData();
  const fileName = options.name ?? "scan.jpg";
  const contentType = options.mimeType ?? "image/jpeg";

  form.append("file", {
    uri: options.uri,
    name: fileName,
    type: contentType
  } as unknown as Blob);

  if (options.answerKey) {
    form.append("answerKey", JSON.stringify(options.answerKey));
  }
  if (typeof options.threshold === "number") {
    form.append("threshold", String(options.threshold));
  }
  if (typeof options.xOffset === "number") {
    form.append("xOffset", String(options.xOffset));
  }
  if (typeof options.yOffset === "number") {
    form.append("yOffset", String(options.yOffset));
  }
  if (typeof options.debug === "boolean") {
    form.append("debug", options.debug ? "true" : "false");
  }
  if (typeof options.smartAlign === "boolean") {
    form.append("smartAlign", options.smartAlign ? "true" : "false");
  }
  if (typeof options.skipWarp === "boolean") {
    form.append("skipWarp", options.skipWarp ? "true" : "false");
  }
  if (options.manualCorners && Array.isArray(options.manualCorners)) {
    form.append("manualCorners", JSON.stringify(options.manualCorners));
  }

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
