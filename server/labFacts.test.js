import { describe, expect, it } from "vitest";
import { computeLabFacts, subtractLabValues } from "./labFacts.js";

// Shaped like summarizeLabResults() output in server.js, oldest -> newest.
const entry = (date, result_value, overrides = {}) => ({
  date,
  test_name: "Glucose",
  category: "Metabolic",
  result_value,
  unit: "mg/dL",
  reference_low: 70,
  reference_high: 99,
  status: null,
  lab_name: null,
  notes: "",
  ...overrides,
});

// Matches the leftover digits of a floating-point artifact, e.g. 0.2999999999999998 or
// 0.20000000000000018.
const FLOAT_NOISE = /\d\.\d*(9{6,}|0{6,})\d/;

describe("subtractLabValues", () => {
  it("removes floating-point noise from common lab-value differences", () => {
    // Raw JS gives 0.2999999999999998, 0.20000000000000018, 0.3000000000000007,
    // 0.0029999999999998916, 0.19999999999999998.
    expect(subtractLabValues(5.7, 5.4)).toBe(0.3);
    expect(subtractLabValues(7.3, 7.1)).toBe(0.2);
    expect(subtractLabValues(13.5, 13.2)).toBe(0.3);
    expect(subtractLabValues(1.003, 1)).toBe(0.003);
    expect(subtractLabValues(0.3, 0.1)).toBe(0.2);
  });

  it("keeps the sign of decreases", () => {
    expect(subtractLabValues(5.4, 5.7)).toBe(-0.3);
    expect(subtractLabValues(1, 1.003)).toBe(-0.003);
    expect(subtractLabValues(95, 123)).toBe(-28);
  });

  it("never rounds a small but real difference to zero", () => {
    expect(subtractLabValues(1.00003, 1.00001)).toBe(0.00002);
    expect(subtractLabValues(0.000002, 0.000001)).toBe(0.000001);
    expect(subtractLabValues(1000.003, 1000)).toBe(0.003);
    expect(subtractLabValues(1.00001, 1.00003)).toBe(-0.00002);
  });

  it("uses the more precise operand's decimal places, not a fixed limit", () => {
    expect(subtractLabValues(5.25, 5.1)).toBe(0.15);
    expect(subtractLabValues(4.123456, 4.1)).toBe(0.023456);
  });

  it("leaves exact differences unchanged", () => {
    expect(subtractLabValues(123, 95)).toBe(28);
    expect(subtractLabValues(5.5, 5)).toBe(0.5);
    expect(subtractLabValues(5.7, 5.7)).toBe(0);
    expect(subtractLabValues(0, 0)).toBe(0);
    expect(subtractLabValues(2.5, 0)).toBe(2.5);
    expect(subtractLabValues(-1.2, -1.5)).toBe(0.3);
  });

  it("falls back to the raw difference for exponent-notation values", () => {
    expect(subtractLabValues(3e-7, 1e-7)).toBe(3e-7 - 1e-7);
  });
});

