import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RATE_LIMITS, createApp } from "./app.js";

// Security tests against the real Express routes, built with a fake OpenAI client and a fake
// Supabase token verifier — no network, no OpenAI charges, no real health data.

const CLIENT_ORIGIN = "http://localhost:5173";
const USER_A = "user-a-0000";
const USER_B = "user-b-1111";
const TOKENS = { "token-a": USER_A, "token-b": USER_B };
const PUBLISHABLE_KEY_AS_TOKEN = "sb_publishable_ABCdef123";

const fakeVerifyUser = vi.fn(async (token) => {
  if (token === "token-supabase-down") return { status: "unavailable" };
  if (TOKENS[token]) return { status: "ok", user: { id: TOKENS[token] } };
  return { status: "invalid" }; // expired, revoked, junk, or the publishable key itself
});

const makeOpenai = () => ({
  chat: { completions: { create: vi.fn(async () => ({ choices: [{ message: { content: "AI RESPONSE" } }] })) } },
});

// Rows exactly as the browser sends them (Supabase select "*" includes user_id).
const record = (userId, note = "") => ({ id: `r-${userId}`, user_id: userId, record_date: "2026-10-01", weight: 150, notes: note });
const checkin = (userId) => ({ id: `c-${userId}`, user_id: userId, checkin_date: "2026-10-01", sleep_hours: 7, water_cups: 6, exercise_minutes: 30, mood: "good", notes: "" });
const labRow = (userId, note = "") => ({
  id: `l-${userId}`, user_id: userId, test_date: "2026-10-01", test_name: "Glucose", category: "Metabolic",
  result_value: 100, unit: "mg/dL", reference_low: 65, reference_high: 99, status: "High", lab_name: null, notes: note,
});

