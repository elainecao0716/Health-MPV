import { chmod, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  OPENAI_PRICING,
  USAGE_LIMITS,
  UsageLimitError,
  actualCostUsd,
  createFileStorage,
  createUsageTracker,
  emptyState,
  estimateMaxCostUsd,
  guardOpenai,
  imageTokens,
  initializeUsageFile,
  pngDimensions,
} from "./usage.js";

let dir;
let file;
let clock;

const tracker = (limits = USAGE_LIMITS) =>
  createUsageTracker({ storage: createFileStorage(file), limits, now: () => clock });
const loaded = async (limits) => {
  const t = tracker(limits);
  await t.load();
  return t;
};
const pngDataUrl = (width, height) => {
  const header = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "latin1");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return `data:image/png;base64,${header.toString("base64")}`;
};

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "usage-test-"));
  file = path.join(dir, "data", "usage.json");
  clock = new Date("2026-10-29T12:00:00Z");
  await initializeUsageFile(file, clock);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await chmod(path.dirname(file), 0o700).catch(() => {});
  await rm(dir, { recursive: true, force: true });
});

describe("pricing and cost estimates", () => {
  it("uses OpenAI's official gpt-4o-mini prices and image token rules", () => {
    expect(OPENAI_PRICING["gpt-4o-mini"]).toEqual({ inputPerMillion: 0.15, outputPerMillion: 0.6, imageBaseTokens: 2833, imageTileTokens: 5667 });
  });

  it("counts image tokens exactly as OpenAI documents", () => {
    expect(imageTokens(1024, 1024)).toBe(25501); // OpenAI's own worked example
    expect(imageTokens(1530, 1980)).toBe(25501); // a letter-size page as rendered for OCR
    expect(imageTokens(768, 2048)).toBe(48169); // the largest billable image (2 x 4 tiles)
    expect(imageTokens(400, 300)).toBe(2833 + 5667); // small images aren't enlarged
  });

  it("reads PNG dimensions from a data URL", () => {
    expect(pngDimensions(pngDataUrl(1530, 1980))).toEqual({ width: 1530, height: 1980 });
    expect(pngDimensions("data:image/jpeg;base64,AAAA")).toBeNull();
  });

  it("estimates an upper bound: one token per UTF-8 byte plus max_tokens of output", () => {
    const args = { model: "gpt-4o-mini", max_tokens: 400, messages: [{ role: "user", content: "x".repeat(1000) }] };
    expect(estimateMaxCostUsd(args)).toBeCloseTo(((64 + 16 + 1000) * 0.15 + 400 * 0.6) / 1e6, 12);

    // Non-English text costs more bytes, so the bound stays safe for any language.
    const chinese = { ...args, messages: [{ role: "user", content: "血糖".repeat(100) }] };
    expect(estimateMaxCostUsd(chinese)).toBeGreaterThan(estimateMaxCostUsd({ ...args, messages: [{ role: "user", content: "x".repeat(200) }] }));
  });

  it("prices images by their real size, and unknown images at the worst case", () => {
    const withImage = (url) => ({
      model: "gpt-4o-mini", max_tokens: 4096,
      messages: [{ role: "user", content: [{ type: "image_url", image_url: { url } }] }],
    });
    const page = estimateMaxCostUsd(withImage(pngDataUrl(1530, 1980)));
    const unknown = estimateMaxCostUsd(withImage("https://example.com/x.jpg"));
    expect(page).toBeCloseTo(((64 + 16 + 25501) * 0.15 + 4096 * 0.6) / 1e6, 12);
    expect(unknown).toBeCloseTo(((64 + 16 + 48169) * 0.15 + 4096 * 0.6) / 1e6, 12);
  });

  it("refuses to estimate without max_tokens or for an unpriced model (no uncapped calls)", () => {
    expect(() => estimateMaxCostUsd({ model: "gpt-4o-mini", messages: [] })).toThrow(/max_tokens/);
    expect(() => estimateMaxCostUsd({ model: "gpt-9", max_tokens: 10, messages: [] })).toThrow(/pricing/);
  });

  it("computes actual cost from OpenAI's reported usage", () => {
    expect(actualCostUsd("gpt-4o-mini", { prompt_tokens: 10000, completion_tokens: 300 })).toBeCloseTo(0.0015 + 0.00018, 12);
    expect(actualCostUsd("gpt-4o-mini", undefined)).toBeNull();
  });
});

