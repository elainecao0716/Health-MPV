// Shared field-level rules for a lab-result entry — used by both the manual "Save Lab Result"
// form (src/App.jsx) and the PDF-import draft review screen (ImportLabReportCard.jsx). Both
// enforce exactly the same rules; each just reports the result in its own shape (a single
// combined message vs. a per-field errors object), so this only extracts the rule logic itself,
// not either caller's return contract.
const isBlank = (value) => value === undefined || value === null || value === "";

export const validateTestDate = (date) => (isBlank(date) ? "Test date is required." : null);

export const validateTestName = (name) =>
  isBlank(name) || !String(name).trim() ? "Test name is required." : null;

export const validateResultValue = (value) =>
  isBlank(value) || Number.isNaN(Number(value)) ? "Result must be numeric." : null;

export const validateReferenceLow = (value) =>
  !isBlank(value) && Number.isNaN(Number(value)) ? "Reference low must be numeric." : null;

export const validateReferenceHigh = (value) =>
  !isBlank(value) && Number.isNaN(Number(value)) ? "Reference high must be numeric." : null;

// Only meaningful once both bounds are present and individually numeric — returns null
// otherwise so callers can freely run this alongside the two checks above.
export const validateReferenceRangeOrder = (low, high) => {
  if (isBlank(low) || isBlank(high)) return null;
  if (Number.isNaN(Number(low)) || Number.isNaN(Number(high))) return null;
  return Number(low) > Number(high) ? "Reference low cannot be greater than reference high." : null;
};
