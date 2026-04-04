import { config as loadEnv, parse as parseEnv } from "dotenv";
import fs from "fs";
import path from "path";

const rootEnvLocal = path.resolve(__dirname, "../../../../.env.local");
const apiEnv = path.resolve(__dirname, "../.env");

// Load root .env.local first (project-level overrides).
loadEnv({ path: rootEnvLocal });

// Then fill missing/empty values from apps/api/.env (stable secrets/config).
// This avoids the common pitfall where generated .env.local contains empty keys
// (e.g. SMTP_USER=) which prevents dotenv from later setting real values.
if (fs.existsSync(apiEnv)) {
  const raw = fs.readFileSync(apiEnv, "utf8");
  const parsed = parseEnv(raw);
  for (const [key, value] of Object.entries(parsed)) {
    const current = process.env[key];
    if (current === undefined || String(current).trim() === "") {
      process.env[key] = value;
    }
  }
}

