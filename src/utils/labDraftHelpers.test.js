import { describe, expect, it } from "vitest";
import {
  validateDraftRow,
  findDuplicate,
  flagStatusMismatch,
  computeDraftStatus,
  isMismatchAccepted,
  isBlockedByMismatch,
} from "./labDraftHelpers";

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

describe("flagStatusMismatch", () => {
  it("flags a mismatch when the report says High but the extracted range computes In Range (the A1C bug)", () => {
    expect(flagStatusMismatch("High", "In Range")).toBe(true);
  });

  it("flags a mismatch when the report says Low but the extracted range computes In Range", () => {
    expect(flagStatusMismatch("Low", "In Range")).toBe(true);
  });

  it("does not flag when the flag and computed status agree", () => {
    expect(flagStatusMismatch("High", "High")).toBe(false);
    expect(flagStatusMismatch("Low", "Low")).toBe(false);
  });

  it("flags a mismatch when the flag and computed status point in opposite directions", () => {
    expect(flagStatusMismatch("High", "Low")).toBe(true);
    expect(flagStatusMismatch("Low", "High")).toBe(true);
  });

  it("never flags Abnormal/Critical/null flags — no single clear direction to check", () => {
    expect(flagStatusMismatch("Abnormal", "In Range")).toBe(false);
    expect(flagStatusMismatch("Critical", "In Range")).toBe(false);
    expect(flagStatusMismatch(null, "In Range")).toBe(false);
    expect(flagStatusMismatch(undefined, "High")).toBe(false);
  });

  it("still flags a High/Low report against a No-Range computed status — the range may have failed to extract at all", () => {
    expect(flagStatusMismatch("High", "No Range")).toBe(true);
    expect(flagStatusMismatch("Low", "No Range")).toBe(true);
  });

  it("never flags when there's no extracted flag to begin with, regardless of computed status", () => {
    expect(flagStatusMismatch(null, "No Range")).toBe(false);
    expect(flagStatusMismatch(null, "--")).toBe(false);
  });
});

describe("computeDraftStatus", () => {
  it("computes status from the draft's own current numeric fields", () => {
    expect(computeDraftStatus({ resultValue: "95", referenceLow: "70", referenceHigh: "99" })).toBe("In Range");
    expect(computeDraftStatus({ resultValue: "150", referenceLow: "70", referenceHigh: "99" })).toBe("High");
  });

  it("supports single-sided ranges", () => {
    expect(computeDraftStatus({ resultValue: "95", referenceLow: "49", referenceHigh: "" })).toBe("In Range");
    expect(computeDraftStatus({ resultValue: "154", referenceLow: "", referenceHigh: "100" })).toBe("High");
    expect(computeDraftStatus({ resultValue: "85", referenceLow: "90", referenceHigh: "" })).toBe("Low");
  });

  it("returns '--' when there's no numeric result yet, and 'No Range' when there's a result but no range", () => {
    expect(computeDraftStatus({ resultValue: "", referenceLow: "", referenceHigh: "" })).toBe("--");
    expect(computeDraftStatus({ resultValue: "abc", referenceLow: "", referenceHigh: "" })).toBe("--");
    expect(computeDraftStatus({ resultValue: "5.8", referenceLow: "", referenceHigh: "" })).toBe("No Range");
  });
});

// A draft factory matching the real shape ImportLabReportCard builds (all numeric fields are
// strings, matching how form inputs hold them) — used for the required-review model tests below.
const draft = (overrides) => ({
  id: "draft-1",
  resultValue: "5.8",
  unit: "%",
  referenceLow: "",
  referenceHigh: "",
  extractedFlag: null,
  mismatchAcceptedSnapshot: null,
  ...overrides,
});