describe("computeLabFacts absolute_change precision", () => {
  it("reports a clean absolute_change with no floating-point artifacts", () => {
    const facts = computeLabFacts([entry("2026-01-01", 5.4), entry("2026-04-01", 5.7)]);

    expect(facts.absolute_change).toBe(0.3);
    expect(facts.direction).toBe("increased");
    expect(JSON.stringify(facts)).not.toMatch(FLOAT_NOISE);
  });

  it("reports negative changes as decreases with a clean value", () => {
    const facts = computeLabFacts([entry("2026-01-01", 13.5), entry("2026-04-01", 13.2)]);

    expect(facts.absolute_change).toBe(-0.3);
    expect(facts.direction).toBe("decreased");
    expect(facts.percent_change).toBe(-2.2);
  });

  it("keeps a tiny real change non-zero and consistent with direction", () => {
    const facts = computeLabFacts([entry("2026-01-01", 1.00001), entry("2026-04-01", 1.00003)]);

    expect(facts.absolute_change).toBe(0.00002);
    expect(facts.absolute_change).not.toBe(0);
    expect(facts.direction).toBe("increased");
  });

  it("reports unchanged results as exactly zero", () => {
    const facts = computeLabFacts([entry("2026-01-01", 5.7), entry("2026-04-01", 5.7)]);

    expect(facts.absolute_change).toBe(0);
    expect(facts.direction).toBe("unchanged");
    expect(facts.percent_change).toBe(0);
  });

  it("preserves original lab values, ranges, units, and status exactly", () => {
    const facts = computeLabFacts([
      entry("2026-01-01", 1.003, { unit: "mmol/L", reference_low: 0.875, reference_high: 1.125 }),
      entry("2026-02-01", 0.9875, { unit: "mmol/L", reference_low: 0.875, reference_high: 1.125 }),
      entry("2026-04-01", 1.00347, { unit: "mmol/L", reference_low: 0.875, reference_high: 1.125 }),
    ]);

    expect(facts.latest_value).toBe(1.00347);
    expect(facts.previous_value).toBe(0.9875);
    expect(facts.highest_value).toBe(1.00347);
    expect(facts.lowest_value).toBe(0.9875);
    expect(facts.reference_low).toBe(0.875);
    expect(facts.reference_high).toBe(1.125);
    expect(facts.unit).toBe("mmol/L");
    expect(facts.latest_range_status).toBe("In Range");
    expect(facts.absolute_change).toBe(0.01597);
  });

  it("computes percent_change and direction from the unrounded difference, as before", () => {
    const facts = computeLabFacts([entry("2026-01-01", 1000), entry("2026-04-01", 1000.003)]);

    expect(facts.absolute_change).toBe(0.003);
    expect(facts.direction).toBe("increased");
    expect(facts.percent_change).toBe(Math.round(((1000.003 - 1000) / 1000) * 1000) / 10);
  });

  // At exact rounding midpoints, computing percent_change from the cleaned-up absolute_change
  // instead of the raw difference would flip the rounding. These pin the original outputs.
  it("keeps the original percent_change at rounding midpoints (11.2 -> 3.5)", () => {
    const facts = computeLabFacts([entry("2026-01-01", 11.2), entry("2026-04-01", 3.5)]);

    expect(facts.absolute_change).toBe(-7.7);
    expect(facts.percent_change).toBe(-68.7);
    expect(facts.direction).toBe("decreased");
  });

  it("keeps the original percent_change at rounding midpoints (200 -> 200.1)", () => {
    const facts = computeLabFacts([entry("2026-01-01", 200), entry("2026-04-01", 200.1)]);

    expect(facts.absolute_change).toBe(0.1);
    expect(facts.percent_change).toBe(0);
    expect(facts.direction).toBe("increased");
  });
});

describe("computeLabFacts edge cases", () => {
  it("returns null for no entries", () => {
    expect(computeLabFacts([])).toBeNull();
    expect(computeLabFacts(undefined)).toBeNull();
  });

  it("has no change or trend with a single result", () => {
    const facts = computeLabFacts([entry("2026-04-01", 5.7)]);

    expect(facts.absolute_change).toBeNull();
    expect(facts.percent_change).toBeNull();
    expect(facts.direction).toBeNull();
    expect(facts.has_trend).toBe(false);
  });

  it("reports percent_change as null when the previous value is zero", () => {
    const facts = computeLabFacts([entry("2026-01-01", 0), entry("2026-04-01", 0.3)]);

    expect(facts.absolute_change).toBe(0.3);
    expect(facts.percent_change).toBeNull();
    expect(facts.direction).toBe("increased");
  });

  it("excludes different-unit results from the change calculation", () => {
    const facts = computeLabFacts([
      entry("2026-01-01", 5.4, { unit: "mmol/L" }),
      entry("2026-02-01", 98.2),
      entry("2026-04-01", 101.3),
    ]);

    expect(facts.previous_value).toBe(98.2);
    expect(facts.absolute_change).toBe(3.1);
    expect(facts.excluded_different_unit_count).toBe(1);
    expect(facts.result_count_same_unit).toBe(2);
  });

  it("has no change when the latest or previous value isn't numeric", () => {
    const facts = computeLabFacts([entry("2026-01-01", null), entry("2026-04-01", 5.7)]);

    expect(facts.absolute_change).toBeNull();
    expect(facts.direction).toBeNull();
    expect(facts.has_trend).toBe(true);
  });
});
