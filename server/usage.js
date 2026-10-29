// OpenAI cost and usage protection. Every OpenAI call is priced at its worst case and that amount is
// reserved — and saved — before the call is sent; the reservation is then corrected to the actual cost
// OpenAI reports. Because checking and reserving happen in one synchronous step, simultaneous requests
// can't jointly exceed a budget. If usage can't be tracked reliably (file missing, corrupt, unreadable,
// or not writable), AI requests are refused rather than letting totals restart from zero.
//
// Storage is behind a small interface (load / snapshot / save) so the development file store can be
// replaced by a production store later without touching the limit logic.

import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { logError, logWarn } from "./log.js";

// Official prices, checked 2026-10-29 at https://developers.openai.com/api/docs/pricing (Standard
// tier, USD per 1M tokens) and image token rules from the vision guide
// (https://developers.openai.com/api/docs/guides/images-vision). Update here if OpenAI changes them.
export const OPENAI_PRICING = {
  "gpt-4o-mini": { inputPerMillion: 0.15, outputPerMillion: 0.6, imageBaseTokens: 2833, imageTileTokens: 5667 },
};

export const USAGE_LIMITS = {
  dailyBudgetUsd: 2,
  monthlyBudgetUsd: 30,
  app: { aiRequestsPerDay: 150, scannedPagesPerDay: 30 },
  user: { aiRequestsPerDay: 25, scannedPagesPerDay: 16, pdfImportsPerDay: 10 },
};

// Messages shown to users. They never reveal amounts, other users, or internal state.
const MESSAGES = {
  unavailable: "AI features are temporarily unavailable. Please try again later.",
  appAiDaily: "AI features have reached today's limit. Please try again tomorrow.",
  userAiDaily: "You've reached today's limit for AI features. Please try again tomorrow.",
  budget: "AI features have reached their spending limit for now. Please try again later.",
  appPages: "Reading scanned reports is unavailable for the rest of today. You can enter results manually or try again tomorrow.",
  userPages: "You've reached today's limit for reading scanned reports. You can enter results manually or try again tomorrow.",
  userPdfImports: "You've reached today's limit for PDF imports. Please try again tomorrow.",
};

export class UsageLimitError extends Error {
  constructor(status, reason, message) {
    super(message);
    this.name = "UsageLimitError";
    this.status = status; // 429 = a limit was reached, 503 = usage tracking unavailable
    this.code = reason;
  }
}

const unavailable = () => new UsageLimitError(503, "usage_unavailable", MESSAGES.unavailable);

// --- Cost estimation ----------------------------------------------------------------------------

// Width/height from a base64 PNG data URL's IHDR chunk, or null if it isn't a PNG.
export const pngDimensions = (dataUrl) => {
  const match = typeof dataUrl === "string" && dataUrl.match(/^data:image\/png;base64,(.+)$/);
  if (!match) return null;
  const header = Buffer.from(match[1].slice(0, 44), "base64");
  if (header.length < 24 || header.toString("latin1", 1, 4) !== "PNG") return null;
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
};

// OpenAI's published rule for high/auto-detail images: fit within 2048x2048, scale the shortest side
// down to 768, then base + per-512px-tile tokens.
export const imageTokens = (width, height, model = "gpt-4o-mini") => {
  const { imageBaseTokens, imageTileTokens } = OPENAI_PRICING[model];
  let w = width;
  let h = height;
  const fit = Math.min(1, 2048 / Math.max(w, h));
  w = Math.floor(w * fit);
  h = Math.floor(h * fit);
  const shortest = Math.min(w, h);
  if (shortest > 768) {
    const s = 768 / shortest;
    w = Math.floor(w * s);
    h = Math.floor(h * s);
  }
  return imageBaseTokens + Math.ceil(w / 512) * Math.ceil(h / 512) * imageTileTokens;
};

// The largest image OpenAI would still bill at full size (two tiles by four).
const WORST_CASE_IMAGE_TOKENS = imageTokens(768, 2048);

const PER_MESSAGE_OVERHEAD_TOKENS = 16;
const PER_REQUEST_OVERHEAD_TOKENS = 64;

