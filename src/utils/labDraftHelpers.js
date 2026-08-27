// PDF-import draft-row helpers used by ImportLabReportCard — split out of the component so they
// stay independently testable and don't break that file's Fast Refresh (a component file must
// only export components for Vite's HMR to preserve state across edits).
import { normalizeTestName } from "../data/labReferencePresets";
import {
  validateTestDate,
  validateTestName,
  validateResultValue,
  validateReferenceLow,
  validateReferenceHigh,
  validateReferenceRangeOrder,
} from "./labValidation";
import { computeLabStatus } from "./labAnalysis";

// Mirrors the manual "Save Lab Result" form's validation exactly, applied to a draft row.
export const validateDraftRow = (draft) => {
  const errors = {};
  const testDateError = validateTestDate(draft.testDate);
  if (testDateError) errors.testDate = testDateError;

  const testNameError = validateTestName(draft.testName);
  if (testNameError) errors.testName = testNameError;

  const resultValueError = validateResultValue(draft.resultValue);
  if (resultValueError) errors.resultValue = resultValueError;

  const referenceLowError = validateReferenceLow(draft.referenceLow);
  if (referenceLowError) errors.referenceLow = referenceLowError;

  const referenceHighError =
    validateReferenceHigh(draft.referenceHigh) ??
    validateReferenceRangeOrder(draft.referenceLow, draft.referenceHigh);
  if (referenceHighError) errors.referenceHigh = referenceHighError;

  return errors;
};

// Finds an already-saved lab result that looks like the same test result as this draft row
// (same normalized test name, date, numeric value, and unit) — used to warn before saving what's
// likely a duplicate, never to block it outright.
export const findDuplicate = (draft, existingLabResults) => {
  if (!draft.testDate || draft.resultValue === "") return null;
  const normalizedDraftName = normalizeTestName(draft.testName);
  const draftValue = Number(draft.resultValue);
  if (Number.isNaN(draftValue)) return null;

  return (
    existingLabResults.find(
      (l) =>
        normalizeTestName(l.test_name) === normalizedDraftName &&
        l.test_date === draft.testDate &&
        typeof l.result_value === "number" &&
        l.result_value === draftValue &&
        (l.unit ?? "") === (draft.unit ?? "")
    ) ?? null
  );
};

// An extracted abnormal flag ("High"/"Low") that contradicts the status computed from the row's
// own extracted reference range is a strong, general signal that the range extraction is wrong —
// most often because a labeled interpretive/risk-category range (e.g. "Prediabetes 5.7-6.4") was
// captured instead of the row's actual reference range. This never corrects `extractedFlag` or
// the range — it only tells the caller whether to show a "verify against the original report"
// warning during draft review. "Abnormal"/"Critical"/null flags and "No Range"/"--" statuses have
// no single clear direction to check against, so they're never flagged as a mismatch.
export const flagStatusMismatch = (extractedFlag, calculatedStatus) => {
  if (extractedFlag === "High") return calculatedStatus !== "High";
  if (extractedFlag === "Low") return calculatedStatus !== "Low";
  return false;
};

// Status computed live from a draft's own current resultValue/referenceLow/referenceHigh —
// mirrors exactly what would be saved, so every mismatch check below always reflects the row's
// present values, including any edit the user has just made.
export const computeDraftStatus = (draft) => {
  const resultNum = Number(draft.resultValue);
  if (draft.resultValue === "" || Number.isNaN(resultNum)) return "--";
  const refLowNum = draft.referenceLow === "" ? null : Number(draft.referenceLow);
  const refHighNum = draft.referenceHigh === "" ? null : Number(draft.referenceHigh);
  return computeLabStatus(resultNum, refLowNum, refHighNum);
};

// True once "Accept After Review" has been used for exactly the row's current values.
// `draft.mismatchAcceptedSnapshot` (set only by that explicit action, never automatically) is
// compared field-by-field against the row's live values — editing result/unit/either reference
// bound/flag after accepting makes the acceptance stale again (returns false) without needing to
// separately clear it from every edit handler, so an acceptance can never silently keep covering
// values it was never actually given for.
export const isMismatchAccepted = (draft) => {
  const snapshot = draft.mismatchAcceptedSnapshot;
  if (!snapshot) return false;
  return (
    snapshot.resultValue === draft.resultValue &&
    snapshot.unit === draft.unit &&
    snapshot.referenceLow === draft.referenceLow &&
    snapshot.referenceHigh === draft.referenceHigh &&
    snapshot.extractedFlag === draft.extractedFlag
  );
};

// The single source of truth for "can this row go through the normal save action right now" —
// true only while there's an unresolved, unaccepted flag/status contradiction. Never true for a
// row that was never contradictory, and never true again after an accepted row is edited.
export const isBlockedByMismatch = (draft) =>
  flagStatusMismatch(draft.extractedFlag, computeDraftStatus(draft)) && !isMismatchAccepted(draft);
