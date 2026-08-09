import { describe, expect, it } from "vitest";
import {
  validateTestDate,
  validateTestName,
  validateResultValue,
  validateReferenceLow,
  validateReferenceHigh,
  validateReferenceRangeOrder,
} from "./labValidation";

describe("validateTestDate", () => {
  it("requires a date", () => {
    expect(validateTestDate("")).toBe("Test date is required.");
    expect(validateTestDate(undefined)).toBe("Test date is required.");
  });

  it("accepts any non-empty date", () => {
    expect(validateTestDate("2024-01-01")).toBeNull();
  });
});

describe("validateTestName", () => {
  it("rejects empty or whitespace-only names", () => {
    expect(validateTestName("")).toBe("Test name is required.");
    expect(validateTestName("   ")).toBe("Test name is required.");
  });

  it("accepts a real name", () => {
    expect(validateTestName("Glucose")).toBeNull();
  });
});

describe("validateResultValue", () => {
  it("requires a numeric value", () => {
    expect(validateResultValue("")).toBe("Result must be numeric.");
    expect(validateResultValue("abc")).toBe("Result must be numeric.");
  });

  it("accepts numbers including negative/decimal", () => {
    expect(validateResultValue("95")).toBeNull();
    expect(validateResultValue("-1.5")).toBeNull();
  });
});

describe("validateReferenceLow / validateReferenceHigh", () => {
  it("allows a blank bound (one-sided or absent ranges are valid)", () => {
    expect(validateReferenceLow("")).toBeNull();
    expect(validateReferenceHigh("")).toBeNull();
  });

  it("rejects a non-numeric bound", () => {
    expect(validateReferenceLow("abc")).toBe("Reference low must be numeric.");
    expect(validateReferenceHigh("abc")).toBe("Reference high must be numeric.");
  });
});

describe("validateReferenceRangeOrder", () => {
  it("is silent when either bound is blank (one-sided ranges are valid)", () => {
    expect(validateReferenceRangeOrder("", "100")).toBeNull();
    expect(validateReferenceRangeOrder("10", "")).toBeNull();
  });

  it("flags a low bound greater than the high bound", () => {
    expect(validateReferenceRangeOrder("100", "10")).toBe(
      "Reference low cannot be greater than reference high."
    );
  });

  it("allows a valid ascending range", () => {
    expect(validateReferenceRangeOrder("10", "100")).toBeNull();
  });
});
