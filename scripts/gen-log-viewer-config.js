/**
 * .env의 VITE_FIREBASE_* 값을 읽어 docs/log-viewer-config.js 를 생성합니다.
 * 로그 뷰어 사용 전에 실행: npm run log-viewer:config
 */
import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const envPath = join(root, ".env");
const outPath = join(root, "docs", "log-viewer-config.js");

function parseEnv(content) {
  const env = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (value.startsWith('"') && value.endsWith('"')) env[key] = value.slice(1, -1).replace(/\\"/g, '"');
    else if (value.startsWith("'") && value.endsWith("'")) env[key] = value.slice(1, -1).replace(/\\'/g, "'");
    else env[key] = value;
  }
  return env;
}

const env = parseEnv(readFileSync(envPath, "utf-8"));

const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY || "",
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || "",
  projectId: env.VITE_FIREBASE_PROJECT_ID || "",
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: env.VITE_FIREBASE_APP_ID || "",
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID || "",
};

const js = `// Generated from .env by scripts/gen-log-viewer-config.js — do not edit
window.__FIREBASE_CONFIG__ = ${JSON.stringify(firebaseConfig, null, 2)};
`;

writeFileSync(outPath, js, "utf-8");
console.log("Written:", outPath);
