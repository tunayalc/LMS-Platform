export type AppMode = "local" | "docker";
export type Runtime =
    | "web"
    | "server"
    | "desktop"
    | "mobile-android"
    | "mobile-android-emulator"
    | "mobile-android-device"
    | "mobile-ios";
export type EnvLike = Record<string, string | undefined>;

// Desktop doesn't have process.env like Node, use window or hardcoded defaults
const getDefaultEnv = (): EnvLike => {
    // In Electron main process, we have access to process.env
    // In renderer, we need to use a different approach
    if (typeof window !== 'undefined' && (window as any).__LMS_ENV__) {
        return (window as any).__LMS_ENV__;
    }

    // Fallback to hardcoded local development URLs
    return {
        LMS_MODE: 'local',
        LMS_API_BASE_URL_LOCAL: 'http://localhost:4000',
        LMS_API_BASE_URL_DOCKER: 'http://localhost:4000',
    };
};

const requireEnv = (env: EnvLike, key: string) => {
    const raw = env[key];
    const value = raw
        ? String(raw)
            .trim()
            .replace(/^['"]|['"]$/g, "")
            .replace(/[\u0000-\u001F\u007F]/g, "")
        : "";
    if (!value) {
        console.warn(`[shared] Missing ${key}, using fallback.`);
        return 'http://localhost:4000';
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
    const env = options.env ?? getDefaultEnv();
    const mode = options.mode ?? (env.LMS_MODE as AppMode | undefined) ?? 'local';

    if (mode === "docker") {
        return requireEnv(env, "LMS_API_BASE_URL_DOCKER");
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
    const env = options.env ?? getDefaultEnv();
    const mode = options.mode ?? (env.LMS_MODE as AppMode | undefined) ?? 'local';

    if (mode === "docker") {
        return env.LMS_OMR_BASE_URL_DOCKER ?? 'http://localhost:5001';
    }

    return env.LMS_OMR_BASE_URL_LOCAL ?? 'http://localhost:5001';
}