// An upper bound on a chat completion's cost. Text is counted as one token per UTF-8 byte — a real
// token is never shorter than one byte, so this can't be exceeded — and the output as max_tokens,
// which OpenAI never exceeds.
export const estimateMaxCostUsd = (args) => {
  const pricing = OPENAI_PRICING[args?.model];
  if (!pricing) throw new Error(`No pricing configured for model "${args?.model}".`);
  if (!Number.isInteger(args.max_tokens) || args.max_tokens <= 0) throw new Error("max_tokens is required for cost control.");

  let inputTokens = PER_REQUEST_OVERHEAD_TOKENS;
  for (const message of args.messages ?? []) {
    inputTokens += PER_MESSAGE_OVERHEAD_TOKENS;
    const parts = typeof message.content === "string" ? [{ type: "text", text: message.content }] : message.content ?? [];
    for (const part of parts) {
      if (part.type === "text") inputTokens += Buffer.byteLength(part.text ?? "", "utf8");
      else if (part.type === "image_url") {
        const size = pngDimensions(part.image_url?.url);
        inputTokens += size ? imageTokens(size.width, size.height, args.model) : WORST_CASE_IMAGE_TOKENS;
      } else {
        inputTokens += Buffer.byteLength(JSON.stringify(part), "utf8");
      }
    }
  }
  return (inputTokens * pricing.inputPerMillion + args.max_tokens * pricing.outputPerMillion) / 1e6;
};

// The actual cost of a finished call, from the token counts OpenAI reports. Returns null when usage
// is missing so the caller keeps the (higher) reserved amount instead.
export const actualCostUsd = (model, usage) => {
  const pricing = OPENAI_PRICING[model];
  if (!pricing || !Number.isFinite(usage?.prompt_tokens) || !Number.isFinite(usage?.completion_tokens)) return null;
  return (usage.prompt_tokens * pricing.inputPerMillion + usage.completion_tokens * pricing.outputPerMillion) / 1e6;
};

// --- State ------------------------------------------------------------------------------------

const STATE_VERSION = 1;
// Money is rounded to a billionth of a dollar so repeated additions don't drift (0.001 added fifty
// times is 0.05000000000000003 in floating point, which would wrongly refuse the 50th request).
const money = (usd) => Math.round(usd * 1e9) / 1e9;
const utcDay = (date) => date.toISOString().slice(0, 10);
const utcMonth = (date) => date.toISOString().slice(0, 7);

// Users are stored only as a one-way hash of their account id — no names, emails, or health data.
const userKey = (userId) => createHash("sha256").update(String(userId)).digest("hex").slice(0, 32);

export const emptyState = (now = new Date()) => ({
  version: STATE_VERSION,
  day: utcDay(now),
  month: utcMonth(now),
  daily: { spentUsd: 0, aiRequests: 0, scannedPages: 0, users: {} },
  monthly: { spentUsd: 0 },
});

const isCount = (v) => Number.isFinite(v) && v >= 0;
const isValidState = (s) =>
  s?.version === STATE_VERSION &&
  /^\d{4}-\d{2}-\d{2}$/.test(s.day) &&
  /^\d{4}-\d{2}$/.test(s.month) &&
  isCount(s.daily?.spentUsd) &&
  isCount(s.daily?.aiRequests) &&
  isCount(s.daily?.scannedPages) &&
  s.daily.users !== null &&
  typeof s.daily.users === "object" &&
  Object.values(s.daily.users).every((u) => isCount(u?.aiRequests) && isCount(u?.scannedPages) && isCount(u?.pdfImports)) &&
  isCount(s.monthly?.spentUsd);

// --- Development storage: a JSON file -------------------------------------------------------------

export class UsageStorageError extends Error {
  constructor(reason) {
    super(reason);
    this.name = "UsageStorageError";
    this.code = reason; // "missing" | "corrupt" | "unreadable" | "write_failed"
  }
}

// Reads/writes the whole state as one JSON file. Writes go to a temporary file that is then renamed
// over the real one, so a crash mid-write can't leave a half-written file. For development only: on
// many hosting platforms the disk is wiped on every deploy.
export const createFileStorage = (filePath) => ({
  kind: "file",
  async load() {
    let text;
    try {
      text = await readFile(filePath, "utf8");
    } catch (err) {
      throw new UsageStorageError(err?.code === "ENOENT" ? "missing" : "unreadable");
    }
    let state;
    try {
      state = JSON.parse(text);
    } catch {
      throw new UsageStorageError("corrupt");
    }
    if (!isValidState(state)) throw new UsageStorageError("corrupt");
    return state;
  },
  async save(state) {
    const tmp = `${filePath}.${process.pid}.tmp`;
    try {
      await writeFile(tmp, JSON.stringify(state, null, 2), { mode: 0o600 });
      await rename(tmp, filePath);
    } catch {
      throw new UsageStorageError("write_failed");
    }
  },
});

