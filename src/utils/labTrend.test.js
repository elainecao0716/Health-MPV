import { describe, expect, it } from "vitest";
import { selectLabTrendSeries } from "./labTrend";

const lab = (overrides) => ({
  id: "id",
  test_date: "2026-07-20",
  test_name: "Glucose",
  result_value: 96,
  unit: "mg/dL",
  reference_low: null,
  reference_high: null,
  ...overrides,
});

describe("selectLabTrendSeries", () => {
  it("includes a unit-less entry alongside a unit-bearing entry for the same test (the reported bug)", () => {
    const entries = [
      lab({ id: "2", test_date: "2026-07-20", unit: "MG/DL", result_value: 96 }),
      lab({ id: "1", test_date: "2026-07-14", unit: null, result_value: 123 }),
    ];
    const series = selectLabTrendSeries(entries);
    expect(series.dataPoints).toHaveLength(2);
    expect(series.dataPoints.map((d) => d.id)).toEqual(["1", "2"]);
  });

  it("treats units differing only in case/whitespace as the same unit", () => {
    const entries = [
      lab({ id: "1", unit: "  MG/DL  " }),
      lab({ id: "2", unit: "mg/dl" }),
    ];
    const series = selectLabTrendSeries(entries);
    expect(series.dataPoints).toHaveLength(2);
  });

  it("still excludes a genuinely different unit (mg/dL vs mmol/L)", () => {
    const entries = [
      lab({ id: "1", unit: "mg/dL" }),
      lab({ id: "2", unit: "mmol/L" }),
    ];
    const series = selectLabTrendSeries(entries);
    expect(series.dataPoints).toHaveLength(1);
    expect(series.dataPoints[0].id).toBe("1");
  });

  it("uses the most recent entry that has a unit as the display unit, even if a more recent entry lacks one", () => {
    const entries = [
      lab({ id: "2", test_date: "2026-07-20", unit: null }),
      lab({ id: "1", test_date: "2026-07-14", unit: "mg/dL" }),
    ];
    const series = selectLabTrendSeries(entries);
    expect(series.unit).toBe("mg/dL");
    expect(series.dataPoints).toHaveLength(2);
  });

  it("returns a null display unit only when every entry lacks one", () => {
    const entries = [lab({ id: "1", unit: null }), lab({ id: "2", unit: "" })];
    const series = selectLabTrendSeries(entries);
    expect(series.unit).toBeNull();
    expect(series.dataPoints).toHaveLength(2);
  });

  it("treats a blank/whitespace-only unit the same as a missing one", () => {
    const entries = [lab({ id: "1", unit: "   " }), lab({ id: "2", unit: "mg/dL" })];
    const series = selectLabTrendSeries(entries);
    expect(series.dataPoints).toHaveLength(2);
    expect(series.unit).toBe("mg/dL");
  });

  it("sorts dataPoints by test_date ascending regardless of input order", () => {
    const entries = [
      lab({ id: "b", test_date: "2026-07-20" }),
      lab({ id: "a", test_date: "2026-07-14" }),
      lab({ id: "c", test_date: "2026-08-01" }),
    ];
    const series = selectLabTrendSeries(entries);
    expect(series.dataPoints.map((d) => d.id)).toEqual(["a", "b", "c"]);
  });

  it("picks reference_low/high from the first compatible entry that has numeric values", () => {
    const entries = [
      lab({ id: "1", reference_low: null, reference_high: null }),
      lab({ id: "2", reference_low: 70, reference_high: 100 }),
    ];
    const series = selectLabTrendSeries(entries);
    expect(series.referenceLow).toBe(70);
    expect(series.referenceHigh).toBe(100);
  });

  it("returns null reference_low/high when no compatible entry has numeric values", () => {
    const entries = [lab({ id: "1", reference_low: null, reference_high: null })];
    const series = selectLabTrendSeries(entries);
    expect(series.referenceLow).toBeNull();
    expect(series.referenceHigh).toBeNull();
  });

  it("returns empty results for an empty input", () => {
    const series = selectLabTrendSeries([]);
    expect(series).toEqual({ unit: null, dataPoints: [], referenceLow: null, referenceHigh: null });
  });
});
