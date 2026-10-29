import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeError, logError, logInfo, logWarn, scrub } from "./log.js";

describe("scrub", () => {
  it.each([
    ["OpenAI key", "key sk-proj-abcDEF123456789_xyz used", "sk-proj-abc"],
    ["OpenAI masked key", "Incorrect API key provided: sk-proj-****abcd.", "sk-proj-****"],
    ["legacy OpenAI key", "sk-1234567890abcdefABCDEF", "sk-1234567890"],
    ["Supabase secret key", "sb_secret_AbCdEf123456", "sb_secret_AbC"],
    ["Supabase publishable key", "sb_publishable_AbCdEf123456", "sb_publishable_AbC"],
    ["sign-in token (JWT)", "token eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ1In0.c2lnbmF0dXJl here", "eyJhbGci"],
    ["Bearer header", "Authorization: Bearer abc.def.ghi", "abc.def.ghi"],
    ["email address", "user jane.doe+test@example.com failed", "jane.doe"],
  ])("removes a %s", (_name, input, secret) => {
    const out = scrub(input);
    expect(out).not.toContain(secret);
    expect(out).toMatch(/\[redacted-(key|token|email)\]/);
  });

  it("leaves ordinary log text alone", () => {
    const line = "[server] POST /api/coach — 4 record(s), 2 check-in(s), 85 lab result(s), goal: set";
    expect(scrub(line)).toBe(line);
  });
});

describe("describeError", () => {
  it("keeps only the status and a short code — never the message", () => {
    const err = Object.assign(new Error("Incorrect API key provided: sk-proj-****abcd. Patient notes: chest pain"), {
      status: 401,
      code: "invalid_api_key",
    });
    expect(describeError(err)).toBe("status=401 code=invalid_api_key");
  });

  it("falls back through nested codes, types, and names", () => {
    expect(describeError({ status: 429, error: { code: "insufficient_quota" } })).toBe("status=429 code=insufficient_quota");
    expect(describeError(new TypeError("fetch failed"))).toBe("status=- code=TypeError");
    expect(describeError({ code: "has spaces and secrets sk-abc" })).toBe("status=- code=unknown");
    expect(describeError(undefined)).toBe("status=- code=unknown");
  });
});

describe("log functions", () => {
  let lines;
  beforeEach(() => {
    lines = [];
    for (const level of ["log", "warn", "error"]) vi.spyOn(console, level).mockImplementation((m) => lines.push(m));
  });
  afterEach(() => vi.restoreAllMocks());

  it("every log line is scrubbed", () => {
    logInfo("signed in as a@b.co with Bearer xyz");
    logWarn("key sk-proj-AAAAAAAAAAAA");
    logError("/api/coach failed", Object.assign(new Error("sk-proj-****abcd"), { status: 401, code: "invalid_api_key" }));
    const all = lines.join("\n");
    expect(all).not.toMatch(/a@b\.co|Bearer xyz|sk-proj-AAAA|sk-proj-\*\*\*\*abcd/);
    expect(lines[2]).toBe("[server] /api/coach failed: status=401 code=invalid_api_key");
  });
});
