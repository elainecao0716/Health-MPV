// Computes the next bulk row-selection Set after a batch delete completes. Only ids that were
// part of *this* delete attempt are touched — a successfully deleted id is dropped from the
// selection, and a failed one is (re)added so a retry targets exactly what's still there. Every
// other id already in the selection — e.g. rows selected in a different, untouched report — is
// left exactly as it was; the caller must never reset selection state wholesale after a delete.
export const updateSelectionAfterDelete = (previousSelectedIds, succeededIds, failedIds) => {
  const next = new Set(previousSelectedIds);
  for (const id of succeededIds) next.delete(id);
  for (const id of failedIds) next.add(id);
  return next;
};
