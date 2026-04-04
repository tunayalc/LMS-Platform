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
  const value = env[key];
  if (!value) {
    throw new Error(
      `[shared] Missing ${key}. Run scripts/detect_env.ps1 and load the correct env file.`
    );
  }
  return value;
};

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