// Creates the usage file for a new development setup. Refuses to overwrite an existing file, so
// usage totals can never be reset by running it again.
export const initializeUsageFile = async (filePath, now = new Date()) => {
  await mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
  try {
    await writeFile(filePath, JSON.stringify(emptyState(now), null, 2), { flag: "wx", mode: 0o600 });
    return "created";
  } catch (err) {
    if (err?.code === "EEXIST") return "exists";
    throw err;
  }
};

// --- The usage tracker ------------------------------------------------------------------------------

export const createUsageTracker = ({ storage, limits = USAGE_LIMITS, now = () => new Date() }) => {
  let state = null;
  let healthy = false;
  let problem = "not_loaded";
  let writeChain = Promise.resolve();
  const warned = new Set();

  const markUnhealthy = (reason) => {
    if (healthy || problem !== reason) logError("usage tracking unavailable — AI requests blocked", { code: reason });
    healthy = false;
    problem = reason;
  };

  // Saves are queued so they're written one at a time, each with the latest state.
  const persist = () => {
    const snapshot = JSON.parse(JSON.stringify(state));
    const write = writeChain.then(() => storage.save(snapshot));
    writeChain = write.catch(() => {});
    return write;
  };

  const persistOrBlock = async () => {
    try {
      await persist();
    } catch (err) {
      markUnhealthy(err?.code ?? "write_failed");
      throw unavailable();
    }
  };

  // Starts a new day / month when the UTC date changes. Monthly totals carry across days.
  const rollOver = () => {
    const current = now();
    if (state.month !== utcMonth(current)) {
      state.month = utcMonth(current);
      state.monthly = { spentUsd: 0 };
    }
    if (state.day !== utcDay(current)) {
      state.day = utcDay(current);
      state.daily = { spentUsd: 0, aiRequests: 0, scannedPages: 0, users: {} };
      warned.clear();
    }
  };

  const requireHealthy = () => {
    if (!healthy) throw unavailable();
    rollOver();
  };

  const userEntry = (userId) => {
    const key = userKey(userId);
    state.daily.users[key] ??= { aiRequests: 0, scannedPages: 0, pdfImports: 0 };
    return state.daily.users[key];
  };

  const warnAtThresholds = () => {
    for (const [label, spent, budget] of [
      ["daily", state.daily.spentUsd, limits.dailyBudgetUsd],
      ["monthly", state.monthly.spentUsd, limits.monthlyBudgetUsd],
    ]) {
      for (const pct of [80, 100]) {
        const key = `${label}-${pct}-${label === "daily" ? state.day : state.month}`;
        if (spent >= (budget * pct) / 100 && !warned.has(key)) {
          warned.add(key);
          logWarn(`[server] AI ${label} budget ${pct}% used ($${spent.toFixed(4)} of $${budget.toFixed(2)})`);
        }
      }
    }
  };

  return {
    async load() {
      try {
        state = await storage.load();
        healthy = true;
        problem = null;
        rollOver();
      } catch (err) {
        state = emptyState(now()); // only used for non-AI PDF import counting while blocked
        markUnhealthy(err?.code ?? "unreadable");
      }
      return this.status();
    },

    status: () => ({ healthy, problem }),

    // Counts one AI request (Coach, Chat, Lab Insights) against the app-wide and per-user daily caps.
    async countAiRequest(userId) {
      requireHealthy();
      const user = userEntry(userId);
      if (state.daily.aiRequests >= limits.app.aiRequestsPerDay) throw new UsageLimitError(429, "app_ai_daily", MESSAGES.appAiDaily);
      if (user.aiRequests >= limits.user.aiRequestsPerDay) throw new UsageLimitError(429, "user_ai_daily", MESSAGES.userAiDaily);
      state.daily.aiRequests += 1;
      user.aiRequests += 1;
      await persistOrBlock();
    },

    // Counts one PDF import against the per-user daily cap. PDF import is mostly a non-AI feature
    // (text PDFs never reach OpenAI), so if tracking is unavailable it keeps working with in-memory
    // counts; scanned pages still need healthy tracking (reserveScannedPages).
    async countPdfImport(userId) {
      if (healthy) rollOver();
      const user = userEntry(userId);
      if (user.pdfImports >= limits.user.pdfImportsPerDay) throw new UsageLimitError(429, "user_pdf_daily", MESSAGES.userPdfImports);
      user.pdfImports += 1;
      if (healthy) await persistOrBlock().catch(() => {}); // tracking problems don't block non-AI imports
    },

    // Reserves all pages of a scanned report up front, so an import never stops halfway on a page cap.
    async reserveScannedPages(userId, pages) {
      requireHealthy();
      const user = userEntry(userId);
      if (state.daily.scannedPages + pages > limits.app.scannedPagesPerDay) throw new UsageLimitError(429, "app_pages_daily", MESSAGES.appPages);
      if (user.scannedPages + pages > limits.user.scannedPagesPerDay) throw new UsageLimitError(429, "user_pages_daily", MESSAGES.userPages);
      state.daily.scannedPages += pages;
      user.scannedPages += pages;
      await persistOrBlock();
    },

    // Reserves a call's worst-case cost against the daily and monthly budgets, and saves it before the
    // call is made — so even a crash mid-call leaves the money counted.
    async reserveSpend(usd) {
      requireHealthy();
      if (money(state.daily.spentUsd + usd) > limits.dailyBudgetUsd || money(state.monthly.spentUsd + usd) > limits.monthlyBudgetUsd) {
        throw new UsageLimitError(429, "budget", MESSAGES.budget);
      }
      state.daily.spentUsd = money(state.daily.spentUsd + usd);
      state.monthly.spentUsd = money(state.monthly.spentUsd + usd);
      const reservation = { usd, day: state.day, month: state.month };
      await persistOrBlock();
      warnAtThresholds();
      return reservation;
    },

    // Replaces a reservation with the actual cost. Never lowers a total below zero, and only adjusts
    // the day/month the money was reserved in.
    async settleSpend(reservation, actualUsd) {
      if (!healthy || actualUsd === null || actualUsd === undefined) return;
      rollOver();
      const delta = actualUsd - reservation.usd;
      if (state.day === reservation.day) state.daily.spentUsd = money(Math.max(0, state.daily.spentUsd + delta));
      if (state.month === reservation.month) state.monthly.spentUsd = money(Math.max(0, state.monthly.spentUsd + delta));
      try {
        await persist();
      } catch (err) {
        markUnhealthy(err?.code ?? "write_failed");
      }
      warnAtThresholds();
    },

    snapshot: () => JSON.parse(JSON.stringify(state)),
  };
};