describe("approved limits", () => {
  it("match the values approved for Step A", () => {
    expect(USAGE_LIMITS).toEqual({
      dailyBudgetUsd: 2,
      monthlyBudgetUsd: 30,
      app: { aiRequestsPerDay: 150, scannedPagesPerDay: 30 },
      user: { aiRequestsPerDay: 25, scannedPagesPerDay: 16, pdfImportsPerDay: 10 },
    });
  });

  it("AI requests: 25 per user per day, 150 for the whole app", async () => {
    const t = await loaded();
    for (let i = 0; i < 25; i += 1) await t.countAiRequest("user-1");
    await expect(t.countAiRequest("user-1")).rejects.toMatchObject({ status: 429, code: "user_ai_daily" });

    for (let u = 2; u <= 6; u += 1) for (let i = 0; i < 25; i += 1) await t.countAiRequest(`user-${u}`);
    expect(t.snapshot().daily.aiRequests).toBe(150);
    await expect(t.countAiRequest("user-7")).rejects.toMatchObject({ status: 429, code: "app_ai_daily" });
  });

  it("scanned pages: 16 per user per day, 30 for the whole app, reserved per report", async () => {
    const t = await loaded();
    await t.reserveScannedPages("user-1", 8);
    await t.reserveScannedPages("user-1", 8);
    await expect(t.reserveScannedPages("user-1", 1)).rejects.toMatchObject({ status: 429, code: "user_pages_daily" });
    await t.reserveScannedPages("user-2", 8);
    await expect(t.reserveScannedPages("user-3", 8)).rejects.toMatchObject({ code: "app_pages_daily" }); // 24 + 8 > 30
    await t.reserveScannedPages("user-3", 6);
    expect(t.snapshot().daily.scannedPages).toBe(30);
  });

  it("PDF imports: 10 per user per day", async () => {
    const t = await loaded();
    for (let i = 0; i < 10; i += 1) await t.countPdfImport("user-1");
    await expect(t.countPdfImport("user-1")).rejects.toMatchObject({ status: 429, code: "user_pdf_daily" });
    await t.countPdfImport("user-2");
  });

  it("daily budget: $2.00 — a reservation that would exceed it is refused", async () => {
    const t = await loaded();
    await t.reserveSpend(1.99);
    await expect(t.reserveSpend(0.02)).rejects.toMatchObject({ status: 429, code: "budget" });
    await t.reserveSpend(0.01);
    expect(t.snapshot().daily.spentUsd).toBeCloseTo(2, 10);
  });

  it("monthly budget: $30.00 across days, resetting only in a new month", async () => {
    const t = await loaded();
    for (let day = 1; day <= 15; day += 1) {
      clock = new Date(Date.UTC(2026, 9, day, 12));
      await t.reserveSpend(2);
    }
    clock = new Date(Date.UTC(2026, 9, 16, 12)); // new day: daily budget is free again, monthly is spent
    await expect(t.reserveSpend(0.01)).rejects.toMatchObject({ code: "budget" });
    expect(t.snapshot().monthly.spentUsd).toBeCloseTo(30, 10);

    clock = new Date(Date.UTC(2026, 10, 1, 0, 0, 1)); // new month
    await t.reserveSpend(1);
    expect(t.snapshot().monthly.spentUsd).toBeCloseTo(1, 10);
  });

  it("daily counts reset at midnight UTC; monthly spending carries over", async () => {
    const t = await loaded();
    for (let i = 0; i < 25; i += 1) await t.countAiRequest("user-1");
    await t.reserveSpend(1.5);
    clock = new Date("2026-10-29T23:59:59Z");
    await expect(t.countAiRequest("user-1")).rejects.toMatchObject({ code: "user_ai_daily" });

    clock = new Date("2026-10-30T00:00:00Z");
    await t.countAiRequest("user-1");
    const s = t.snapshot();
    expect(s.daily).toMatchObject({ aiRequests: 1, spentUsd: 0 });
    expect(s.monthly.spentUsd).toBeCloseTo(1.5, 10);
  });
});

