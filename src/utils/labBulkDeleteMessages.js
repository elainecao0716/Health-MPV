// Confirmation copy for the two lab bulk-delete entry points in the Report Library — the
// per-report "Delete" button (deletes every row in a report) and "Delete Selected" within an
// expanded report (deletes only the checked rows). Both share one delete implementation in
// App.jsx; only the wording differs, based on whether this delete targets a whole report.
// isWholeReport defaults to false so an existing "Delete Selected" call site's wording is
// untouched unless it explicitly opts in.
export const buildBulkDeleteConfirmMessage = (count, dateRangeText, isWholeReport = false) =>
  isWholeReport
    ? `Delete this entire report and all ${count} lab result(s) in it (dated ${dateRangeText})? This cannot be undone.`
    : `Delete ${count} lab result(s) dated ${dateRangeText}? This cannot be undone.`;

export const buildBulkDeleteLargeBatchPromptMessage = (count, dateRangeText, isWholeReport = false) =>
  isWholeReport
    ? `You are about to permanently delete this entire report and all ${count} lab results in it ` +
      `(${dateRangeText}). This cannot be undone. Type DELETE to confirm.`
    : `You are about to permanently delete ${count} lab results (${dateRangeText}). ` +
      `This is a large batch and cannot be undone. Type DELETE to confirm.`;
