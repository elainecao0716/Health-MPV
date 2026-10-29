import "dotenv/config";
import OpenAI from "openai";
import { createApp } from "./app.js";
import { createSupabaseUserVerifier } from "./auth.js";

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
  console.warn(
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
  console.warn(
    "[server] Warning: SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY are not set in server/.env. " +
      "AI and PDF endpoints will refuse all requests until they are."
  );
}

const app = createApp({ openai, clientOrigin: CLIENT_ORIGIN, verifyUser });

app.listen(PORT, HOST, () => {
  console.log(`[server] AI Health Coach backend running on http://${HOST}:${PORT}`);
});
