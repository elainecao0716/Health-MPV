import { describe, expect, it } from "vitest";
import { validateDraftRow, findDuplicate } from "./labDraftHelpers";

const validDraft = {
  testDate: "2024-01-01",
  testName: "Glucose",
  resultValue: "95",
  referenceLow: "70",
  referenceHigh: "99",
};

describe("validateDraftRow", () => {
  it("returns no errors for a fully valid draft row", () => {
    expect(validateDraftRow(validDraft)).toEqual({});
  });

  it("reports each missing/invalid field independently", () => {
    const errors = validateDraftRow({
      testDate: "",
      testName: "",
      resultValue: "abc",
      referenceLow: "abc",
      referenceHigh: "abc",
    });
    expect(errors.testDate).toBeDefined();
    expect(errors.testName).toBeDefined();
    expect(errors.resultValue).toBeDefined();
    expect(errors.referenceLow).toBeDefined();
    expect(errors.referenceHigh).toBeDefined();
  });

  it("allows a one-sided reference range (only low, or only high)", () => {
    expect(validateDraftRow({ ...validDraft, referenceHigh: "" })).toEqual({});
    expect(validateDraftRow({ ...validDraft, referenceLow: "" })).toEqual({});
  });

  it("flags a reference range where low is greater than high", () => {
    const errors = validateDraftRow({ ...validDraft, referenceLow: "100", referenceHigh: "50" });
    expect(errors.referenceHigh).toBe("Reference low cannot be greater than reference high.");
  });
});

describe("findDuplicate", () => {
  const existing = [
    { test_name: "Glucose", test_date: "2024-01-01", result_value: 95, unit: "mg/dL" },
  ];

  it("finds a duplicate matching test name (case/whitespace-insensitive), date, value, and unit", () => {
    const draft = { testDate: "2024-01-01", testName: "  glucose ", resultValue: "95", unit: "mg/dL" };
    expect(findDuplicate(draft, existing)).toBe(existing[0]);
  });

  it("does not flag a different value as a duplicate", () => {
    const draft = { testDate: "2024-01-01", testName: "Glucose", resultValue: "100", unit: "mg/dL" };
    expect(findDuplicate(draft, existing)).toBeNull();
  });

  it("does not flag a different unit as a duplicate, even with the same value/date", () => {
    const draft = { testDate: "2024-01-01", testName: "Glucose", resultValue: "95", unit: "mmol/L" };
    expect(findDuplicate(draft, existing)).toBeNull();
  });

  it("returns null when the draft has no date or result value yet", () => {
    expect(findDuplicate({ testDate: "", testName: "Glucose", resultValue: "95" }, existing)).toBeNull();
    expect(findDuplicate({ testDate: "2024-01-01", testName: "Glucose", resultValue: "" }, existing)).toBeNull();
  });
});
