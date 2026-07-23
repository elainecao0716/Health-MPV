import "dotenv/config";
import express from "express";
import cors from "cors";
import OpenAI from "openai";

const PORT = process.env.PORT || 4000;
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || "http://localhost:5173";
const MAX_RECORDS = 90; // cap payload/prompt size sent to OpenAI
const MAX_CHECKINS = 60; // cap payload/prompt size sent to OpenAI
const MAX_LAB_RESULTS = 90; // cap payload/prompt size sent to OpenAI
const MAX_CHAT_MESSAGES = 20; // only forward the most recent turns to OpenAI
const MAX_MESSAGE_LENGTH = 2000;

const SAFETY_INSTRUCTIONS =
  "Safety rules: provide general wellness and tracking information only. Do not diagnose medical " +
  "conditions. Do not prescribe medication or treatment. Do not state guaranteed conclusions about cause " +
  "and effect between sleep, hydration, exercise, mood, and weight — describe possible patterns cautiously, " +
  "since many factors can be involved. For lab results: never diagnose, never claim a laboratory value proves " +
  "a medical condition, never recommend starting, stopping, or changing medication, and explain trends and " +
  "reference ranges in plain language, noting that reference ranges can differ by lab. Clearly state " +
  "uncertainty when you're not sure. Encourage the user to consult a licensed clinician about abnormal or " +
  "concerning lab results. If the user describes urgent or severe symptoms, or a critically abnormal lab " +
  "value, tell them to seek prompt professional or emergency medical evaluation. Keep answers supportive, " +
  "concise, and based only on the records provided. If a saved goal weight is provided, you may discuss " +
  "progress toward it using the given data, but never promise a timeline or specific date for reaching it, " +
  "and never recommend rapid or unsafe weight-loss methods.";

// Only construct the client when a key is present so a missing key doesn't
// crash the server at startup; /api/coach reports a clear error instead.
const openai = process.env.OPENAI_API_KEY
  ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  : null;

if (!openai) {
  console.warn(
    "[server] Warning: OPENAI_API_KEY is not set. Add it to server/.env before calling /api/coach."
  );
}

const app = express();
app.use(cors({ origin: CLIENT_ORIGIN }));
app.use(express.json({ limit: "1mb" }));

// Only forwards the fields the model needs, oldest first, capped to keep the prompt small.
const summarizeRecords = (records) =>
  [...records]
    .sort((a, b) => new Date(a.record_date) - new Date(b.record_date))
    .slice(-MAX_RECORDS)
    .map((r) => ({
      date: r.record_date ?? null,
      weight: typeof r.weight === "number" ? r.weight : null,
      notes: typeof r.notes === "string" ? r.notes.slice(0, 300) : "",
    }));

const recordsContext = (summary) =>
  summary.length === 0
    ? "The user has no health records yet."
    : `Here are the user's health records (oldest to newest, JSON):\n${JSON.stringify(summary)}`;

const goalContext = (goalWeight) =>
  typeof goalWeight === "number" && Number.isFinite(goalWeight) && goalWeight > 0
    ? `The user's saved goal weight is ${goalWeight} lbs.`
    : "The user has not saved a goal weight.";

// Only forwards the fields the model needs, oldest first, capped to keep the prompt small.
const summarizeCheckins = (checkins) =>
  [...checkins]
    .sort((a, b) => new Date(a.checkin_date) - new Date(b.checkin_date))
    .slice(-MAX_CHECKINS)
    .map((c) => ({
      date: c.checkin_date ?? null,
      sleep_hours: typeof c.sleep_hours === "number" ? c.sleep_hours : null,
      water_cups: typeof c.water_cups === "number" ? c.water_cups : null,
      exercise_minutes: typeof c.exercise_minutes === "number" ? c.exercise_minutes : null,
      mood: typeof c.mood === "string" ? c.mood : null,
      notes: typeof c.notes === "string" ? c.notes.slice(0, 300) : "",
    }));

