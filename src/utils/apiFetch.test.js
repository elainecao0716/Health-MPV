import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getSession = vi.fn();
vi.mock("../supabase", () => ({ supabase: { auth: { getSession: (...args) => getSession(...args) } } }));

const { apiFetch, SESSION_EXPIRED_MESSAGE } = await import("./apiFetch.js");

const signedIn = (token = "access-token-123") => ({ data: { session: { access_token: token } } });

describe("apiFetch", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 200 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    getSession.mockReset();
  });

  it("adds the signed-in user's access token as a Bearer Authorization header", async () => {
    getSession.mockResolvedValue(signedIn());
    await apiFetch("/api/coach", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });

    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("/api/coach");
    expect(init.method).toBe("POST");
    expect(init.body).toBe("{}");
    expect(init.headers.get("Authorization")).toBe("Bearer access-token-123");
    expect(init.headers.get("Content-Type")).toBe("application/json");
  });

  it("works for FormData uploads without forcing a Content-Type", async () => {
    getSession.mockResolvedValue(signedIn());
    const body = new FormData();
    await apiFetch("/api/labs/import-pdf", { method: "POST", body });

    const [, init] = fetch.mock.calls[0];
    expect(init.body).toBe(body);
    expect(init.headers.get("Authorization")).toBe("Bearer access-token-123");
    expect(init.headers.has("Content-Type")).toBe(false);
  });

  it("does not send the request at all when nobody is signed in", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    await expect(apiFetch("/api/coach", { method: "POST" })).rejects.toThrow(SESSION_EXPIRED_MESSAGE);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("turns a 401 from the server into a 'sign in again' error", async () => {
    getSession.mockResolvedValue(signedIn());
    fetch.mockResolvedValueOnce(new Response(JSON.stringify({ error: "x" }), { status: 401 }));
    await expect(apiFetch("/api/coach", { method: "POST" })).rejects.toThrow(SESSION_EXPIRED_MESSAGE);
  });

  it("passes other responses (including errors like 403/429/500) through for the caller to handle", async () => {
    getSession.mockResolvedValue(signedIn());
    for (const status of [200, 400, 403, 429, 500, 503]) {
      fetch.mockResolvedValueOnce(new Response("{}", { status }));
      expect((await apiFetch("/api/coach", { method: "POST" })).status).toBe(status);
    }
  });
});

describe("every backend API call goes through apiFetch", () => {
  it("no frontend source calls /api/ with plain fetch (which would omit the sign-in token)", () => {
    const srcDir = fileURLToPath(new URL("..", import.meta.url));
    const files = readdirSync(srcDir, { recursive: true }).filter(
      (f) => /\.(js|jsx)$/.test(f) && !/\.test\.js$/.test(f) && !f.endsWith("apiFetch.js")
    );

    const callers = [];
    for (const file of files) {
      const code = readFileSync(`${srcDir}/${file}`, "utf-8");
      expect(code, file).not.toMatch(/(?<![\w.])fetch\(\s*["'`]\/api\//);
      if (/apiFetch\(\s*["'`]\/api\//.test(code)) callers.push(file.split("/").pop());
    }
    expect(callers.sort()).toEqual(["AiChatCard.jsx", "AiCoachCard.jsx", "AiLabInsightsCard.jsx", "ImportLabReportCard.jsx"]);
  });
});
