// A simple reference-range comparison, not a diagnosis.
export const computeLabStatus = (resultValue, refLow, refHigh) => {
  const hasLow = typeof refLow === "number";
  const hasHigh = typeof refHigh === "number";
  if (!hasLow && !hasHigh) return "No Range";
  if (hasLow && resultValue < refLow) return "Low";
  if (hasHigh && resultValue > refHigh) return "High";
  return "In Range";
};

// Deterministic, client-side lab calculations for the Visit Summary. Mirrors the fact
// calculations the backend performs for AI prompts (server/server.js), but runs entirely in the
// browser on the already-fetched, user-scoped labResults — no network call, nothing to invent.

// Groups lab results by exact test_name (as saved by the user).
export const groupLabResultsByTestName = (labResults) => {
  const groups = new Map();
  for (const lab of labResults) {
    if (!lab.test_name) continue;
    if (!groups.has(lab.test_name)) groups.set(lab.test_name, []);
    groups.get(lab.test_name).push(lab);
  }
  return groups;
};

// `entries` are one test's raw lab_results rows, any order. Only compares/trends entries that
// share the most recent entry's unit — results recorded in an incompatible unit are excluded
// from the trend math, never combined into it.
export const computeLabTrend = (entries) => {
  if (!entries || entries.length === 0) return null;

  const sorted = [...entries].sort((a, b) => new Date(a.test_date) - new Date(b.test_date));
  const latest = sorted[sorted.length - 1];
  const latestUnit = latest.unit ?? null;
  const compatible = sorted.filter((e) => (e.unit ?? null) === latestUnit);
  const previous = compatible.length >= 2 ? compatible[compatible.length - 2] : null;

  let absoluteChange = null;
  let percentChange = null;
  let direction = null;
  if (
    previous &&
    typeof latest.result_value === "number" &&
    typeof previous.result_value === "number"
  ) {
    absoluteChange = latest.result_value - previous.result_value;
    direction = absoluteChange > 0 ? "increased" : absoluteChange < 0 ? "decreased" : "unchanged";
    percentChange =
      previous.result_value !== 0 ? Math.round((absoluteChange / previous.result_value) * 1000) / 10 : null;
  }

  return {
    testName: latest.test_name,
    unit: latestUnit,
    latest,
    previous,
    absoluteChange,
    percentChange,
    direction,
    resultCountSameUnit: compatible.length,
    hasTrend: compatible.length >= 2,
    excludedDifferentUnitCount: sorted.length - compatible.length,
  };
};

// Returns trend facts for every distinct test that has at least two same-unit results.
export const computeTrendsWithHistory = (labResults) => {
  const groups = groupLabResultsByTestName(labResults);
  const trends = [];
  for (const entries of groups.values()) {
    const trend = computeLabTrend(entries);
    if (trend && trend.hasTrend) trends.push(trend);
  }
  return trends.sort((a, b) => new Date(b.latest.test_date) - new Date(a.latest.test_date));
};

// Returns the single most recent result for each distinct test, most recently tested first.
export const latestResultPerTest = (labResults) => {
  const groups = groupLabResultsByTestName(labResults);
  const latestList = [];
  for (const entries of groups.values()) {
    const sorted = [...entries].sort((a, b) => new Date(a.test_date) - new Date(b.test_date));
    latestList.push(sorted[sorted.length - 1]);
  }
  return latestList.sort((a, b) => new Date(b.test_date) - new Date(a.test_date));
};
