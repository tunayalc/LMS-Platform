const path = require("path");
const dotenv = require("dotenv");

const repoRoot = path.resolve(__dirname, "..", "..");
const envFileInput = process.env.LMS_ENV_FILE;
if (!envFileInput) {
  throw new Error("LMS_ENV_FILE is required. Run scripts/detect_env.ps1 to generate env files.");
}
console.log("DEBUG: envFileInput:", envFileInput);
const envFile = path.isAbsolute(envFileInput) ? envFileInput : path.join(repoRoot, envFileInput);

dotenv.config({ path: envFile, override: true });

const requireEnv = (key) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing ${key}. Run scripts/detect_env.ps1 and load the correct env file.`);
  }
  return value;
};

const mode = requireEnv("LMS_MODE");
if (mode !== "local" && mode !== "docker") {
  throw new Error("LMS_MODE must be 'local' or 'docker'.");
}

const webPort = requireEnv("LMS_WEB_PORT");
const apiPort = requireEnv("LMS_API_PORT");
const webBaseUrl = requireEnv("LMS_WEB_BASE_URL");
const authMode = process.env.LMS_AUTH_MODE ?? "mock";
process.env.PORT = webPort;

const envConfig = {
  LMS_MODE: mode,
  LMS_WEB_BASE_URL: webBaseUrl,
  LMS_WEB_API_PROXY: process.env.LMS_WEB_API_PROXY ?? "true",
  LMS_AUTH_MODE: authMode
};

if (mode === "local") {
  envConfig.LMS_API_BASE_URL_LOCAL = requireEnv("LMS_API_BASE_URL_LOCAL");
  envConfig.LMS_API_BASE_URL_LOCAL_ANDROID = requireEnv("LMS_API_BASE_URL_LOCAL_ANDROID");
  envConfig.LMS_API_BASE_URL_LOCAL_IOS = requireEnv("LMS_API_BASE_URL_LOCAL_IOS");
  envConfig.LMS_OMR_BASE_URL_LOCAL = requireEnv("LMS_OMR_BASE_URL_LOCAL");
  envConfig.LMS_OMR_BASE_URL_LOCAL_ANDROID = requireEnv("LMS_OMR_BASE_URL_LOCAL_ANDROID");
  envConfig.LMS_OMR_BASE_URL_LOCAL_IOS = requireEnv("LMS_OMR_BASE_URL_LOCAL_IOS");
}

if (mode === "docker") {
  envConfig.LMS_API_BASE_URL_DOCKER = requireEnv("LMS_API_BASE_URL_DOCKER");
  envConfig.LMS_OMR_BASE_URL_DOCKER = requireEnv("LMS_OMR_BASE_URL_DOCKER");
}

const apiProxyBase =
  mode === "docker"
    ? requireEnv("LMS_API_BASE_URL_DOCKER").replace(/\/$/, "")
    : `http://127.0.0.1:${apiPort}`;

/** @type {import("next").NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  reactStrictMode: true,
  transpilePackages: ["@lms/shared"],
  env: envConfig,
  images: {
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: 'drive.google.com' },
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: '1drv.ms' },
      { protocol: 'https', hostname: 'via.placeholder.com' }
    ],
  },
  async rewrites() {
    return [
      {
        source: "/uploads/:path*",
        destination: `${apiProxyBase}/uploads/:path*`,
      },
      {
        source: "/api/:path*",
        destination: `${apiProxyBase}/:path*`,
      },
    ];
  },
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      encoding: false,
    };
    return config;
  },
};

const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
});

module.exports = withPWA(nextConfig);
