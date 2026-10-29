import { readFileSync, readdirSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RATE_LIMITS, createApp } from "./app.js";
import { USAGE_LIMITS, createFileStorage, createUsageTracker, initializeUsageFile } from "./usage.js";

// Security tests against the real Express routes, built with a fake OpenAI client and a fake
// Supabase token verifier — no network, no OpenAI charges, no real health data.

const CLIENT_ORIGIN = "http://localhost:5173";
const USER_A = "user-a-0000";
const USER_B = "user-b-1111";
const TOKENS = { "token-a": USER_A, "token-b": USER_B };
for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) TOKENS[`token-u${n}`] = `user-u${n}`;
const PUBLISHABLE_KEY_AS_TOKEN = "sb_publishable_ABCdef123";

const fakeVerifyUser = vi.fn(async (token) => {
  if (token === "token-supabase-down") return { status: "unavailable" };
  if (TOKENS[token]) return { status: "ok", user: { id: TOKENS[token] } };
  return { status: "invalid" }; // expired, revoked, junk, or the publishable key itself
});

// Answers like OpenAI, including the token usage the cost guard settles against. OCR requests (JSON
// mode) get an empty results list.
const makeOpenai = () => ({
  chat: {
    completions: {
      create: vi.fn(async (args) => ({
        choices: [{ message: { content: args.response_format ? '{"results":[]}' : "AI RESPONSE" }, finish_reason: "stop" }],
        usage: { prompt_tokens: 1200, completion_tokens: 150 },
      })),
    },
  },
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

// A one-page "scanned" PDF: a drawn shape and no text layer, so the import goes down the OCR path.
const buildScannedPdf = (pages = 1) => {
  const kids = Array.from({ length: pages }, (_, i) => `${4 + i * 2} 0 R`).join(" ");
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${kids}] /Count ${pages} >>`, "<< >>"];
  for (let i = 0; i < pages; i += 1) {
    const stream = "0.2 0.2 0.2 rg 50 600 500 40 re f";
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${5 + i * 2} 0 R >>`);
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
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
let usageDir;
let usageFile;
let usageTracker;

// Each app gets a real file-backed usage tracker in a temporary folder (development storage).
const makeTracker = async (limits = USAGE_LIMITS) => {
  const tracker = createUsageTracker({ storage: createFileStorage(usageFile), limits });
  await tracker.load();
  return tracker;
};

const start = async ({ usageLimits, ...options } = {}) => {
  openai = makeOpenai();
  usageTracker = "usageTracker" in options ? options.usageTracker : await makeTracker(usageLimits);
  const app = createApp({ openai, clientOrigin: CLIENT_ORIGIN, verifyUser: fakeVerifyUser, usageTracker, ...options });
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
  usageDir = await mkdtemp(path.join(tmpdir(), "app-usage-"));
  usageFile = path.join(usageDir, "usage.json");
  await initializeUsageFile(usageFile);
  logs = [];
  for (const level of ["log", "warn", "error"]) {
    vi.spyOn(console, level).mockImplementation((...args) => logs.push(args.map(String).join(" ")));
  }
  await start();
});

afterEach(async () => {
  vi.restoreAllMocks();
  await new Promise((resolve) => server.close(resolve));
  await rm(usageDir, { recursive: true, force: true });
});

