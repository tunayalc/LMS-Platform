import Constants from "expo-constants";
import { Platform } from "react-native";

export type MobileEnv = Record<string, string>;

const isProbablyTunnelHost = (host: string) => {
  const h = host.toLowerCase();
  return (
    h.endsWith(".exp.direct") ||
    h.endsWith(".exp.host") ||
    h.includes("ngrok") ||
    h.includes("cloudflare") ||
    h.includes("tunnel")
  );
};

const inferDevHost = (): string | null => {
  const hostUri =
    (Constants.expoConfig as any)?.hostUri ||
    (Constants as any)?.expoConfig?.hostUri ||
    (Constants as any)?.manifest2?.extra?.expoClient?.hostUri ||
    (Constants.manifest as any)?.hostUri;

  if (!hostUri || typeof hostUri !== "string") return null;

  const host = hostUri.split(":")[0]?.trim();
  if (!host) return null;
  if (isProbablyTunnelHost(host)) return null;

  return host;
};

const replaceUrlHost = (rawUrl: string, newHost: string) => {
  const value = String(rawUrl || "").trim();
  if (!value) return value;
  try {
    const url = new URL(value);
    url.hostname = newHost;
    return url.toString().replace(/\/$/, "");
  } catch {
    return value;
  }
};

export const getEnv = (): MobileEnv => {
  const extra =
    Constants.expoConfig?.extra ?? (Constants.manifest as { extra?: unknown } | undefined)?.extra;
  if (!extra) {
    throw new Error(
      "[mobile] Missing Expo extra env. Ensure LMS_ENV_FILE is set when starting Expo."
    );
  }

  const env = { ...(extra as MobileEnv) };

  // If we're running in Expo Go on a real device in local mode, the host IP can change (Wi-Fi switch).
  // Auto-derive the current dev host (from Metro hostUri) and rewrite LOCAL base URLs to that host.
  if (env.LMS_MODE === "local") {
    const host = inferDevHost();
    if (host) {
      const isAndroid = Platform.OS === "android";
      const isDevice = Boolean(Constants.isDevice);

      // Only rewrite when we're on a physical device (simulators/emulators can still use special hosts).
      if (isDevice) {
        // API
        const apiPort = env.LMS_API_PORT || "4000";
        const fallbackApi = `http://${host}:${apiPort}`;

        env.LMS_API_BASE_URL_LOCAL =
          replaceUrlHost(env.LMS_API_BASE_URL_LOCAL || fallbackApi, host) || fallbackApi;
        env.LMS_API_BASE_URL_LOCAL_ANDROID =
          replaceUrlHost(env.LMS_API_BASE_URL_LOCAL_ANDROID || env.LMS_API_BASE_URL_LOCAL, host) ||
          env.LMS_API_BASE_URL_LOCAL;
        env.LMS_API_BASE_URL_LOCAL_IOS =
          replaceUrlHost(env.LMS_API_BASE_URL_LOCAL_IOS || env.LMS_API_BASE_URL_LOCAL, host) ||
          env.LMS_API_BASE_URL_LOCAL;

        // OMR
        const omrPort = env.LMS_OMR_PORT || "3002";
        const fallbackOmr = `http://${host}:${omrPort}`;

        env.LMS_OMR_BASE_URL_LOCAL =
          replaceUrlHost(env.LMS_OMR_BASE_URL_LOCAL || fallbackOmr, host) || fallbackOmr;
        // Keep emulator override when not on device; on device force host IP.
        env.LMS_OMR_BASE_URL_LOCAL_ANDROID = isAndroid
          ? replaceUrlHost(env.LMS_OMR_BASE_URL_LOCAL_ANDROID || env.LMS_OMR_BASE_URL_LOCAL, host) ||
            env.LMS_OMR_BASE_URL_LOCAL
          : env.LMS_OMR_BASE_URL_LOCAL_ANDROID;
        env.LMS_OMR_BASE_URL_LOCAL_IOS =
          replaceUrlHost(env.LMS_OMR_BASE_URL_LOCAL_IOS || env.LMS_OMR_BASE_URL_LOCAL, host) ||
          env.LMS_OMR_BASE_URL_LOCAL;
      }
    }
  }

  return env;
};

export const getRuntime = () => {
  const env = getEnv();
  const override = env.LMS_ANDROID_RUNTIME;
  if (override === "emulator") {
    return "mobile-android-emulator";
  }
  if (override === "device") {
    return "mobile-android-device";
  }
  if (Platform.OS === "android") {
    return Constants.isDevice ? "mobile-android-device" : "mobile-android-emulator";
  }
  return "mobile-ios";
};
