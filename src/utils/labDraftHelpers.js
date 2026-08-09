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
