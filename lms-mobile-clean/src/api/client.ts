import AsyncStorage from "@react-native-async-storage/async-storage";

import { createApiClient, resolveApiBaseUrl } from "../shared";

import { getEnv, getRuntime } from "../config/env";

const env = getEnv();
const runtime = getRuntime();

// Default URL from environment
const defaultBaseUrl = resolveApiBaseUrl({ env, runtime });

// Mutable state for current URL
let currentBaseUrl = defaultBaseUrl;

// Key for AsyncStorage
const STORAGE_KEY = "LMS_SERVER_URL";

/**
 * Updates the current base URL and persists it to storage.
 */
export const setApiBaseUrl = async (url: string) => {
  if (!url) return;
  try {
    const trimmed = url.trim();
    // Normalize URL (ensure scheme + remove trailing slash)
    const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
    const normalizedUrl = withScheme.replace(/\/$/, "");
    currentBaseUrl = normalizedUrl;
    await AsyncStorage.setItem(STORAGE_KEY, normalizedUrl);
    console.log("[api] Updated server URL:", normalizedUrl);
  } catch (error) {
    console.error("[api] Failed to save server URL:", error);
  }
};

/**
 * Loads the saved base URL from storage on startup.
 */
export const loadServerUrl = async () => {
  try {
    const savedUrl = await AsyncStorage.getItem(STORAGE_KEY);
    if (savedUrl) {
      const trimmed = savedUrl.trim();
      const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
      const normalizedUrl = withScheme.replace(/\/$/, "");
      currentBaseUrl = normalizedUrl;
      console.log("[api] Loaded server URL from storage:", normalizedUrl);
    } else {
      console.log("[api] Using default server URL:", defaultBaseUrl);
    }
  } catch (error) {
    console.error("[api] Failed to load server URL:", error);
  }
  return currentBaseUrl;
};

/**
 * Returns the current base URL.
 */
export const getApiBaseUrl = () => currentBaseUrl;

// Initialize client with a getter function for dynamic resolution
export const apiClient = createApiClient({
  baseUrl: () => currentBaseUrl
});
