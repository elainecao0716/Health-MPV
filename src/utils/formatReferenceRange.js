// Displays a saved reference range using the same one-sided notation printed on the source lab
// report ("<37", ">90") rather than inventing a missing bound or hiding a real one-sided range
// just because only one side was ever saved. Returns null when there's no range at all, so each
// caller can supply its own contextual fallback text (e.g. "--", "not saved", or nothing).
// Display only — does not change computeLabStatus's own inclusive-bound semantics.
export const formatReferenceRange = (low, high, unit) => {
  const unitSuffix = unit ? ` ${unit}` : "";
  if (low !== null && high !== null) return `${low} - ${high}${unitSuffix}`;
  if (low !== null) return `>${low}${unitSuffix}`;
  if (high !== null) return `<${high}${unitSuffix}`;
  return null;
};
