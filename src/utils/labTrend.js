// Lab Trend chart data selection — picks which of a test's saved results belong on the chart
// together, and the unit to display/label them with. Display/matching logic only: never writes
// back to a lab result, never changes what's stored or shown on its report card.

// Two units are compatible for the same chart if either is blank/missing, or they're the same
// once whitespace and case differences are ignored (e.g. "MG/DL" and "mg/dl" are the same unit
// written two ways). Two units that are both present and genuinely different (e.g. "mg/dL" vs
// "mmol/L") are never combined — that protection is unchanged.
const normalizeUnit = (unit) => {
  const trimmed = (unit ?? "").trim();
  return trimmed === "" ? null : trimmed.toLowerCase();
};

// `entries` is every saved result for one test name, newest-first (as labResults already is).
export const selectLabTrendSeries = (entries) => {
  // The most recent entry that actually recorded a unit, so the chart's label isn't blank just
  // because the latest result happens to be missing one while an older result has it.
  const displayUnit = entries.find((l) => normalizeUnit(l.unit) !== null)?.unit ?? null;
  const displayUnitNormalized = normalizeUnit(displayUnit);

  const compatibleEntries = entries.filter((l) => {
    const entryUnitNormalized = normalizeUnit(l.unit);
    return (
      entryUnitNormalized === null ||
      displayUnitNormalized === null ||
      entryUnitNormalized === displayUnitNormalized
    );
  });

  const dataPoints = [...compatibleEntries].sort(
    (a, b) => new Date(a.test_date) - new Date(b.test_date)
  );

  const referenceLow =
    compatibleEntries.find((l) => typeof l.reference_low === "number")?.reference_low ?? null;
  const referenceHigh =
    compatibleEntries.find((l) => typeof l.reference_high === "number")?.reference_high ?? null;

  return { unit: displayUnit, dataPoints, referenceLow, referenceHigh };
};