describe("reservations and settlement", () => {
  it("replaces the worst-case reservation with the actual cost", async () => {
    const t = await loaded();
    const r = await t.reserveSpend(0.05);
    await t.settleSpend(r, 0.002);
    expect(t.snapshot().daily.spentUsd).toBeCloseTo(0.002, 10);
    expect(t.snapshot().monthly.spentUsd).toBeCloseTo(0.002, 10);
  });

  it("keeps the reservation when actual usage is unknown", async () => {
    const t = await loaded();
    const r = await t.reserveSpend(0.05);
    await t.settleSpend(r, null);
    expect(t.snapshot().daily.spentUsd).toBeCloseTo(0.05, 10);
  });

  it("only adjusts the day the money was reserved in", async () => {
    const t = await loaded();
    const r = await t.reserveSpend(0.05);
    clock = new Date("2026-10-30T00:00:01Z");
    await t.reserveSpend(0.01);
    await t.settleSpend(r, 0.001); // yesterday's call: today's total must not drop
    expect(t.snapshot().daily.spentUsd).toBeCloseTo(0.01, 10);
    expect(t.snapshot().monthly.spentUsd).toBeCloseTo(0.011, 10);
  });

  it("guardOpenai: reserves before calling, settles to actual cost after", async () => {
    const t = await loaded();
    const order = [];
    const openai = {
      chat: { completions: { create: vi.fn(async () => {
        order.push(`call with spent=${t.snapshot().daily.spentUsd > 0}`);
        return { choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 1000, completion_tokens: 100 } };
      }) } },
    };
    await guardOpenai(openai, t).chat.completions.create({ model: "gpt-4o-mini", max_tokens: 400, messages: [{ role: "user", content: "hi" }] });
    expect(order).toEqual(["call with spent=true"]); // the reservation existed before the call was sent
    expect(t.snapshot().daily.spentUsd).toBeCloseTo((1000 * 0.15 + 100 * 0.6) / 1e6, 12);
  });

  it("guardOpenai: never calls OpenAI when the budget can't cover the worst case", async () => {
    const t = await loaded({ ...USAGE_LIMITS, dailyBudgetUsd: 0.0001 });
    const create = vi.fn();
    await expect(
      guardOpenai({ chat: { completions: { create } } }, t).chat.completions.create({ model: "gpt-4o-mini", max_tokens: 400, messages: [] })
    ).rejects.toBeInstanceOf(UsageLimitError);
    expect(create).not.toHaveBeenCalled();
  });

  it("guardOpenai: releases the reservation when OpenAI answers with an error, keeps it on network failure", async () => {
    const t = await loaded();
    const args = { model: "gpt-4o-mini", max_tokens: 400, messages: [] };
    const failing = (err) => ({ chat: { completions: { create: async () => { throw err; } } } });

    await expect(guardOpenai(failing(Object.assign(new Error("bad"), { status: 500 })), t).chat.completions.create(args)).rejects.toThrow();
    expect(t.snapshot().daily.spentUsd).toBe(0);

    await expect(guardOpenai(failing(new Error("socket hang up")), t).chat.completions.create(args)).rejects.toThrow();
    expect(t.snapshot().daily.spentUsd).toBeCloseTo(estimateMaxCostUsd(args), 12);
  });
});

describe("simultaneous requests cannot bypass limits", () => {
  it("200 simultaneous reservations never exceed the daily budget", async () => {
    const t = await loaded({ ...USAGE_LIMITS, dailyBudgetUsd: 0.05 });
    const results = await Promise.allSettled(Array.from({ length: 200 }, () => t.reserveSpend(0.001)));
    const granted = results.filter((r) => r.status === "fulfilled").length;

    expect(granted).toBe(50);
    expect(t.snapshot().daily.spentUsd).toBeLessThanOrEqual(0.05 + 1e-9);
    const saved = JSON.parse(await readFile(file, "utf8"));
    expect(saved.daily.spentUsd).toBeCloseTo(t.snapshot().daily.spentUsd, 10); // what's on disk matches
  });

  it("300 simultaneous AI requests: exactly 150 allowed app-wide, 25 per user", async () => {
    const t = await loaded();
    const results = await Promise.allSettled(Array.from({ length: 300 }, (_, i) => t.countAiRequest(`user-${i % 12}`)));
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(150);
    for (const u of Object.values(t.snapshot().daily.users)) expect(u.aiRequests).toBeLessThanOrEqual(25);
  });

  it("simultaneous scanned reports can't exceed the page caps", async () => {
    const t = await loaded();
    const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => t.reserveScannedPages(`user-${i % 5}`, 8)));
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(3); // 3 x 8 = 24; a 4th would make 32 > 30
    expect(t.snapshot().daily.scannedPages).toBeLessThanOrEqual(30);
  });
});

