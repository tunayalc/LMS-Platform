import { createApiClient, resolveApiBaseUrl } from "../shared";

import { getEnv, getRuntime } from "../config/env";

const env = getEnv();
const runtime = getRuntime();

export const apiBaseUrl = resolveApiBaseUrl({ env, runtime });

// DEBUG: Log the resolved API URL
console.log('[API CLIENT] Mode:', env.LMS_MODE, 'Runtime:', runtime, 'URL:', apiBaseUrl);

export const apiClient = createApiClient({
  baseUrl: apiBaseUrl
});

// Helper function to get auth headers with proper typing
export const getAuthHeaders = async (): Promise<Record<string, string>> => {
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  const token = await AsyncStorage.getItem('auth_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};
