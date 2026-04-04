import Constants from "expo-constants";
import { Platform } from "react-native";

export type MobileEnv = Record<string, string>;

export const getEnv = (): MobileEnv => {
  const extra =
    Constants.expoConfig?.extra ?? (Constants.manifest as { extra?: unknown } | undefined)?.extra;
  if (!extra) {
    throw new Error(
      "[mobile] Missing Expo extra env. Ensure LMS_ENV_FILE is set when starting Expo."
    );
  }
  return extra as MobileEnv;
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