// A minimal one-page text PDF with a single lab result line, built in memory.
const buildTestPdf = () => {
  const text = "GLUCOSE 123 mg/dL 65-99 H";
  const stream = `BT /F1 10 Tf 50 700 Td (${text}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [4 0 R] /Count 1 >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents 5 0 R >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((body, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf, "latin1");
};

let server;
let baseUrl;
let openai;
let logs;

const start = async (options = {}) => {
  openai = makeOpenai();
  const app = createApp({ openai, clientOrigin: CLIENT_ORIGIN, verifyUser: fakeVerifyUser, ...options });
  server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
};

const post = (path, { token, body, raw, headers = {} } = {}) => {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  let payload = raw;
  if (body !== undefined) {
    h["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  return fetch(`${baseUrl}${path}`, { method: "POST", headers: h, body: payload });
};

const uploadPdf = (token, buffer = buildTestPdf()) => {
  const form = new FormData();
  form.append("file", new Blob([buffer], { type: "application/pdf" }), "report.pdf");
  return fetch(`${baseUrl}/api/labs/import-pdf`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
};

// A valid request body for each AI endpoint, owned by the given user.
const aiBodies = (userId) => ({
  "/api/coach": { records: [record(userId)], goalWeight: 140, checkins: [checkin(userId)], labResults: [labRow(userId)] },
  "/api/chat": {
    messages: [{ role: "user", content: "How am I doing?" }],
    records: [record(userId)], goalWeight: 140, checkins: [checkin(userId)], labResults: [labRow(userId)],
  },
  "/api/lab-insights": { mode: "all", labResults: [labRow(userId)] },
});
const AI_PATHS = Object.keys(aiBodies(USER_A));
const ALL_PROTECTED = [...AI_PATHS, "/api/labs/import-pdf"];
const callProtected = (path, token) => (path === "/api/labs/import-pdf" ? uploadPdf(token) : post(path, { token, body: aiBodies(TOKENS[token] ?? USER_A)[path] }));

beforeEach(async () => {
  fakeVerifyUser.mockClear();
  logs = [];
  for (const level of ["log", "warn", "error"]) {
    vi.spyOn(console, level).mockImplementation((...args) => logs.push(args.map(String).join(" ")));
  }
  await start();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise((resolve) => server.close(resolve));
});

describe("authentication is required on every protected endpoint", () => {
  it.each(ALL_PROTECTED)("%s: no token → 401, nothing processed, no OpenAI call", async (path) => {
    const res = await (path === "/api/labs/import-pdf" ? uploadPdf(undefined) : post(path, { body: aiBodies(USER_A)[path] }));

    expect(res.status).toBe(401);
    expect((await res.json()).error).toMatch(/sign in again/i);
    expect(fakeVerifyUser).not.toHaveBeenCalled();
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it.each(ALL_PROTECTED)("%s: malformed Authorization header → 401 without contacting Supabase", async (path) => {
    for (const header of ["Basic dXNlcjpwYXNz", "Bearer", "token-a", `Bearer ${"x".repeat(5000)}`]) {
      const res = await post(path, { headers: { Authorization: header }, body: {} });
      expect(res.status).toBe(401);
    }
    expect(fakeVerifyUser).not.toHaveBeenCalled();
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it.each(ALL_PROTECTED)("%s: expired/revoked token → 401", async (path) => {
    const res = await callProtected(path, "token-expired");
    expect(res.status).toBe(401);
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it.each(ALL_PROTECTED)("%s: the public (publishable) key used as a token → 401", async (path) => {
    const res = await callProtected(path, PUBLISHABLE_KEY_AS_TOKEN);
    expect(res.status).toBe(401);
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it.each(ALL_PROTECTED)("%s: Supabase unreachable → 503 (fails closed)", async (path) => {
    const res = await callProtected(path, "token-supabase-down");
    expect(res.status).toBe(503);
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it.each(ALL_PROTECTED)("%s: verification not configured → 503 (fails closed)", async (path) => {
    await new Promise((resolve) => server.close(resolve));
    await start({ verifyUser: null });
    const res = await callProtected(path, "token-a");
    expect(res.status).toBe(503);
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it.each(AI_PATHS)("%s: valid token → 200 with exactly one OpenAI call", async (path) => {
    const res = await callProtected(path, "token-a");
    expect(res.status).toBe(200);
    expect(openai.chat.completions.create).toHaveBeenCalledTimes(1);
  });

  it("/api/labs/import-pdf: valid token → 200 with extracted draft rows (text PDF, no OpenAI)", async () => {
    const res = await uploadPdf("token-a");
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.status).toBe("ok");
    expect(data.draftRows).toHaveLength(1);
    expect(data.draftRows[0]).toMatchObject({ resultValue: 123, unit: "mg/dL", referenceLow: 65, referenceHigh: 99 });
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it("/api/labs/import-pdf: an unauthenticated upload is rejected before the file is read", async () => {
    // An 11 MB upload would normally get the "file too large" error from the upload parser; without
    // a token it never reaches the parser at all.
    const big = Buffer.concat([Buffer.from("%PDF-1.4\n"), Buffer.alloc(11 * 1024 * 1024, 32)]);
    const res = await uploadPdf(undefined, big);
    expect(res.status).toBe(401);
  });

  it("/api/health stays public and exposes nothing but {ok: true}", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("users cannot access, modify, or delete another user's health records", () => {
  it.each([
    ["records", { records: [record(USER_B)], checkins: [], labResults: [] }],
    ["checkins", { records: [], checkins: [checkin(USER_B)], labResults: [] }],
    ["labResults", { records: [], checkins: [], labResults: [labRow(USER_B)] }],
  ])("/api/coach: User A submitting User B's %s → 403, no OpenAI call", async (_name, body) => {
    const res = await post("/api/coach", { token: "token-a", body });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatch(/doesn't belong to your account/);
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it("/api/chat: User A submitting User B's records → 403", async () => {
    const body = { ...aiBodies(USER_A)["/api/chat"], records: [record(USER_A), record(USER_B)] };
    const res = await post("/api/chat", { token: "token-a", body });
    expect(res.status).toBe(403);
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it("/api/lab-insights: User A submitting User B's lab results → 403 (both modes)", async () => {
    for (const body of [
      { mode: "all", labResults: [labRow(USER_B)] },
      { mode: "single", testName: "Glucose", labResults: [labRow(USER_A), labRow(USER_B)] },
    ]) {
      const res = await post("/api/lab-insights", { token: "token-a", body });
      expect(res.status).toBe(403);
    }
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it("rows with no owner, or a forged owner, are rejected", async () => {
    for (const records of [[{ ...record(USER_A), user_id: undefined }], [{ ...record(USER_A), user_id: null }], ["not-a-row"]]) {
      const res = await post("/api/coach", { token: "token-a", body: { records, checkins: [], labResults: [] } });
      expect(res.status).toBe(403);
    }
  });

  it("the same request is accepted for its real owner — ownership, not the data itself, decides", async () => {
    const body = { records: [record(USER_B)], checkins: [checkin(USER_B)], labResults: [labRow(USER_B)] };
    expect((await post("/api/coach", { token: "token-a", body })).status).toBe(403);
    expect((await post("/api/coach", { token: "token-b", body })).status).toBe(200);
  });

  it("only the signed-in user's own data reaches OpenAI", async () => {
    const body = { records: [record(USER_A, "A-PRIVATE-NOTE")], checkins: [], labResults: [labRow(USER_A, "A-LAB-NOTE")] };
    await post("/api/coach", { token: "token-a", body });
    const prompt = JSON.stringify(openai.chat.completions.create.mock.calls[0][0]);
    expect(prompt).toContain("A-PRIVATE-NOTE");
    expect(prompt).not.toContain(USER_B);
    expect(prompt).not.toContain(USER_A); // user ids aren't forwarded to OpenAI either
  });

  it("the API exposes no way to read, change, or delete stored records", async () => {
    const routes = server.listeners("request")[0].router.stack
      .filter((layer) => layer.route)
      .map((layer) => `${Object.keys(layer.route.methods).join(",").toUpperCase()} ${layer.route.path}`)
      .sort();
    expect(routes).toEqual([
      "GET /api/health",
      "POST /api/chat",
      "POST /api/coach",
      "POST /api/lab-insights",
      "POST /api/labs/import-pdf",
    ]);

    for (const [method, path] of [
      ["GET", "/api/records"], ["GET", "/api/lab-results"], ["PUT", "/api/records/1"],
      ["PATCH", "/api/lab-results/1"], ["DELETE", "/api/records/1"], ["DELETE", "/api/coach"], ["GET", "/api/coach"],
    ]) {
      const res = await fetch(`${baseUrl}${path}`, { method, headers: { Authorization: "Bearer token-a" } });
      expect(res.status, `${method} ${path}`).toBe(404);
    }
  });

  it("the server has no database client — it cannot query anyone's records", () => {
    const dir = fileURLToPath(new URL(".", import.meta.url));
    const sources = readdirSync(dir).filter((f) => f.endsWith(".js") && !f.endsWith(".test.js"));
    for (const file of sources) {
      const code = readFileSync(`${dir}/${file}`, "utf-8");
      expect(code, file).not.toMatch(/@supabase\/supabase-js|\/rest\/v1|service_role|SERVICE_ROLE/);
      expect(code, file).not.toMatch(/\.from\(\s*["'`](health_records|daily_checkins|lab_results)/);
    }
  });
});