const restart = async (options = {}) => {
  await new Promise((resolve) => server.close(resolve));
  await start(options);
};

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
  it("keeps the approved 15-minute limits unchanged", () => {
    expect(RATE_LIMITS).toEqual({
      ai: { perFifteenMinutes: 30 },
      pdfImport: { perFifteenMinutes: 10 },
      failedSignInsPerIp: { perFifteenMinutes: 20 },
    });
  });

  it("AI: 30 requests per 15 minutes per user, shared across all three AI endpoints; other users unaffected", async () => {
    await restart({ usageLimits: { ...USAGE_LIMITS, user: { ...USAGE_LIMITS.user, aiRequestsPerDay: 1000 } } });
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

  it("AI: 25 requests per day per user, shared across the three AI endpoints", async () => {
    for (let i = 0; i < 25; i += 1) expect((await callProtected(AI_PATHS[i % 3], "token-a")).status).toBe(200);
    const blocked = await callProtected("/api/lab-insights", "token-a");
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toMatch(/today's limit for AI features/);
    expect(openai.chat.completions.create).toHaveBeenCalledTimes(25);
    expect((await callProtected("/api/coach", "token-b")).status).toBe(200);
  });

  it("AI: 150 requests per day for the whole app", async () => {
    await restart({ rateLimits: { ...RATE_LIMITS, ai: { perFifteenMinutes: 1000 } } });
    for (let n = 1; n <= 6; n += 1) {
      for (let i = 0; i < 25; i += 1) expect((await callProtected("/api/coach", `token-u${n}`)).status).toBe(200);
    }
    const blocked = await callProtected("/api/coach", "token-u7");
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toMatch(/AI features have reached today's limit/);
    expect(openai.chat.completions.create).toHaveBeenCalledTimes(150);
  });

  it("PDF imports: 10 per 15 minutes per user", async () => {
    for (let i = 0; i < 10; i += 1) expect((await uploadPdf("token-a")).status).toBe(200);
    const blocked = await uploadPdf("token-a");
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toMatch(/Too many PDF imports/);
    expect((await uploadPdf("token-b")).status).toBe(200);
  });

  it("PDF imports: 10 per day per user", async () => {
    await restart({ rateLimits: { ...RATE_LIMITS, pdfImport: { perFifteenMinutes: 1000 } } });
    for (let i = 0; i < 10; i += 1) expect((await uploadPdf("token-a")).status).toBe(200);
    const blocked = await uploadPdf("token-a");
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toMatch(/today's limit for PDF imports/);
    expect((await uploadPdf("token-b")).status).toBe(200);
  });

  it("AI and PDF limits are separate", async () => {
    for (let i = 0; i < 10; i += 1) await uploadPdf("token-a");
    expect((await uploadPdf("token-a")).status).toBe(429);
    expect((await callProtected("/api/coach", "token-a")).status).toBe(200);
  });

  it("unauthenticated requests don't use up a user's allowance", async () => {
    for (let i = 0; i < 15; i += 1) await post("/api/coach", { body: aiBodies(USER_A)["/api/coach"] });
    for (let i = 0; i < 25; i += 1) expect((await callProtected("/api/coach", "token-a")).status).toBe(200);
  });

  it("repeated failed sign-ins from one address are throttled (20 per 15 minutes)", async () => {
    for (let i = 0; i < 20; i += 1) expect((await callProtected("/api/coach", "token-guess")).status).toBe(401);
    expect((await callProtected("/api/coach", "token-guess")).status).toBe(429);
    expect(fakeVerifyUser).toHaveBeenCalledTimes(20); // the 21st attempt never reaches Supabase
  });

  it("daily limits survive a server restart", async () => {
    for (let i = 0; i < 25; i += 1) await callProtected("/api/coach", "token-a");
    for (let i = 0; i < 10; i += 1) await uploadPdf("token-b");
    await restart(); // new app + new tracker reading the same usage file
    expect((await callProtected("/api/coach", "token-a")).status).toBe(429);
    await restart({ rateLimits: { ...RATE_LIMITS, pdfImport: { perFifteenMinutes: 1000 } } });
    expect((await uploadPdf("token-b")).status).toBe(429);
  });
});

describe("AI cost protection", () => {
  const savedUsage = async () => JSON.parse(await readFile(usageFile, "utf8"));

  it("settles each call to the actual cost OpenAI reports", async () => {
    await callProtected("/api/coach", "token-a");
    expect((await savedUsage()).daily.spentUsd).toBeCloseTo((1200 * 0.15 + 150 * 0.6) / 1e6, 12);
  });

  it("refuses before calling OpenAI when the daily budget can't cover the worst case", async () => {
    await restart({ usageLimits: { ...USAGE_LIMITS, dailyBudgetUsd: 0.0005 } });
    const res = await callProtected("/api/chat", "token-a");
    expect(res.status).toBe(429);
    expect((await res.json()).error).toMatch(/spending limit/);
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it("refuses before calling OpenAI when the monthly budget can't cover the worst case", async () => {
    await restart({ usageLimits: { ...USAGE_LIMITS, monthlyBudgetUsd: 0.0005 } });
    expect((await callProtected("/api/lab-insights", "token-a")).status).toBe(429);
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it("40 simultaneous AI requests from different users never exceed the budget", async () => {
    // Slow fake OpenAI so every request is in flight at once; budget fits only a few worst cases.
    await restart({ usageLimits: { ...USAGE_LIMITS, dailyBudgetUsd: 0.006 }, rateLimits: { ...RATE_LIMITS } });
    openai.chat.completions.create.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { choices: [{ message: { content: "AI RESPONSE" } }], usage: { prompt_tokens: 1200, completion_tokens: 150 } };
    });
    const users = Object.keys(TOKENS).filter((t) => t.startsWith("token-u"));
    const results = await Promise.all(Array.from({ length: 40 }, (_, i) => callProtected("/api/coach", users[i % users.length])));
    const ok = results.filter((r) => r.status === 200).length;
    const limited = results.filter((r) => r.status === 429).length;

    expect(ok + limited).toBe(40);
    expect(ok).toBeGreaterThan(0);
    expect(openai.chat.completions.create).toHaveBeenCalledTimes(ok);
    // Every call was within budget at its worst case when sent: worst case x calls <= budget.
    const worst = openai.chat.completions.create.mock.calls.map(([args]) => args);
    const { estimateMaxCostUsd } = await import("./usage.js");
    expect(worst.reduce((sum, args) => sum + estimateMaxCostUsd(args), 0)).toBeLessThanOrEqual(0.006 + 1e-9);
    expect((await savedUsage()).daily.spentUsd).toBeLessThanOrEqual(0.006);
  });

  it("60 simultaneous requests: the app-wide request cap holds exactly", async () => {
    await restart({ usageLimits: { ...USAGE_LIMITS, app: { ...USAGE_LIMITS.app, aiRequestsPerDay: 20 } } });
    const users = Object.keys(TOKENS).filter((t) => t.startsWith("token-u"));
    const results = await Promise.all(Array.from({ length: 60 }, (_, i) => callProtected("/api/coach", users[i % users.length])));
    expect(results.filter((r) => r.status === 200).length).toBe(20);
    expect(openai.chat.completions.create).toHaveBeenCalledTimes(20);
  });

  it("scanned PDFs: pages are reserved before any page is sent, and capped at 16 per user per day", async () => {
    await restart({ rateLimits: { ...RATE_LIMITS, pdfImport: { perFifteenMinutes: 1000 } } });
    const eightPages = buildScannedPdf(8);
    expect((await uploadPdf("token-a", eightPages)).status).toBe(200);
    expect((await uploadPdf("token-a", eightPages)).status).toBe(200);
    expect(openai.chat.completions.create).toHaveBeenCalledTimes(16);

    const blocked = await uploadPdf("token-a", buildScannedPdf(1));
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toMatch(/today's limit for reading scanned reports/);
    expect(openai.chat.completions.create).toHaveBeenCalledTimes(16); // nothing sent for the refused report
    expect((await uploadPdf("token-a")).status).toBe(200); // text PDFs (no OpenAI) still work
  });

  it("scanned PDFs: 30 pages per day for the whole app", async () => {
    await restart({ rateLimits: { ...RATE_LIMITS, pdfImport: { perFifteenMinutes: 1000 } } });
    for (const token of ["token-u1", "token-u2", "token-u3"]) expect((await uploadPdf(token, buildScannedPdf(8))).status).toBe(200);
    const blocked = await uploadPdf("token-u4", buildScannedPdf(8)); // 24 + 8 > 30
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error).toMatch(/unavailable for the rest of today/);
    expect((await uploadPdf("token-u4", buildScannedPdf(6))).status).toBe(200); // exactly 30
  });

  it("scanned pages are priced from the real image size before sending", async () => {
    await uploadPdf("token-a", buildScannedPdf(1));
    const saved = await savedUsage();
    expect(saved.daily.scannedPages).toBe(1);
    expect(saved.daily.spentUsd).toBeCloseTo((1200 * 0.15 + 150 * 0.6) / 1e6, 12); // settled to actual
  });
});

describe("usage tracking failures: AI blocked, everything else keeps working", () => {
  const startWithBrokenUsage = async () => {
    await rm(usageFile); // e.g. the file went missing
    await restart();
    expect(usageTracker.status()).toEqual({ healthy: false, problem: "missing" });
  };

  it.each(AI_PATHS)("%s → 503 and OpenAI is never called", async (path) => {
    await startWithBrokenUsage();
    const res = await callProtected(path, "token-a");
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/temporarily unavailable/);
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it("text-PDF import still works; scanned-PDF reading is blocked", async () => {
    await startWithBrokenUsage();
    expect((await uploadPdf("token-a")).status).toBe(200);
    const scanned = await uploadPdf("token-a", buildScannedPdf(1));
    expect(scanned.status).toBe(503);
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it("no tracker configured at all → AI blocked (fails closed)", async () => {
    await restart({ usageTracker: undefined });
    expect((await callProtected("/api/coach", "token-a")).status).toBe(503);
    expect(openai.chat.completions.create).not.toHaveBeenCalled();
  });

  it("a corrupted usage file is never silently reset", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(usageFile, "{ this is not json");
    await restart();
    expect((await callProtected("/api/coach", "token-a")).status).toBe(503);
    expect(await readFile(usageFile, "utf8")).toBe("{ this is not json"); // left untouched for inspection
  });
});

describe("security headers", () => {
  const expectSecurityHeaders = (res) => {
    expect(res.headers.get("x-powered-by")).toBeNull();
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
    expect(res.headers.get("content-security-policy")).toMatch(/default-src 'none'.*frame-ancestors 'none'/);
    expect(res.headers.get("strict-transport-security")).toMatch(/max-age=\d+/);
    expect(res.headers.get("cache-control")).toBe("no-store");
  };

  it("are present on successful responses from every endpoint", async () => {
    expectSecurityHeaders(await fetch(`${baseUrl}/api/health`));
    for (const path of ALL_PROTECTED) expectSecurityHeaders(await callProtected(path, "token-a"));
  });

  it("are present on error responses (401, 403, 404, 400)", async () => {
    expectSecurityHeaders(await post("/api/coach", { body: {} }));
    expectSecurityHeaders(await post("/api/coach", { token: "token-a", body: { records: [record(USER_B)] } }));
    expectSecurityHeaders(await fetch(`${baseUrl}/api/nope`));
    expectSecurityHeaders(await post("/api/coach", { token: "token-a", raw: "{bad", headers: { "Content-Type": "application/json" } }));
  });

  it("don't interfere with the browser's cross-origin (CORS) access from the app's origin", async () => {
    const res = await fetch(`${baseUrl}/api/coach`, {
      method: "POST",
      headers: { Origin: CLIENT_ORIGIN, Authorization: "Bearer token-a", "Content-Type": "application/json" },
      body: JSON.stringify(aiBodies(USER_A)["/api/coach"]),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe(CLIENT_ORIGIN);
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
