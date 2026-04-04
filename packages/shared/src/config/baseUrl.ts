export type AppMode = "local" | "docker";
export type Runtime =
  | "web"
  | "server"
  | "mobile-android"
  | "mobile-android-emulator"
  | "mobile-android-device"
  | "mobile-ios";
export type EnvLike = Record<string, string | undefined>;

const defaultEnv: EnvLike =
  typeof process !== "undefined"
    ? {
        LMS_MODE: process.env.LMS_MODE,
        LMS_WEB_API_PROXY: process.env.LMS_WEB_API_PROXY,
        LMS_API_BASE_URL_LOCAL: process.env.LMS_API_BASE_URL_LOCAL,
        LMS_API_BASE_URL_LOCAL_ANDROID: process.env.LMS_API_BASE_URL_LOCAL_ANDROID,
        LMS_API_BASE_URL_LOCAL_IOS: process.env.LMS_API_BASE_URL_LOCAL_IOS,
        LMS_API_BASE_URL_DOCKER: process.env.LMS_API_BASE_URL_DOCKER,
        LMS_OMR_BASE_URL_LOCAL: process.env.LMS_OMR_BASE_URL_LOCAL,
        LMS_OMR_BASE_URL_LOCAL_ANDROID: process.env.LMS_OMR_BASE_URL_LOCAL_ANDROID,
        LMS_OMR_BASE_URL_LOCAL_IOS: process.env.LMS_OMR_BASE_URL_LOCAL_IOS,
        LMS_OMR_BASE_URL_DOCKER: process.env.LMS_OMR_BASE_URL_DOCKER
      }
    : {};

const requireEnv = (env: EnvLike, key: string) => {
  const raw = env[key];
  const value = raw
    ? String(raw)
        .trim()
        .replace(/^['"]|['"]$/g, "")
        .replace(/\uFEFF/g, "")
        .replace(/[\u0000-\u001F\u007F]/g, "")
    : "";
  if (!value) {
    throw new Error(
      `[shared] Missing ${key}. Run scripts/detect_env.ps1 and load the correct env file.`
    );
  }
  return value;
};

const isWebProxyEnabled = (env: EnvLike) => env.LMS_WEB_API_PROXY !== "false";

export function resolveApiBaseUrl(
  options: {
    mode?: AppMode;
    runtime?: Runtime;
    env?: EnvLike;
  } = {}
): string {
  const env = options.env ?? defaultEnv;
  const mode = options.mode ?? (env.LMS_MODE as AppMode | undefined);
  if (mode !== "local" && mode !== "docker") {
    throw new Error("[shared] LMS_MODE must be 'local' or 'docker'.");
  }

  if (mode === "docker") {
    return requireEnv(env, "LMS_API_BASE_URL_DOCKER");
  }

  const runtime = options.runtime ?? "web";
  if (runtime === "web" && typeof window !== "undefined" && isWebProxyEnabled(env)) {
    const origin = window.location.origin.replace(/\/$/, "");
    return `${origin}/api`;
  }
  if (runtime === "web" && isWebProxyEnabled(env)) {
    return "/api";
  }
  if (runtime === "mobile-android-device") {
    return requireEnv(env, "LMS_API_BASE_URL_LOCAL");
  }
  if (runtime === "mobile-android" || runtime === "mobile-android-emulator") {
    return requireEnv(env, "LMS_API_BASE_URL_LOCAL_ANDROID");
  }
  if (runtime === "mobile-ios") {
    return requireEnv(env, "LMS_API_BASE_URL_LOCAL_IOS");
  }

  return requireEnv(env, "LMS_API_BASE_URL_LOCAL");
}

export function resolveOmrBaseUrl(
  options: {
    mode?: AppMode;
    runtime?: Runtime;
    env?: EnvLike;
  } = {}
): string {
  const env = options.env ?? defaultEnv;
  const mode = options.mode ?? (env.LMS_MODE as AppMode | undefined);
  if (mode !== "local" && mode !== "docker") {
    throw new Error("[shared] LMS_MODE must be 'local' or 'docker'.");
  }

  if (mode === "docker") {
    return requireEnv(env, "LMS_OMR_BASE_URL_DOCKER");
  }

  const runtime = options.runtime ?? "web";
  if (runtime === "mobile-android-device") {
    return requireEnv(env, "LMS_OMR_BASE_URL_LOCAL");
  }
  if (runtime === "mobile-android" || runtime === "mobile-android-emulator") {
    return requireEnv(env, "LMS_OMR_BASE_URL_LOCAL_ANDROID");
  }
  if (runtime === "mobile-ios") {
    return requireEnv(env, "LMS_OMR_BASE_URL_LOCAL_IOS");
  }

  return requireEnv(env, "LMS_OMR_BASE_URL_LOCAL");
}
