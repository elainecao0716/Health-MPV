// Builds a physician-friendly Visit Summary entirely from already-fetched, user-scoped data.
// Purely deterministic — no AI call, nothing invented, nothing beyond what's in the records.
import { computeTrendsWithHistory, latestResultPerTest } from "./labAnalysis";

const RECENT_CHECKINS_COUNT = 5;

const mostRecentWithWeight = (recordsDescByDate) =>
  recordsDescByDate.find((r) => typeof r.weight === "number") ?? null;

const earliestWithWeight = (recordsAscByDate) =>
  recordsAscByDate.find((r) => typeof r.weight === "number") ?? null;

export const buildVisitSummarySections = ({ records, checkins, labResults, savedGoal }) => {
  const sections = [];

  const recordsAsc = [...records].sort((a, b) => new Date(a.record_date) - new Date(b.record_date));
  const recordsDesc = [...recordsAsc].reverse();
  const latestWeighed = mostRecentWithWeight(recordsDesc);
  const startWeighed = earliestWithWeight(recordsAsc);

  const weights = records.map((r) => r.weight).filter((w) => typeof w === "number");
  if (weights.length > 0 && latestWeighed) {
    const average = weights.reduce((sum, w) => sum + w, 0) / weights.length;
    sections.push({
      title: "Weight Summary",
      lines: [
        `Latest weight: ${latestWeighed.weight} lbs on ${latestWeighed.record_date}`,
        startWeighed && startWeighed.record_date !== latestWeighed.record_date
          ? `Starting weight: ${startWeighed.weight} lbs on ${startWeighed.record_date}`
          : null,
        `Average weight: ${average.toFixed(1)} lbs`,
        `Highest recorded: ${Math.max(...weights)} lbs`,
        `Lowest recorded: ${Math.min(...weights)} lbs`,
        `Total weight records: ${records.length}`,
      ].filter(Boolean),
    });
  }

  if (savedGoal !== null && latestWeighed) {
    const currentWeight = latestWeighed.weight;
    const poundsRemaining = currentWeight - savedGoal;
    const overallChange = startWeighed ? currentWeight - startWeighed.weight : null;

    let progressPercent = null;
    if (startWeighed) {
      const totalToChange = startWeighed.weight - savedGoal;
      if (totalToChange === 0) {
        progressPercent = currentWeight === savedGoal ? 100 : 0;
      } else {
        const changedSoFar = startWeighed.weight - currentWeight;
        progressPercent = Math.max(0, Math.min(100, (changedSoFar / totalToChange) * 100));
      }
    }

    sections.push({
      title: "Weight Goal Progress",
      lines: [
        `Saved goal weight: ${savedGoal} lbs`,
        `Current weight: ${currentWeight} lbs`,
        `Pounds remaining to goal: ${poundsRemaining.toFixed(1)} lbs`,
        overallChange !== null
          ? `Overall change since first record: ${overallChange > 0 ? "+" : ""}${overallChange.toFixed(1)} lbs`
          : null,
        progressPercent !== null ? `Progress toward goal: ${progressPercent.toFixed(0)}%` : null,
      ].filter(Boolean),
    });
  }

  if (checkins.length > 0) {
    const recent = [...checkins]
      .sort((a, b) => new Date(b.checkin_date) - new Date(a.checkin_date))
      .slice(0, RECENT_CHECKINS_COUNT);
    sections.push({
      title: "Recent Daily Check-Ins",
      lines: recent.map((c) => {
        const parts = [c.checkin_date];
        if (typeof c.sleep_hours === "number") parts.push(`Sleep ${c.sleep_hours} hrs`);
        if (typeof c.water_cups === "number") parts.push(`Water ${c.water_cups} cups`);
        if (typeof c.exercise_minutes === "number") parts.push(`Exercise ${c.exercise_minutes} min`);
        if (c.mood) parts.push(`Mood ${c.mood}`);
        return parts.join(" — ");
      }),
    });
  }

  if (labResults.length > 0) {
    const latestPerTest = latestResultPerTest(labResults);
    sections.push({
      title: "Latest Lab Results",
      lines: latestPerTest.map((l) => {
        const range =
          l.reference_low !== null && l.reference_high !== null
            ? ` (saved range ${l.reference_low}-${l.reference_high}${l.unit ? ` ${l.unit}` : ""})`
            : "";
        return `${l.test_name}: ${l.result_value}${l.unit ? ` ${l.unit}` : ""}${range} — ${l.status} on ${l.test_date}`;
      }),
    });

    const outOfRange = [...labResults]
      .filter((l) => l.status === "Low" || l.status === "High")
      .sort((a, b) => new Date(b.test_date) - new Date(a.test_date));
    if (outOfRange.length > 0) {
      sections.push({
        title: "Out-of-Range Lab Results",
        lines: outOfRange.map((l) => {
          const range =
            l.reference_low !== null && l.reference_high !== null
              ? `${l.reference_low}-${l.reference_high}${l.unit ? ` ${l.unit}` : ""}`
              : "not saved";
          return `${l.test_name}: ${l.result_value}${l.unit ? ` ${l.unit}` : ""} — ${l.status} (saved range ${range}) on ${l.test_date}`;
        }),
      });
    }

    const trends = computeTrendsWithHistory(labResults);
    if (trends.length > 0) {
      sections.push({
        title: "Lab Trends (2+ results, same unit)",
        lines: trends.map((t) => {
          const unitLabel = t.unit ? ` ${t.unit}` : "";
          const changeText =
            t.absoluteChange === null
              ? "no numeric change available"
              : `${t.direction} by ${Math.abs(t.absoluteChange)}${unitLabel}` +
                (t.percentChange !== null ? ` (${t.percentChange > 0 ? "+" : ""}${t.percentChange}%)` : "");
          return (
            `${t.testName}: ${t.previous.result_value}${unitLabel} on ${t.previous.test_date} → ` +
            `${t.latest.result_value}${unitLabel} on ${t.latest.test_date} (${changeText})`
          );
        }),
      });
    }
  }

  // User-entered free text, kept as its own section and explicitly labeled so it is never
  // mistaken for a calculated observation above.
  const noteLines = [];
  for (const r of records) {
    if (r.notes && r.notes.trim()) {
      noteLines.push(`User note — health record (${r.record_date}): "${r.notes.trim()}"`);
    }
  }
  for (const c of checkins) {
    if (c.notes && c.notes.trim()) {
      noteLines.push(`User note — check-in (${c.checkin_date}): "${c.notes.trim()}"`);
    }
  }
  for (const l of labResults) {
    if (l.notes && l.notes.trim()) {
      noteLines.push(`User note — ${l.test_name} lab result (${l.test_date}): "${l.notes.trim()}"`);
    }
  }
  if (noteLines.length > 0) {
    sections.push({ title: "User-Entered Notes", lines: noteLines });
  }

  // Templated questions built only from data already shown above — nothing invented.
  const questions = [];
  const outOfRangeForQuestions = [...labResults].filter((l) => l.status === "Low" || l.status === "High");
  for (const l of outOfRangeForQuestions.slice(0, 5)) {
    questions.push(
      `What might explain the ${l.test_name} result of ${l.result_value}${l.unit ? ` ${l.unit}` : ""} ` +
        `(${l.status}) from ${l.test_date}?`
    );
  }
  if (savedGoal !== null) {
    questions.push("How does my recorded progress toward my saved goal weight look?");
  }
  const trendsForQuestions = computeTrendsWithHistory(labResults);
  for (const t of trendsForQuestions.slice(0, 3)) {
    if (t.direction && t.direction !== "unchanged") {
      questions.push(`Is the ${t.direction} trend in my ${t.testName} results worth discussing?`);
    }
  }
  if (questions.length === 0 && (records.length > 0 || checkins.length > 0 || labResults.length > 0)) {
    questions.push("Are there any patterns in my recorded data I should be aware of?");
  }
  if (questions.length > 0) {
    sections.push({ title: "Questions to Discuss at the Appointment", lines: questions });
  }

  return sections;
};

export const visitSummaryToPlainText = (sections, generatedAtLabel) => {
  const lines = [`Visit Summary — Generated ${generatedAtLabel}`, ""];
  for (const section of sections) {
    lines.push(section.title);
    lines.push("-".repeat(section.title.length));
    for (const line of section.lines) lines.push(`- ${line}`);
    lines.push("");
  }
  return lines.join("\n").trim();
};