const checkinsContext = (summary) =>
  summary.length === 0
    ? "The user has no daily check-ins yet."
    : `Here are the user's recent daily check-ins — sleep, water, exercise, mood, notes ` +
      `(oldest to newest, JSON):\n${JSON.stringify(summary)}`;

// Only forwards the fields the model needs, oldest first, capped to keep the prompt small.
const summarizeLabResults = (labResults) =>
  [...labResults]
    .sort((a, b) => new Date(a.test_date) - new Date(b.test_date))
    .slice(-MAX_LAB_RESULTS)
    .map((l) => ({
      date: l.test_date ?? null,
      test_name: l.test_name ?? null,
      category: l.category ?? null,
      result_value: typeof l.result_value === "number" ? l.result_value : null,
      unit: l.unit ?? null,
      reference_low: typeof l.reference_low === "number" ? l.reference_low : null,
      reference_high: typeof l.reference_high === "number" ? l.reference_high : null,
      status: l.status ?? null,
      lab_name: l.lab_name ?? null,
      notes: typeof l.notes === "string" ? l.notes.slice(0, 300) : "",
    }));

const labResultsContext = (summary) =>
  summary.length === 0
    ? "The user has no lab results yet."
    : `Here are the user's recent lab results — test name, date, result, unit, reference range, and a ` +
      `simple reference-range status (not a diagnosis) (oldest to newest, JSON):\n${JSON.stringify(summary)}`;

// Logs only status/message, never the raw error object or request body —
// keeps the API key and user note contents out of the terminal.
const logError = (label, err) => {
  console.error(`[server] ${label}:`, err?.status ?? "", err?.message ?? String(err));
};

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.post("/api/coach", async (req, res) => {
  const { records, goalWeight, checkins, labResults } = req.body ?? {};

  if (!Array.isArray(records)) {
    return res.status(400).json({ error: "'records' must be an array." });
  }

  // Optional fields — old clients that don't send them still work, just without that context.
  const checkinsArr = Array.isArray(checkins) ? checkins : [];
  const labResultsArr = Array.isArray(labResults) ? labResults : [];

  if (!openai) {
    return res
      .status(500)
      .json({ error: "Server is missing OPENAI_API_KEY. Set it in server/.env and restart." });
  }

  try {
    const summary = summarizeRecords(records);
    const checkinSummary = summarizeCheckins(checkinsArr);
    const labSummary = summarizeLabResults(labResultsArr);
    console.log(
      `[server] POST /api/coach — ${summary.length} record(s), ${checkinSummary.length} check-in(s), ` +
        `${labSummary.length} lab result(s), goal: ${goalWeight ?? "none"}`
    );

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content:
            "You are a supportive, encouraging AI health coach inside a personal weight-tracking app called Health MPV. " +
            "You are not a doctor. Given a user's health records (date, weight, notes), recent daily check-ins (sleep, " +
            "water, exercise, mood, notes), recent lab results (test name, date, result, unit, reference range, status), " +
            "and an optional saved goal weight, identify trends, celebrate progress, gently flag any concerning " +
            "patterns, and suggest 2-4 concrete, actionable next steps. You may discuss general patterns involving " +
            "sleep, hydration, exercise, mood, and weight, but never state guaranteed conclusions about cause and " +
            "effect — describe possible patterns cautiously, since many factors can be involved. For lab results: " +
            "never diagnose, never claim a value proves a medical condition, never recommend starting, stopping, or " +
            "changing medication, explain trends and reference ranges in plain language, and mention that reference " +
            "ranges can differ by lab. If a goal weight is provided, you may discuss progress toward it using the " +
            "given data, but never promise a timeline or specific date for reaching it, and never recommend rapid or " +
            "unsafe weight-loss methods. Encourage the user to consult a licensed clinician about abnormal or " +
            "concerning lab results. If the user describes urgent or severe symptoms, or a critically abnormal lab " +
            "value, tell them to seek prompt professional or emergency medical evaluation. Keep the tone warm and " +
            "non-judgmental. Respond in short paragraphs and/or a brief bullet list, under 220 words, and end with a " +
            "one-line reminder that this is not medical advice.",
        },
        {
          role: "user",
          content:
            (summary.length === 0
              ? "The user has no health records yet. Encourage them to log their first entry."
              : `Here are my health records (oldest to newest, JSON):\n${JSON.stringify(summary)}`) +
            `\n\n${goalContext(goalWeight)}\n\n${checkinsContext(checkinSummary)}\n\n${labResultsContext(labSummary)}`,
        },
      ],
    });

    const advice = completion.choices[0]?.message?.content?.trim();

    if (!advice) {
      return res.status(502).json({ error: "OpenAI returned an empty response." });
    }

    res.json({ advice });
  } catch (err) {
    logError("/api/coach failed", err);
    res.status(500).json({ error: "Failed to generate advice. Please try again." });
  }
});

