// Groups Lab History rows into report cards for the collapsible-group UI. A report's real
// identity is its import_batch_id (one PDF import = one batch id, shared by every row it saved) —
// NOT test_date, since two distinct reports can legitimately share the same date. Rows saved
// before import_batch_id existed have none; those fall back to grouping by test_date alone (the
// previous, only-available behavior) since there's no way to retroactively tell them apart.
export const groupLabResultsByTestDate = (labResults) => {
  // Map preserves first-insertion order, which is already the correct newest-first order
  // inherited from the Supabase query (and from any filtering applied before this runs) — no
  // re-sort needed here. Prefixed so a legacy per-date bucket can never collide with a real
  // (uuid) import_batch_id.
  const groups = new Map();
  for (const lab of labResults) {
    const key = lab.import_batch_id ?? `legacy:${lab.test_date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(lab);
  }

  return [...groups.entries()].map(([key, rows]) => ({
    key,
    importBatchId: rows[0].import_batch_id ?? null,
    // Representative date for display only, not identity — a batch is expected to share one
    // test_date, so the first row's is used the same way labName/sourceFilename below pick a
    // single representative value rather than reconciling conflicts across rows.
    testDate: rows[0].test_date,
    rows,
    labName: rows.find((r) => r.lab_name && r.lab_name.trim())?.lab_name ?? null,
    sourceFilename:
      rows.find((r) => r.source_filename && r.source_filename.trim())?.source_filename ?? null,
  }));
};
