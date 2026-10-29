import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";
import { createApp } from "./app.js";
import { createSupabaseUserVerifier } from "./auth.js";
import { logError, logInfo, logWarn } from "./log.js";
import { createFileStorage, createUsageTracker } from "./usage.js";

// Production safety lock. AI usage and spending totals must survive restarts and deployments, and the
// only storage implemented so far is a local file, which many hosting platforms wipe on every deploy.
// So the server refuses to run in production until a verified persistent store is added (see README).
if (process.env.NODE_ENV === "production") {
  logError("startup refused", { code: "no_persistent_usage_store" });
  logWarn(
    "[server] The local usage file is for development only and can't guarantee that AI spending limits " +
      "survive deployments. Configure a verified persistent usage store before running in production."
  );
  process.exit(1);
}

const PORT = process.env.PORT || 4000;
// Loopback only by default, so the backend (and the OpenAI key behind it) isn't reachable from
// other devices on the local network. Set HOST (e.g. 0.0.0.0) only where that's intended.
const HOST = process.env.HOST || "127.0.0.1";
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";

// Only construct the client when a key is present so a missing key doesn't
// crash the server at startup; each endpoint reports a clear error instead.
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

if (!openai) {
  logWarn(
    "[server] Warning: OPENAI_API_KEY is not set. Add it to server/.env before calling /api/coach."
  );
}

// The same public values the browser uses (project URL + publishable key) — enough to ask Supabase
// Auth who a session token belongs to. No service-role key is needed or used. Without them the
// protected endpoints refuse every request (503) rather than run unauthenticated.
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
const verifyUser =
  SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY
    ? createSupabaseUserVerifier({ supabaseUrl: SUPABASE_URL, supabaseKey: SUPABASE_PUBLISHABLE_KEY })
    : null;

if (!verifyUser) {
  logWarn(
    "[server] Warning: SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY are not set in server/.env. " +
      "AI and PDF endpoints will refuse all requests until they are."
  );
}

// Development usage tracking: a JSON file (app-wide totals and per-user daily counts keyed by a
// one-way hash of the account id — no personal or health data). Create it once with
// `npm run usage:init`. If it's missing, corrupt, or can't be written, AI requests are refused.
const USAGE_FILE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  process.env.USAGE_FILE || "data/usage.json"
);
const usageTracker = createUsageTracker({ storage: createFileStorage(USAGE_FILE) });
const usageStatus = await usageTracker.load();
if (!usageStatus.healthy) {
  logWarn(
    `[server] Warning: AI usage tracking is unavailable (${usageStatus.problem}), so AI features are ` +
      "blocked. If this is a new setup, run `npm run usage:init` in server/ once."
  );
}

const app = createApp({ openai, clientOrigin: CLIENT_ORIGIN, verifyUser, usageTracker });

app.listen(PORT, HOST, () => {
  logInfo(`[server] AI Health Coach backend running on http://${HOST}:${PORT}`);
});
