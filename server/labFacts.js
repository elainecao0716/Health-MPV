// Deterministic lab-fact calculations handed to the AI prompts in server.js. Pure logic with no
// Express/OpenAI/env dependencies, so it can be unit-tested directly.

// Number of digits after the decimal point in a value's shortest JS string form, e.g. 5.7 -> 1,
// 1.003 -> 3, 95 -> 0. Returns null for exponent notation (e.g. 1e-7), where it can't be read
// off reliably.
const countDecimals = (value) => {
  const text = String(value);
  if (/e/i.test(text)) return null;
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
};

// latest - previous, without floating-point subtraction noise (5.7 - 5.4 is 0.2999999999999998
// in raw JS). The exact difference of two values with at most d decimals has at most d decimals,
// so rounding to d removes only the noise: it never drops a real digit and never turns a real
// difference into 0. There's no fixed decimal limit — precision comes from the values themselves.
// Falls back to the raw difference if either value is in exponent notation.
export const subtractLabValues = (latest, previous) => {
  const difference = latest - previous;
  const latestDecimals = countDecimals(latest);
  const previousDecimals = countDecimals(previous);
  if (latestDecimals === null || previousDecimals === null) return difference;
  return Number(difference.toFixed(Math.max(latestDecimals, previousDecimals)));
};

// `entries` must be one test's results, already sorted oldest -> newest (summarizeLabResults
// guarantees this). Deterministically computes every fact the AI is allowed to describe, so the
// model never has to (and never should) do this math itself. Only compares/trends entries that
// share the latest entry's unit — results recorded in an incompatible unit are excluded from the
// trend math and counted separately, never combined into it.
export const computeLabFacts = (entries) => {
  if (!entries || entries.length === 0) return null;

  const latest = entries[entries.length - 1];
  const latestUnit = latest.unit ?? null;
  const compatible = entries.filter((e) => (e.unit ?? null) === latestUnit);
  const previous = compatible.length >= 2 ? compatible[compatible.length - 2] : null;

  const values = compatible.map((e) => e.result_value).filter((v) => typeof v === "number");
  const highestValue = values.length ? Math.max(...values) : null;
  const lowestValue = values.length ? Math.min(...values) : null;

  let absoluteChange = null;
  let percentChange = null;
  let direction = null;
  if (
    previous &&
    typeof latest.result_value === "number" &&
    typeof previous.result_value === "number"
  ) {
    const rawChange = latest.result_value - previous.result_value;
    // Only the reported absolute_change is cleaned up; direction and percent_change keep using
    // the raw difference exactly as before, so neither of them changes.
    absoluteChange = subtractLabValues(latest.result_value, previous.result_value);
    direction = rawChange > 0 ? "increased" : rawChange < 0 ? "decreased" : "unchanged";
    // Percent change is only mathematically valid when the previous value isn't zero.
    percentChange =
      previous.result_value !== 0 ? Math.round((rawChange / previous.result_value) * 1000) / 10 : null;
  }

  const hasLow = typeof latest.reference_low === "number";
  const hasHigh = typeof latest.reference_high === "number";
  let latestRangeStatus = "No Range";
  if (hasLow && typeof latest.result_value === "number" && latest.result_value < latest.reference_low) {
    latestRangeStatus = "Low";
  } else if (hasHigh && typeof latest.result_value === "number" && latest.result_value > latest.reference_high) {
    latestRangeStatus = "High";
  } else if (hasLow || hasHigh) {
    latestRangeStatus = "In Range";
  }

  return {
    test_name: latest.test_name,
    category: latest.category ?? null,
    unit: latestUnit,
    latest_date: latest.date,
    latest_value: latest.result_value,
    reference_low: latest.reference_low,
    reference_high: latest.reference_high,
    latest_range_status: latestRangeStatus, // "Low" | "High" | "In Range" | "No Range"
    previous_date: previous?.date ?? null,
    previous_value: previous?.result_value ?? null,
    absolute_change: absoluteChange,
    percent_change: percentChange, // null when there's no previous result or previous value is 0
    direction, // "increased" | "decreased" | "unchanged" | null
    highest_value: highestValue,
    lowest_value: lowestValue,
    result_count_same_unit: compatible.length,
    total_result_count: entries.length,
    excluded_different_unit_count: entries.length - compatible.length,
    has_trend: compatible.length >= 2,
  };
};