// Stand-in used when no usage tracker is configured: every AI operation is refused (fail closed);
// counting PDF imports is a no-op so text-PDF import (a non-AI feature) keeps working.
export const createUnavailableTracker = () => ({
  load: async () => ({ healthy: false, problem: "not_configured" }),
  status: () => ({ healthy: false, problem: "not_configured" }),
  countAiRequest: async () => { throw unavailable(); },
  countPdfImport: async () => {},
  reserveScannedPages: async () => { throw unavailable(); },
  reserveSpend: async () => { throw unavailable(); },
  settleSpend: async () => {},
  snapshot: () => null,
});

// Wraps an OpenAI client so every chat completion is reserved at its worst-case cost before being
// sent and settled to its actual cost afterwards. Errors OpenAI answered (it returned a status) aren't
// billed, so their reservation is released; network failures/timeouts keep it, since the request may
// have been processed.
export const guardOpenai = (openai, tracker) => ({
  chat: {
    completions: {
      create: async (args) => {
        const reservation = await tracker.reserveSpend(estimateMaxCostUsd(args));
        let completion;
        try {
          completion = await openai.chat.completions.create(args);
        } catch (err) {
          if (Number.isInteger(err?.status)) await tracker.settleSpend(reservation, 0);
          throw err;
        }
        await tracker.settleSpend(reservation, actualCostUsd(args.model, completion?.usage));
        return completion;
      },
    },
  },
});
