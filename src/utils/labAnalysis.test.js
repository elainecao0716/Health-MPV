import { describe, expect, it } from "vitest";
import {
  computeLabStatus,
  computeLabTrend,
  computeTrendsWithHistory,
  latestResultPerTest,
} from "./labAnalysis";

describe("computeLabStatus", () => {
  it("returns 'No Range' when neither bound is a number", () => {
    expect(computeLabStatus(100, null, null)).toBe("No Range");
  });

  it("returns 'Low' when below the low bound", () => {
    expect(computeLabStatus(5, 10, 20)).toBe("Low");
  });

  it("returns 'High' when above the high bound", () => {
    expect(computeLabStatus(25, 10, 20)).toBe("High");
  });

  it("returns 'In Range' when within both bounds", () => {
    expect(computeLabStatus(15, 10, 20)).toBe("In Range");
  });

  it("treats the bounds themselves as in range (inclusive)", () => {
    expect(computeLabStatus(10, 10, 20)).toBe("In Range");
    expect(computeLabStatus(20, 10, 20)).toBe("In Range");
  });

  it("handles a one-sided low-only range", () => {
    expect(computeLabStatus(5, 10, null)).toBe("Low");
    expect(computeLabStatus(15, 10, null)).toBe("In Range");
  });

  it("handles a one-sided high-only range", () => {
    expect(computeLabStatus(25, null, 20)).toBe("High");
    expect(computeLabStatus(15, null, 20)).toBe("In Range");
  });
});

describe("computeLabTrend", () => {
  it("returns null for an empty entry list", () => {
    expect(computeLabTrend([])).toBeNull();
    expect(computeLabTrend(null)).toBeNull();
  });

  it("has no trend with only one result", () => {
    const trend = computeLabTrend([
      { test_date: "2024-01-01", result_value: 10, unit: "mg/dL" },
    ]);
    expect(trend.hasTrend).toBe(false);
    expect(trend.previous).toBeNull();
    expect(trend.absoluteChange).toBeNull();
  });

  it("computes direction and percent change between the two most recent same-unit results", () => {
    const trend = computeLabTrend([
      { test_date: "2024-01-01", result_value: 100, unit: "mg/dL" },
      { test_date: "2024-02-01", result_value: 120, unit: "mg/dL" },
    ]);
    expect(trend.hasTrend).toBe(true);
    expect(trend.direction).toBe("increased");
    expect(trend.absoluteChange).toBe(20);
    expect(trend.percentChange).toBe(20);
  });

  it("excludes results recorded in a different unit from the trend, never combining them", () => {
    const trend = computeLabTrend([
      { test_date: "2024-01-01", result_value: 4.0, unit: "K/uL" },
      { test_date: "2024-02-01", result_value: 4000, unit: "/uL" },
      { test_date: "2024-03-01", result_value: 4.5, unit: "K/uL" },
    ]);
    // Latest entry's unit is K/uL — only the two K/uL entries are compatible.
    expect(trend.unit).toBe("K/uL");
    expect(trend.resultCountSameUnit).toBe(2);
    expect(trend.excludedDifferentUnitCount).toBe(1);
    expect(trend.previous.result_value).toBe(4.0);
  });

  it("does not divide by zero when the previous value was zero", () => {
    const trend = computeLabTrend([
      { test_date: "2024-01-01", result_value: 0, unit: "mg/dL" },
      { test_date: "2024-02-01", result_value: 5, unit: "mg/dL" },
    ]);
    expect(trend.absoluteChange).toBe(5);
    expect(trend.percentChange).toBeNull();
  });
});

describe("computeTrendsWithHistory", () => {
  it("only includes tests that have at least two same-unit results", () => {
    const labResults = [
      { test_name: "Glucose", test_date: "2024-01-01", result_value: 90, unit: "mg/dL" },
      { test_name: "Glucose", test_date: "2024-02-01", result_value: 95, unit: "mg/dL" },
      { test_name: "Vitamin D", test_date: "2024-01-01", result_value: 30, unit: "ng/mL" },
    ];
    const trends = computeTrendsWithHistory(labResults);
    expect(trends).toHaveLength(1);
    expect(trends[0].testName).toBe("Glucose");
  });
});

describe("latestResultPerTest", () => {
  it("returns only the most recent result for each distinct test", () => {
    const labResults = [
      { test_name: "Glucose", test_date: "2024-01-01", result_value: 90 },
      { test_name: "Glucose", test_date: "2024-03-01", result_value: 100 },
      { test_name: "Glucose", test_date: "2024-02-01", result_value: 95 },
    ];
    const latest = latestResultPerTest(labResults);
    expect(latest).toHaveLength(1);
    expect(latest[0].test_date).toBe("2024-03-01");
  });
});