app.post("/api/chat", async (req, res) => {
  const { messages, records, goalWeight, checkins, labResults } = req.body ?? {};

  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: "'messages' must be an array." });
  }

  if (!Array.isArray(records)) {
    return res.status(400).json({ error: "'records' must be an array." });
  }

  // Optional fields — old clients that don't send them still work, just without that context.
  const checkinsArr = Array.isArray(checkins) ? checkins : [];
  const labResultsArr = Array.isArray(labResults) ? labResults : [];

  const validRoles = new Set(["user", "assistant"]);
  const isValidMessage = (m) =>
    m &&
    typeof m === "object" &&
    validRoles.has(m.role) &&
    typeof m.content === "string" &&
    m.content.trim().length > 0;

  if (!messages.every(isValidMessage)) {
    return res
      .status(400)
      .json({ error: "Each message must have role 'user' or 'assistant' and non-empty string content." });
  }

  if (!openai) {
    return res
      .status(500)
      .json({ error: "Server is missing OPENAI_API_KEY. Set it in server/.env and restart." });
  }

  try {
    const summary = summarizeRecords(records);
    const checkinSummary = summarizeCheckins(checkinsArr);
    const labSummary = summarizeLabResults(labResultsArr);

    // Only forward the most recent turns, trimmed, to keep the prompt bounded.
    const history = messages.slice(-MAX_CHAT_MESSAGES).map((m) => ({
      role: m.role,
      content: m.content.slice(0, MAX_MESSAGE_LENGTH),
    }));

    console.log(
      `[server] POST /api/chat — ${history.length} message(s), ${summary.length} record(s), ` +
        `${checkinSummary.length} check-in(s), ${labSummary.length} lab result(s), goal: ${goalWeight ?? "none"}`
    );

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0.4,
      max_tokens: 400,
      messages: [
        {
          role: "system",
          content:
            "You are a supportive AI health coach chatting inside a personal weight-tracking app called Health MPV. " +
            "You may discuss general patterns involving sleep, hydration, exercise, mood, weight, and lab results " +
            "(such as comparing recent results, describing trends, or identifying which recent results fell outside " +
            `their reference range) using the data provided. ${SAFETY_INSTRUCTIONS} ${recordsContext(summary)} ` +
            `${goalContext(goalWeight)} ${checkinsContext(checkinSummary)} ${labResultsContext(labSummary)}`,
        },
        ...history,
      ],
    });

    const reply = completion.choices[0]?.message?.content?.trim();

    if (!reply) {
      return res.status(502).json({ error: "OpenAI returned an empty response." });
    }

    res.json({ reply });
  } catch (err) {
    logError("/api/chat failed", err);
    res.status(500).json({ error: "Failed to generate a reply. Please try again." });
  }
});

app.listen(PORT, () => {
  console.log(`[server] AI Health Coach backend running on http://localhost:${PORT}`);
});