describe("rate limits (per user)", () => {
  it("uses the approved limits", () => {
    expect(RATE_LIMITS).toEqual({
      ai: { perFifteenMinutes: 30, perDay: 100 },
      pdfImport: { perFifteenMinutes: 10, perDay: 20 },
      failedSignInsPerIp: { perFifteenMinutes: 20 },
    });
  });

  it("AI: 30 requests per 15 minutes per user, shared across all three AI endpoints; other users unaffected", async () => {
    for (let i = 0; i < 30; i += 1) {
      const res = await callProtected(AI_PATHS[i % 3], "token-a");
      expect(res.status).toBe(200);
    }
    const blocked = await callProtected("/api/coach", "token-a");
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toMatch(/wait a few minutes/);

    expect((await callProtected("/api/coach", "token-b")).status).toBe(200);
    expect(openai.chat.completions.create).toHaveBeenCalledTimes(31); // 30 for A + 1 for B; none for the blocked call
  });

  it("AI: 100 requests per day per user", async () => {
    await new Promise((resolve) => server.close(resolve));
    await start({ rateLimits: { ...RATE_LIMITS, ai: { perFifteenMinutes: 1000, perDay: 100 } } });

    for (let i = 0; i < 100; i += 1) expect((await callProtected("/api/coach", "token-a")).status).toBe(200);
    const blocked = await callProtected("/api/coach", "token-a");
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toMatch(/today's limit for AI features/);
    expect((await callProtected("/api/coach", "token-b")).status).toBe(200);
  });

  it("PDF imports: 10 per 15 minutes per user", async () => {
    for (let i = 0; i < 10; i += 1) expect((await uploadPdf("token-a")).status).toBe(200);
    const blocked = await uploadPdf("token-a");
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toMatch(/Too many PDF imports/);
    expect((await uploadPdf("token-b")).status).toBe(200);
  });

  it("PDF imports: 20 per day per user", async () => {
    await new Promise((resolve) => server.close(resolve));
    await start({ rateLimits: { ...RATE_LIMITS, pdfImport: { perFifteenMinutes: 1000, perDay: 20 } } });

    for (let i = 0; i < 20; i += 1) expect((await uploadPdf("token-a")).status).toBe(200);
    const blocked = await uploadPdf("token-a");
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toMatch(/today's limit for PDF imports/);
  });

  it("AI and PDF limits are separate", async () => {
    for (let i = 0; i < 10; i += 1) await uploadPdf("token-a");
    expect((await uploadPdf("token-a")).status).toBe(429);
    expect((await callProtected("/api/coach", "token-a")).status).toBe(200);
  });

  it("unauthenticated requests don't use up a user's allowance", async () => {
    for (let i = 0; i < 15; i += 1) await post("/api/coach", { body: aiBodies(USER_A)["/api/coach"] });
    for (let i = 0; i < 30; i += 1) expect((await callProtected("/api/coach", "token-a")).status).toBe(200);
  });

  it("repeated failed sign-ins from one address are throttled (20 per 15 minutes)", async () => {
    for (let i = 0; i < 20; i += 1) expect((await callProtected("/api/coach", "token-guess")).status).toBe(401);
    expect((await callProtected("/api/coach", "token-guess")).status).toBe(429);
    expect(fakeVerifyUser).toHaveBeenCalledTimes(20); // the 21st attempt never reaches Supabase
  });
});

describe("request validation and error responses", () => {
  const expectNoInternals = (text) => {
    expect(text).not.toMatch(/<!DOCTYPE|<html/i);
    expect(text).not.toMatch(/\/Users\/|node_modules|\.js:\d+|\bat\s+\w+\s*\(/);
  };

  it("malformed JSON → 400 JSON error with no stack trace or file paths", async () => {
    const res = await post("/api/coach", { token: "token-a", raw: '{"records":', headers: { "Content-Type": "application/json" } });
    const text = await res.text();
    expect(res.status).toBe(400);
    expect(JSON.parse(text)).toEqual({ error: "Request body is not valid JSON." });
    expectNoInternals(text);
  });

  it("oversized JSON (>1 MB) → 413 JSON error with no stack trace", async () => {
    const res = await post("/api/coach", { token: "token-a", body: { records: [], pad: "x".repeat(1.1e6) } });
    const text = await res.text();
    expect(res.status).toBe(413);
    expect(JSON.parse(text)).toEqual({ error: "Request body is too large." });
    expectNoInternals(text);
  });

  it("an unauthenticated malformed body is rejected as unauthenticated (never parsed)", async () => {
    const res = await post("/api/coach", { raw: '{"records":', headers: { "Content-Type": "application/json" } });
    expect(res.status).toBe(401);
  });

  it("unknown API routes → 404 JSON", async () => {
    const res = await fetch(`${baseUrl}/api/does-not-exist`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found." });
  });

  it("existing input validation still applies after sign-in", async () => {
    expect((await post("/api/coach", { token: "token-a", body: { records: "x" } })).status).toBe(400);
    expect((await post("/api/lab-insights", { token: "token-a", body: { mode: "x", labResults: [] } })).status).toBe(400);
    expect((await post("/api/chat", { token: "token-a", body: { messages: [{ role: "system", content: "x" }], records: [] } })).status).toBe(400);
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });
});

describe("secrets and logs", () => {
  it("tokens and health values never appear in server logs", async () => {
    await callProtected("/api/coach", "token-a");
    await callProtected("/api/chat", "token-a");
    await callProtected("/api/coach", "token-expired");
    await post("/api/coach", { headers: { Authorization: "Bearer secret-junk-token" }, body: {} });

    const all = logs.join("\n");
    expect(logs.length).toBeGreaterThan(0);
    for (const secret of ["token-a", "token-expired", "secret-junk-token", USER_A, "140"]) {
      expect(all).not.toContain(secret);
    }
    expect(all).toMatch(/goal: set/);
  });

  it("responses never echo the Authorization header or the user's id", async () => {
    const res = await callProtected("/api/lab-insights", "token-a");
    const text = await res.text();
    expect(text).not.toContain("token-a");
    expect(text).not.toContain(USER_A);
  });
});

describe("CORS", () => {
  const preflight = (origin) =>
    fetch(`${baseUrl}/api/coach`, {
      method: "OPTIONS",
      headers: { Origin: origin, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "authorization,content-type" },
    });

  it("allows the app's own origin to send the Authorization header", async () => {
    const res = await preflight(CLIENT_ORIGIN);
    expect(res.headers.get("access-control-allow-origin")).toBe(CLIENT_ORIGIN);
    expect(res.headers.get("access-control-allow-headers")).toMatch(/authorization/i);
  });

  it("does not grant any other origin access", async () => {
    const res = await preflight("https://evil.example");
    expect(res.headers.get("access-control-allow-origin")).not.toBe("https://evil.example");
  });
});
