import type { ConfigContext, ExpoConfig } from "expo/config";

type EnvMap = Record<string, string | undefined>;

// EAS Build uses process.env populated from EAS Secrets
// For local dev, ensure LMS_ENV_FILE is set and loaded via expo start
const getEnvFromProcess = (): EnvMap => {
  return {
    LMS_MODE: process.env.LMS_MODE,
    LMS_API_BASE_URL_LOCAL: process.env.LMS_API_BASE_URL_LOCAL,
    LMS_API_BASE_URL_LOCAL_ANDROID: process.env.LMS_API_BASE_URL_LOCAL_ANDROID,
    LMS_API_BASE_URL_LOCAL_IOS: process.env.LMS_API_BASE_URL_LOCAL_IOS,
    LMS_API_BASE_URL_DOCKER: process.env.LMS_API_BASE_URL_DOCKER,
    LMS_OMR_BASE_URL_LOCAL: process.env.LMS_OMR_BASE_URL_LOCAL,
    LMS_OMR_BASE_URL_LOCAL_ANDROID: process.env.LMS_OMR_BASE_URL_LOCAL_ANDROID,
    LMS_OMR_BASE_URL_LOCAL_IOS: process.env.LMS_OMR_BASE_URL_LOCAL_IOS,
    LMS_OMR_BASE_URL_DOCKER: process.env.LMS_OMR_BASE_URL_DOCKER,
    LMS_ANDROID_GOOGLE_SERVICES: process.env.LMS_ANDROID_GOOGLE_SERVICES,
    LMS_AUTH_MODE: process.env.LMS_AUTH_MODE
  };
};

// For local development, try to load from .env.local
const loadLocalEnv = (): EnvMap => {
  try {
    const fs = require("fs");
    const path = require("path");
    const repoRoot = path.resolve(__dirname, "..", "..");
    const envPath = process.env.LMS_ENV_FILE
      ? (path.isAbsolute(process.env.LMS_ENV_FILE)
        ? process.env.LMS_ENV_FILE
        : path.join(repoRoot, process.env.LMS_ENV_FILE))
      : path.join(repoRoot, ".env.local");

    if (!fs.existsSync(envPath)) {
      console.log(`[app.config] No local env file at ${envPath}, using process.env`);
      return {};
    }

    const content = fs.readFileSync(envPath, "utf8");
    const env: EnvMap = {};
    content.split(/\r?\n/).forEach((line: string) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const idx = trimmed.indexOf("=");
      if (idx < 1) return;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim().replace(/^"|"$/g, "");
      env[key] = value;
    });
    return env;
  } catch (e) {
    console.log("[app.config] Could not load local env, using process.env");
    return {};
  }
};

const pickLmsEnv = (env: EnvMap) => {
  return Object.fromEntries(
    Object.entries(env).filter(([key, val]) => key.startsWith("LMS_") && val)
  );
};

export default ({ config }: ConfigContext): ExpoConfig => {
  // Merge: process.env (EAS) + local file (dev)
  const localEnv = loadLocalEnv();
  const processEnv = getEnvFromProcess();
  const env = { ...processEnv, ...localEnv };

  const name = config.name ?? "LMS Mobile";
  const slug = config.slug ?? "lms-mobile";

  // Google Services (optional)
  let hasGoogleServices = false;
  try {
    const fs = require("fs");
    const path = require("path");
    const googleServicesPath = path.join(__dirname, "google-services.json");
    hasGoogleServices = env.LMS_ANDROID_GOOGLE_SERVICES === "true" && fs.existsSync(googleServicesPath);
  } catch { }

  return {
    ...config,
    name,
    slug,
    ios: {
      ...config.ios,
      infoPlist: {
        ...(config.ios as any)?.infoPlist,
        NSCameraUsageDescription: "Kamera izni gerekiyor.",
        NSMicrophoneUsageDescription: "Mikrofon izni gerekiyor.",
      },
    },
    android: {
      ...config.android,
      ...(hasGoogleServices ? { googleServicesFile: "./google-services.json" } : {})
    },
    // EAS sometimes evaluates app config before installing node_modules, so module plugins can fail to resolve.
    // We don't rely on config-plugins for runtime behavior; permissions are set via ios.infoPlist + android.permissions.
    plugins: [],
    extra: {
      ...config.extra,
      ...pickLmsEnv(env)
    }
  };
};