describe("usage survives restarts", () => {
  it("a new tracker reading the same file continues from the saved totals", async () => {
    const first = await loaded();
    for (let i = 0; i < 25; i += 1) await first.countAiRequest("user-1");
    await first.reserveSpend(1.25);
    await first.reserveScannedPages("user-1", 8);
    await first.countPdfImport("user-1");

    const second = await loaded(); // "restart"
    expect(second.status()).toEqual({ healthy: true, problem: null });
    await expect(second.countAiRequest("user-1")).rejects.toMatchObject({ code: "user_ai_daily" });
    await expect(second.reserveSpend(0.8)).rejects.toMatchObject({ code: "budget" }); // 1.25 + 0.8 > 2
    const s = second.snapshot();
    expect(s.daily).toMatchObject({ aiRequests: 25, scannedPages: 8 });
    expect(s.monthly.spentUsd).toBeCloseTo(1.25, 10);
  });

  it("stores no personal data: users appear only as a one-way hash", async () => {
    const t = await loaded();
    await t.countAiRequest("2f1c6a0e-real-user-id");
    const text = await readFile(file, "utf8");
    expect(text).not.toContain("2f1c6a0e-real-user-id");
    expect(Object.keys(JSON.parse(text).daily.users)[0]).toMatch(/^[0-9a-f]{32}$/);
  });

  it("initializing again never overwrites (can't be used to reset totals)", async () => {
    const t = await loaded();
    await t.reserveSpend(1);
    expect(await initializeUsageFile(file)).toBe("exists");
    expect((await loaded()).snapshot().daily.spentUsd).toBeCloseTo(1, 10);
  });
});

describe("fails closed when usage can't be tracked reliably", () => {
  const expectAiBlocked = async (t) => {
    await expect(t.countAiRequest("user-1")).rejects.toMatchObject({ status: 503 });
    await expect(t.reserveSpend(0.001)).rejects.toMatchObject({ status: 503 });
    await expect(t.reserveScannedPages("user-1", 1)).rejects.toMatchObject({ status: 503 });
  };

  it("missing file → AI blocked (totals are not reset to zero)", async () => {
    await rm(file);
    const t = await loaded();
    expect(t.status()).toEqual({ healthy: false, problem: "missing" });
    await expectAiBlocked(t);
  });

  it("corrupted file → AI blocked", async () => {
    for (const content of ["{not json", JSON.stringify({ version: 1 }), JSON.stringify({ ...emptyState(), daily: { spentUsd: -5 } })]) {
      await writeFile(file, content);
      const t = await loaded();
      expect(t.status().problem).toBe("corrupt");
      await expectAiBlocked(t);
    }
  });

  it("unreadable file → AI blocked", async () => {
    await chmod(file, 0o000);
    const t = await loaded();
    await chmod(file, 0o600);
    expect(t.status().healthy).toBe(false);
    await expectAiBlocked(t);
  });

  it("can't save → the request is refused and AI stays blocked", async () => {
    const t = await loaded();
    await t.countAiRequest("user-1");
    await chmod(path.dirname(file), 0o500); // directory becomes read-only

    await expect(t.countAiRequest("user-1")).rejects.toMatchObject({ status: 503 });
    expect(t.status()).toEqual({ healthy: false, problem: "write_failed" });
    await chmod(path.dirname(file), 0o700);
    await expectAiBlocked(t); // stays blocked until the server is restarted with working storage
  });

  it("text-PDF imports (non-AI) keep working while AI is blocked, still limited to 10 per day", async () => {
    await rm(file);
    const t = await loaded();
    for (let i = 0; i < 10; i += 1) await t.countPdfImport("user-1");
    await expect(t.countPdfImport("user-1")).rejects.toMatchObject({ code: "user_pdf_daily" });
  });
});
