import { describe, expect, it } from "vitest";
import {
  findLabPreset,
  getPresetDefaultUnit,
  getPresetRangeForUnit,
  normalizeTestName,
} from "./labReferencePresets";

describe("normalizeTestName", () => {
  it("lowercases, trims, and collapses internal whitespace", () => {
    expect(normalizeTestName("  Vitamin   D ")).toBe("vitamin d");
  });

  it("handles null/undefined without throwing", () => {
    expect(normalizeTestName(null)).toBe("");
    expect(normalizeTestName(undefined)).toBe("");
  });
});

describe("findLabPreset", () => {
  it("matches by exact canonical name, case-insensitively", () => {
    expect(findLabPreset("glucose")?.canonicalName).toBe("Glucose");
    expect(findLabPreset("GLUCOSE")?.canonicalName).toBe("Glucose");
  });

  it("matches by any alias", () => {
    expect(findLabPreset("hba1c")?.canonicalName).toBe("HbA1c");
    expect(findLabPreset("hemoglobin a1c")?.canonicalName).toBe("HbA1c");
  });

  it("returns null for a name with no preset", () => {
    expect(findLabPreset("Some Unlisted Test")).toBeNull();
  });

  it("returns null for blank input", () => {
    expect(findLabPreset("")).toBeNull();
    expect(findLabPreset(null)).toBeNull();
  });
});

describe("getPresetDefaultUnit / getPresetRangeForUnit", () => {
  it("returns the first declared unit as the default", () => {
    const preset = findLabPreset("glucose");
    expect(getPresetDefaultUnit(preset)).toBe("mg/dL");
  });

  it("returns null when there is no preset", () => {
    expect(getPresetDefaultUnit(null)).toBeNull();
  });

  it("returns the range for a unit the preset actually declares", () => {
    const preset = findLabPreset("glucose");
    expect(getPresetRangeForUnit(preset, "mg/dL")).toEqual({ low: 70, high: 99 });
  });

  it("returns null for a unit the preset doesn't declare (never guesses a conversion)", () => {
    const preset = findLabPreset("glucose");
    expect(getPresetRangeForUnit(preset, "mmol/L")).toBeNull();
  });
});