describe("required-review model — isMismatchAccepted / isBlockedByMismatch", () => {
  it("incorrect range, correct flag (the A1C direction): High flag, range wrongly computes In Range — blocked", () => {
    const d = draft({ resultValue: "5.8", referenceLow: "5.7", referenceHigh: "6.4", extractedFlag: "High" });
    expect(computeDraftStatus(d)).toBe("In Range");
    expect(isBlockedByMismatch(d)).toBe(true);
  });

  it("correct range, incorrect flag (the HDL direction): High flag on a row whose correct range computes In Range — blocked", () => {
    const d = draft({ resultValue: "95", referenceLow: "49", referenceHigh: "", extractedFlag: "High" });
    expect(computeDraftStatus(d)).toBe("In Range");
    expect(isBlockedByMismatch(d)).toBe(true);
  });

  it("rows without a mismatch are never blocked and never need acceptance — unchanged existing workflow", () => {
    const normal = draft({ resultValue: "95", referenceLow: "70", referenceHigh: "99", extractedFlag: null });
    expect(isBlockedByMismatch(normal)).toBe(false);
    expect(isMismatchAccepted(normal)).toBe(false);

    const correctlyFlagged = draft({ resultValue: "150", referenceLow: "70", referenceHigh: "99", extractedFlag: "High" });
    expect(isBlockedByMismatch(correctlyFlagged)).toBe(false);
  });

  it("editing a value to resolve the contradiction clears the block automatically, with no explicit acceptance needed", () => {
    const before = draft({ resultValue: "5.8", referenceLow: "5.7", referenceHigh: "6.4", extractedFlag: "High" });
    expect(isBlockedByMismatch(before)).toBe(true);

    // User corrects referenceHigh to match the real lab range — the same edit a human would make
    // after comparing against the source report.
    const afterEdit = { ...before, referenceHigh: "5.6" };
    expect(computeDraftStatus(afterEdit)).toBe("High");
    expect(isBlockedByMismatch(afterEdit)).toBe(false);
  });

  it('"Accept After Review" permits import when the contradiction is intentionally left in place', () => {
    const before = draft({ resultValue: "5.8", referenceLow: "5.7", referenceHigh: "6.4", extractedFlag: "High" });
    expect(isBlockedByMismatch(before)).toBe(true);

    // Accepting takes a snapshot of exactly the current values — this is what the "Accept After
    // Review" action does, never an automatic correction of resultValue/referenceLow/referenceHigh/extractedFlag.
    const accepted = {
      ...before,
      mismatchAcceptedSnapshot: {
        resultValue: before.resultValue,
        unit: before.unit,
        referenceLow: before.referenceLow,
        referenceHigh: before.referenceHigh,
        extractedFlag: before.extractedFlag,
      },
    };
    expect(before.resultValue).toBe(accepted.resultValue);
    expect(before.referenceLow).toBe(accepted.referenceLow);
    expect(before.referenceHigh).toBe(accepted.referenceHigh);
    expect(before.extractedFlag).toBe(accepted.extractedFlag);
    expect(flagStatusMismatch(accepted.extractedFlag, computeDraftStatus(accepted))).toBe(true); // contradiction still there
    expect(isMismatchAccepted(accepted)).toBe(true);
    expect(isBlockedByMismatch(accepted)).toBe(false); // but no longer blocked
  });

  it("an accepted row becomes blocked again if edited afterward — an acceptance can never silently cover different values", () => {
    const accepted = draft({
      resultValue: "5.8",
      referenceLow: "5.7",
      referenceHigh: "6.4",
      extractedFlag: "High",
      mismatchAcceptedSnapshot: { resultValue: "5.8", unit: "%", referenceLow: "5.7", referenceHigh: "6.4", extractedFlag: "High" },
    });
    expect(isMismatchAccepted(accepted)).toBe(true);
    expect(isBlockedByMismatch(accepted)).toBe(false);

    const editedAfterAccepting = { ...accepted, referenceHigh: "6.5" };
    expect(isMismatchAccepted(editedAfterAccepting)).toBe(false);
    expect(isBlockedByMismatch(editedAfterAccepting)).toBe(true);
  });

  it("correcting the flag itself (not the range) resolves the mismatch automatically, without touching result/range", () => {
    // The HDL case: range was always correct, only the flag was wrong.
    const before = draft({ resultValue: "95", referenceLow: "49", referenceHigh: "", extractedFlag: "High" });
    expect(isBlockedByMismatch(before)).toBe(true);

    const flagCorrected = { ...before, extractedFlag: null };
    expect(flagCorrected.resultValue).toBe(before.resultValue);
    expect(flagCorrected.referenceLow).toBe(before.referenceLow);
    expect(flagCorrected.referenceHigh).toBe(before.referenceHigh);
    expect(isBlockedByMismatch(flagCorrected)).toBe(false);
  });

  // Full High/Low truth table, agreed with the user — each test uses concrete draft numbers (range
  // 70-99) rather than the abstract flagStatusMismatch(flag, status) calls already covered above,
  // so these exercise the same isBlockedByMismatch/computeDraftStatus pipeline the app actually uses.
  it("scenario 1: extracted High, calculated High — allowed", () => {
    const d = draft({ resultValue: "150", referenceLow: "70", referenceHigh: "99", extractedFlag: "High" });
    expect(computeDraftStatus(d)).toBe("High");
    expect(isBlockedByMismatch(d)).toBe(false);
  });

  it("scenario 2a: No flag, calculated High — allowed (absence of a flag is never a contradiction)", () => {
    const d = draft({ resultValue: "150", referenceLow: "70", referenceHigh: "99", extractedFlag: null });
    expect(computeDraftStatus(d)).toBe("High");
    expect(isBlockedByMismatch(d)).toBe(false);
  });

  it("scenario 2b: No flag, calculated Low — allowed (absence of a flag is never a contradiction)", () => {
    const d = draft({ resultValue: "50", referenceLow: "70", referenceHigh: "99", extractedFlag: null });
    expect(computeDraftStatus(d)).toBe("Low");
    expect(isBlockedByMismatch(d)).toBe(false);
  });

  it("scenario 3 (revised): calculated High, extracted Low — blocked", () => {
    const d = draft({ resultValue: "150", referenceLow: "70", referenceHigh: "99", extractedFlag: "Low" });
    expect(computeDraftStatus(d)).toBe("High");
    expect(isBlockedByMismatch(d)).toBe(true);
  });

  it("scenario 4: extracted High, calculated In Range — blocked", () => {
    const d = draft({ resultValue: "95", referenceLow: "70", referenceHigh: "99", extractedFlag: "High" });
    expect(computeDraftStatus(d)).toBe("In Range");
    expect(isBlockedByMismatch(d)).toBe(true);
  });

  it("scenario 5: extracted Low, calculated Low — allowed", () => {
    const d = draft({ resultValue: "50", referenceLow: "70", referenceHigh: "99", extractedFlag: "Low" });
    expect(computeDraftStatus(d)).toBe("Low");
    expect(isBlockedByMismatch(d)).toBe(false);
  });

  it("scenario 6: extracted Low, calculated In Range — blocked", () => {
    const d = draft({ resultValue: "95", referenceLow: "70", referenceHigh: "99", extractedFlag: "Low" });
    expect(computeDraftStatus(d)).toBe("In Range");
    expect(isBlockedByMismatch(d)).toBe(true);
  });

  it("scenario 7: extracted High, calculated Low — blocked (opposite-direction pairing, mirrors scenario 3)", () => {
    const d = draft({ resultValue: "50", referenceLow: "70", referenceHigh: "99", extractedFlag: "High" });
    expect(computeDraftStatus(d)).toBe("Low");
    expect(isBlockedByMismatch(d)).toBe(true);
  });

  it("Abnormal/Critical flags are never treated as a directional contradiction, regardless of computed status — confirms existing behavior is unchanged by this test work", () => {
    const abnormalHigh = draft({ resultValue: "150", referenceLow: "70", referenceHigh: "99", extractedFlag: "Abnormal" });
    const criticalLow = draft({ resultValue: "50", referenceLow: "70", referenceHigh: "99", extractedFlag: "Critical" });
    expect(isBlockedByMismatch(abnormalHigh)).toBe(false);
    expect(isBlockedByMismatch(criticalLow)).toBe(false);
  });
});
