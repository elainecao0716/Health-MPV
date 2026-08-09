import { memo, useEffect, useRef, useState } from "react";
import { computeLabStatus } from "../utils/labAnalysis";
import { supabase } from "../supabase";
import { validateDraftRow, findDuplicate } from "../utils/labDraftHelpers";
import { rememberImportedFilename } from "../utils/importedReportFilenames";

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const LAB_CATEGORIES = ["CBC", "Metabolic", "Vitamins", "Lipids", "Thyroid", "Glucose", "Iron", "Other"];

const formatBytes = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const draftFromServerRow = (row) => ({
  id: row.id,
  // Low-confidence OCR rows are unselected by default; everything else defaults selected.
  selected: row.confidence !== "Low",
  originalLabel: row.originalLabel,
  testName: row.testName ?? "",
  category: row.category ?? "",
  testDate: row.testDate ?? "",
  resultValue: typeof row.resultValue === "number" ? String(row.resultValue) : "",
  unit: row.unit ?? "",
  referenceLow: typeof row.referenceLow === "number" ? String(row.referenceLow) : "",
  referenceHigh: typeof row.referenceHigh === "number" ? String(row.referenceHigh) : "",
  rangeSource: row.rangeSource, // "extracted" | null (set to "preset"/"custom" locally as the user edits)
  suggestedRange: row.suggestedRange,
  extractedFlag: row.extractedFlag,
  labName: row.labName ?? "",
  notes: row.notes ?? "",
  confidence: row.confidence,
  ocrDerived: row.ocrDerived,
  sourcePage: row.sourcePage,
});

function ImportLabReportCard({ labResults, currentUser, onImported, onDraftStateChange, onViewImportedReport }) {
  const fileInputRef = useRef(null);

  const [file, setFile] = useState(null);
  // Display-only copy of the chosen file's name — kept alongside `file` but, unlike `file`, never
  // released once every row is saved, so the "Filename" summary field stays accurate instead of
  // falling back to "--" the moment the underlying File blob is freed.
  const [fileName, setFileName] = useState(null);
  const [fileError, setFileError] = useState(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const [uploading, setUploading] = useState(false);
  const [extractError, setExtractError] = useState(null);
  const [importResult, setImportResult] = useState(null); // { status, pageCount, reportMeta, warnings, extractedCount }

  const [drafts, setDrafts] = useState([]);
  const [expandedDuplicateIds, setExpandedDuplicateIds] = useState(() => new Set());
  const [dismissedDuplicateIds, setDismissedDuplicateIds] = useState(() => new Set());

  // One id per extraction, shared by every row this batch saves — this (not test_date) is a
  // report's real identity, since two distinct reports can share the same date. Regenerated
  // whenever a fresh set of drafts is extracted (including re-extracting the same file).
  const [importBatchId, setImportBatchId] = useState(null);
  // Acknowledges the "this looks like an already-imported report" banner below — required before
  // saving is allowed once that banner is showing, so a duplicate report is never created silently.
  const [duplicateReportAcknowledged, setDuplicateReportAcknowledged] = useState(false);

  const [saving, setSaving] = useState(false);
  const [saveSummary, setSaveSummary] = useState(null); // { succeeded, failed, total, failedDetails }
  const [saveBlockedMessage, setSaveBlockedMessage] = useState(null);

  // Collapsed by default — the upload/review workflow is hidden behind a compact header until
  // the user opens it, and auto-collapses again once a save fully succeeds.
  const [importSectionExpanded, setImportSectionExpanded] = useState(false);

  // Report "has an unsaved draft" up to App so it can warn before sign-out discards it — drafts
  // only ever exist in this component's local state until "Save Selected Results" is clicked.
  useEffect(() => {
    onDraftStateChange?.(drafts.length > 0);
  }, [drafts, onDraftStateChange]);

  const resetAll = () => {
    setFile(null);
    setFileName(null);
    setFileError(null);
    setIsDragActive(false);
    setUploading(false);
    setExtractError(null);
    setImportResult(null);
    setDrafts([]);
    setExpandedDuplicateIds(new Set());
    setDismissedDuplicateIds(new Set());
    setImportBatchId(null);
    setDuplicateReportAcknowledged(false);
    setSaving(false);
    setSaveSummary(null);
    setSaveBlockedMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const validateFile = (candidate) => {
    const nameOk = typeof candidate.name === "string" && candidate.name.toLowerCase().endsWith(".pdf");
    const typeOk = candidate.type === "" || candidate.type === "application/pdf";
    if (!nameOk || !typeOk) return "Please choose a PDF file.";
    if (candidate.size === 0) return "The selected file is empty.";
    if (candidate.size > MAX_PDF_BYTES) return "File exceeds the maximum size of 10 MB.";
    return null;
  };

  const handleFileChosen = (candidate) => {
    if (!candidate) return;
    setImportResult(null);
    setExtractError(null);
    setDrafts([]);
    setSaveSummary(null);

    const validationError = validateFile(candidate);
    if (validationError) {
      setFile(null);
      setFileName(null);
      setFileError(validationError);
      return;
    }
    setFile(candidate);
    setFileName(candidate.name);
    setFileError(null);
  };

  const handleClearFile = () => {
    resetAll();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragActive(false);
    const dropped = e.dataTransfer?.files?.[0];
    if (dropped) handleFileChosen(dropped);
  };

  const handleExtract = async () => {
    if (!file) return;
    setUploading(true);
    setExtractError(null);
    setSaveSummary(null);

    try {
      const formData = new FormData();
      formData.append("file", file, file.name);

      const response = await fetch("/api/labs/import-pdf", { method: "POST", body: formData });

      let data = null;
      try {
        data = await response.json();
      } catch {
        throw new Error(`Could not reach the AI Health Coach server (status ${response.status}).`);
      }

      if (!response.ok) {
        throw new Error(data?.error || `Server error (status ${response.status}).`);
      }

      const extractedRows = data.draftRows ?? [];
      setImportResult({
        status: data.status,
        pageCount: data.pageCount,
        reportMeta: data.reportMeta,
        warnings: data.warnings ?? [],
        // Fixed at extraction time, unlike drafts.length — stays accurate as rows are edited,
        // removed, or saved out of the draft list rather than shrinking to 0 once review is done.
        extractedCount: extractedRows.length,
      });
      setDrafts(extractedRows.map(draftFromServerRow));
      // A fresh id per extraction — this is the report identity every row from this batch will
      // save with, regardless of what test_date(s) end up on the rows.
      setImportBatchId(crypto.randomUUID());
      setDuplicateReportAcknowledged(false);
    } catch (err) {
      const message =
        err instanceof TypeError
          ? "Unable to reach the AI Health Coach server. Make sure the backend is running on port 4000."
          : err.message || "Something went wrong. Please try again.";
      console.error("[ImportLabReportCard] /api/labs/import-pdf request failed:", message);
      setExtractError(message);
    } finally {
      setUploading(false);
    }
  };

  const updateDraft = (id, patch) => {
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  };

  const handleUnitChange = (id, value) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        // Changing the unit away from what an applied preset range assumed would make that range
        // incompatible — clear it rather than leave a mismatched unit/range pair in place. An
        // extracted (report-sourced) range is left alone; only preset-derived ranges are cleared.
        if (d.rangeSource === "preset") {
          return { ...d, unit: value, referenceLow: "", referenceHigh: "", rangeSource: null };
        }
        return { ...d, unit: value };
      })
    );
  };

  const handleRangeFieldChange = (id, field, value) => {
    setDrafts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, [field]: value, rangeSource: "custom" } : d))
    );
  };

  const handleUseSuggestedRange = (id) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.id !== id || !d.suggestedRange) return d;
        return {
          ...d,
          referenceLow: String(d.suggestedRange.low),
          referenceHigh: String(d.suggestedRange.high),
          rangeSource: "preset",
        };
      })
    );
  };

  const handleRemoveRow = (id) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
  };

  const handleSelectAll = () => setDrafts((prev) => prev.map((d) => ({ ...d, selected: true })));
  const handleSelectNone = () => setDrafts((prev) => prev.map((d) => ({ ...d, selected: false })));
  const handleRemoveUnselected = () => setDrafts((prev) => prev.filter((d) => d.selected));

  // The draft rows already carry whatever the extractor determined per row (including OCR
  // fallbacks) — that's the same value that will actually be saved, and a more reliable source
  // than importResult.reportMeta.labName alone, which only reflects a single separate top-level
  // reading that can come back empty even when every row was correctly labeled. Falling back to
  // reportMeta.labName only matters if every row is somehow missing one too.
  const detectedLabName = drafts.find((d) => d.labName)?.labName || importResult?.reportMeta?.labName || null;

  // Report-level (not per-row) duplicate signal — findDuplicate below already flags individual
  // rows that match an already-saved result, but it's easy to click through several of those
  // one-at-a-time warnings without registering that the whole PDF was already imported. If most of
  // this batch already matches, that's what's actually happening — surfaced as one unmissable
  // banner instead, requiring explicit acknowledgment before this can be saved as a new report.
  const duplicateDraftCount = drafts.filter((d) => findDuplicate(d, labResults)).length;
  const likelyDuplicateReport = drafts.length >= 3 && duplicateDraftCount / drafts.length >= 0.8;

  const handleApplyDetectedDate = () => {
    const detectedDate = importResult?.reportMeta?.collectionDate ?? importResult?.reportMeta?.reportDate;
    if (!detectedDate) return;
    setDrafts((prev) => prev.map((d) => (d.testDate ? d : { ...d, testDate: detectedDate })));
  };

  const handleApplyDetectedLabName = () => {
    if (!detectedLabName) return;
    setDrafts((prev) => prev.map((d) => (d.labName ? d : { ...d, labName: detectedLabName })));
  };

  const handleBulkUseSuggestedRange = () => {
    // Only fills rows that have no extracted/custom range at all — never overwrites one.
    setDrafts((prev) =>
      prev.map((d) => {
        const hasRange = d.referenceLow !== "" || d.referenceHigh !== "";
        if (hasRange || !d.suggestedRange) return d;
        return {
          ...d,
          referenceLow: String(d.suggestedRange.low),
          referenceHigh: String(d.suggestedRange.high),
          rangeSource: "preset",
        };
      })
    );
  };

  const handleClearDraft = () => {
    resetAll();
  };

  const toggleDuplicateExpanded = (id) => {
    setExpandedDuplicateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const dismissDuplicate = (id) => {
    setDismissedDuplicateIds((prev) => new Set(prev).add(id));
  };

  const skipDuplicate = (id) => {
    updateDraft(id, { selected: false });
    dismissDuplicate(id);
  };

  const handleSaveSelected = async () => {
    setSaveBlockedMessage(null);
    setSaveSummary(null);

    const selectedRows = drafts.filter((d) => d.selected);
    if (selectedRows.length === 0) {
      setSaveBlockedMessage("Select at least one row to save.");
      return;
    }

    const invalidRows = selectedRows.filter((d) => Object.keys(validateDraftRow(d)).length > 0);
    if (invalidRows.length > 0) {
      setSaveBlockedMessage(
        `Fix the validation errors on ${invalidRows.length} selected row(s) before saving — nothing has been saved yet.`
      );
      return;
    }

    // Belt-and-suspenders alongside the disabled Save button — this is what actually stops the
    // save from happening, the disabled attribute is just the visible affordance for it.
    if (likelyDuplicateReport && !duplicateReportAcknowledged) {
      setSaveBlockedMessage(
        "This looks like a duplicate of a report you've already imported — check \"import this as a new " +
          "report anyway\" above before saving, or clear the draft if you didn't mean to re-import it."
      );
      return;
    }

    setSaving(true);

    const outcomes = [];
    for (const draft of selectedRows) {
      const resultNum = Number(draft.resultValue);
      const refLowNum = draft.referenceLow === "" ? null : Number(draft.referenceLow);
      const refHighNum = draft.referenceHigh === "" ? null : Number(draft.referenceHigh);

      const { error } = await supabase.from("lab_results").insert([
        {
          user_id: currentUser.id,
          test_date: draft.testDate,
          test_name: draft.testName.trim(),
          category: draft.category === "" ? null : draft.category,
          result_value: resultNum,
          unit: draft.unit === "" ? null : draft.unit,
          reference_low: refLowNum,
          reference_high: refHighNum,
          status: computeLabStatus(resultNum, refLowNum, refHighNum),
          lab_name: draft.labName === "" ? null : draft.labName,
          notes: draft.notes === "" ? null : draft.notes,
          source_filename: fileName ?? null,
          import_batch_id: importBatchId,
        },
      ]);

      outcomes.push({ id: draft.id, ok: !error, error: error?.message ?? null });
    }

    const succeededIds = new Set(outcomes.filter((o) => o.ok).map((o) => o.id));
    const failed = outcomes.filter((o) => !o.ok);

    // Only drop rows that actually saved — anything that failed (or wasn't selected) stays in the draft.
    const remainingDrafts = drafts.filter((d) => !succeededIds.has(d.id));
    setDrafts(remainingDrafts);
    setSaveSummary({
      succeeded: succeededIds.size,
      failed: failed.length,
      total: outcomes.length,
      failedDetails: failed,
      // For "View Imported Report" — the report Lab History should jump to and expand is this
      // whole batch's own id, not its test_date (two reports can share a date).
      importBatchId,
    });
    setSaving(false);

    // Once every row has been saved (or removed) there's nothing left to review — release the
    // original PDF from memory. fileName/importResult/reportMeta are kept: they're small, and
    // still give useful context (filename, page count, detected lab) alongside the "N of N saved"
    // message, instead of the summary silently reverting to "--"/"Not detected".
    if (remainingDrafts.length === 0) {
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }

    // A fully successful save has nothing left to review — collapse the upload/review workflow
    // back down to the compact header. A partial failure leaves rows to retry, so stays open.
    if (failed.length === 0) {
      setImportSectionExpanded(false);
      // The saved rows carry their own source_filename now — this local mirror is just a fallback
      // for rows saved before that column existed, or if a row's column value is ever missing.
      rememberImportedFilename(currentUser.id, selectedRows[0]?.testDate ?? null, fileName);
    }

    if (succeededIds.size > 0 && onImported) {
      await onImported();
    }
  };

  const openFilePicker = () => fileInputRef.current?.click();

  return (
    <div className="section import-lab-card">
      <button
        type="button"
        onClick={() => setImportSectionExpanded((prev) => !prev)}
        aria-expanded={importSectionExpanded}
        aria-controls="import-lab-report-content"
        className="import-section-toggle heading-records"
      >
        <span aria-hidden="true">📄</span> Import Lab Report{" "}
        <span aria-hidden="true" className="import-section-caret">
          {importSectionExpanded ? "▼" : "▶"}
        </span>
      </button>

      <div id="import-lab-report-content">
        {importSectionExpanded && (
          <>
      <p className="hint-text">
        Upload a PDF lab report to create editable draft results — nothing is saved until you review
        and approve it.
      </p>
      <p className="hint-text import-privacy-notice">
        Your uploaded report is processed only to create editable draft results. Review every value
        before saving.
      </p>

      <div
        className={`import-dropzone section ${isDragActive ? "import-dropzone-active" : ""}`}
        role="group"
        aria-label="Upload PDF lab report"
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragActive(true);
        }}
        onDragLeave={() => setIsDragActive(false)}
        onDrop={handleDrop}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,.pdf"
          onChange={(e) => handleFileChosen(e.target.files?.[0] ?? null)}
          aria-label="Choose a PDF lab report file"
          className="import-file-input"
        />

        {!file && (
          <>
            <p className="hint-text">Drag and drop a PDF here, or</p>
            <button type="button" onClick={openFilePicker} className="btn btn-chip">
              Choose PDF
            </button>
          </>
        )}

        {file && (
          <div className="import-file-info">
            <div>
              <strong>{file.name}</strong>
              <span className="hint-text"> — {formatBytes(file.size)}</span>
            </div>
            <div className="goal-actions">
              <button
                type="button"
                onClick={handleExtract}
                disabled={uploading}
                aria-busy={uploading}
                className="btn btn-ai"
              >
                {uploading ? "Extracting..." : "Extract Lab Results"}
              </button>
              <button type="button" onClick={handleClearFile} disabled={uploading} className="btn btn-cancel">
                Clear File
              </button>
            </div>
          </div>
        )}
      </div>

      {fileError && (
        <p role="alert" aria-live="assertive" className="message message-error">
          {fileError}
        </p>
      )}
      {uploading && (
        <p role="status" aria-live="polite" className="message-loading section">
          Processing your PDF — this can take a few seconds…
        </p>
      )}
      {extractError && (
        <p role="alert" aria-live="assertive" className="message message-error section">
          {extractError}
        </p>
      )}

      {importResult?.status === "scanned_no_ocr" && (
        <p role="alert" aria-live="assertive" className="message message-error section">
          This appears to be a scanned report. Scanned-PDF extraction is not available yet.
        </p>
      )}

      {importResult && drafts.length === 0 && !saveSummary && importResult.status !== "scanned_no_ocr" && (
        <p className="hint-text section">
          No lab test rows could be extracted from this PDF. Compare it with the original report.
        </p>
      )}

      {(drafts.length > 0 || saveSummary) && (
        <div className="section import-review">
          <h3 className="heading-records">Review Extracted Results</h3>

          <div className="import-review-meta">
            <div>
              <strong>Filename:</strong> {fileName ?? "--"}
            </div>
            <div>
              <strong>Page count:</strong> {importResult?.pageCount ?? "--"}
            </div>
            <div>
              <strong>Detected laboratory:</strong> {detectedLabName ?? "Unknown laboratory"}
            </div>
            <div>
              <strong>Detected collection/report date:</strong>{" "}
              {importResult?.reportMeta?.collectionDate ?? importResult?.reportMeta?.reportDate ?? "Not detected"}
            </div>
            <div>
              <strong>Possible tests found:</strong> {importResult?.extractedCount ?? drafts.length}
            </div>
            {importResult?.reportMeta?.patientName && (
              <div>
                <strong>Patient name on report (for review only, not saved):</strong>{" "}
                {importResult.reportMeta.patientName}
              </div>
            )}
          </div>

          {likelyDuplicateReport && (
            <div className="message message-error import-duplicate-warning section">
              <div>
                <strong>Likely duplicate report</strong> — {duplicateDraftCount} of {drafts.length}{" "}
                extracted rows already match results you've already saved. Saving will create a
                second, separate report rather than merging into the existing one.
              </div>
              <label className="import-draft-select">
                <input
                  type="checkbox"
                  checked={duplicateReportAcknowledged}
                  onChange={(e) => setDuplicateReportAcknowledged(e.target.checked)}
                />
                Import this as a new report anyway
              </label>
            </div>
          )}

          <p className="message message-error">
            Extraction may contain errors. Compare every row with the original report.
          </p>

          {importResult?.status === "scanned_ocr" && (
            <p className="message message-error">
              Extracted from scanned image — verify carefully.
            </p>
          )}

          {importResult?.warnings?.map((w, idx) => (
            <p key={idx} className="hint-text">
              {w}
            </p>
          ))}

          {drafts.length > 0 && (
          <>
          <div className="goal-actions section">
            <button type="button" onClick={handleSelectAll} className="btn btn-chip">
              Select All
            </button>
            <button type="button" onClick={handleSelectNone} className="btn btn-chip">
              Select None
            </button>
            <button type="button" onClick={handleRemoveUnselected} className="btn btn-chip">
              Remove Unselected
            </button>
            <button
              type="button"
              onClick={handleApplyDetectedDate}
              disabled={!importResult?.reportMeta?.collectionDate && !importResult?.reportMeta?.reportDate}
              className="btn btn-chip"
            >
              Apply Detected Date to Missing Dates
            </button>
            <button
              type="button"
              onClick={handleApplyDetectedLabName}
              disabled={!detectedLabName}
              className="btn btn-chip"
            >
              Apply Detected Lab Name to Missing Labs
            </button>
            <button type="button" onClick={handleBulkUseSuggestedRange} className="btn btn-chip">
              Use Suggested Range for Rows Without One
            </button>
            <button type="button" onClick={handleClearDraft} className="btn btn-cancel">
              Clear Draft
            </button>
          </div>

          <ul className="records-list section">
            {drafts.map((draft) => {
              const errors = validateDraftRow(draft);
              const duplicate = findDuplicate(draft, labResults);
              const showDuplicateWarning = duplicate && !dismissedDuplicateIds.has(draft.id);
              const resultNum = Number(draft.resultValue);
              const refLowNum = draft.referenceLow === "" ? null : Number(draft.referenceLow);
              const refHighNum = draft.referenceHigh === "" ? null : Number(draft.referenceHigh);
              const calculatedStatus = Number.isNaN(resultNum)
                ? "--"
                : computeLabStatus(resultNum, refLowNum, refHighNum);

              return (
                <li key={draft.id} className="record-card import-draft-row">
                  <div className="import-draft-header">
                    <label className="import-draft-select">
                      <input
                        type="checkbox"
                        checked={draft.selected}
                        onChange={(e) => updateDraft(draft.id, { selected: e.target.checked })}
                      />
                      Save
                    </label>
                    <span className="hint-text">
                      Original label: <strong>{draft.originalLabel}</strong>
                      {draft.sourcePage ? ` (page ${draft.sourcePage})` : ""}
                    </span>
                    {draft.confidence && (
                      <span className={`confidence-badge confidence-${draft.confidence.toLowerCase()}`}>
                        Confidence: {draft.confidence}
                      </span>
                    )}
                    {draft.ocrDerived && <span className="lab-custom-badge">OCR</span>}
                    <button type="button" onClick={() => handleRemoveRow(draft.id)} className="btn btn-delete">
                      Remove row
                    </button>
                  </div>

                  <div className="lab-filters">
                    <label className="field">
                      Normalized test name
                      <input
                        type="text"
                        value={draft.testName}
                        onChange={(e) => updateDraft(draft.id, { testName: e.target.value })}
                        className="input"
                      />
                      {errors.testName && <span className="message message-error">{errors.testName}</span>}
                    </label>

                    <label className="field">
                      Test Date
                      <input
                        type="date"
                        value={draft.testDate}
                        onChange={(e) => updateDraft(draft.id, { testDate: e.target.value })}
                        className="input"
                      />
                      {errors.testDate && <span className="message message-error">{errors.testDate}</span>}
                    </label>

                    <label className="field">
                      Category
                      <select
                        value={draft.category}
                        onChange={(e) => updateDraft(draft.id, { category: e.target.value })}
                        className="input"
                      >
                        <option value="">No category</option>
                        {LAB_CATEGORIES.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="field">
                      Result
                      <input
                        type="number"
                        step="any"
                        value={draft.resultValue}
                        onChange={(e) => updateDraft(draft.id, { resultValue: e.target.value })}
                        className="input"
                      />
                      {errors.resultValue && <span className="message message-error">{errors.resultValue}</span>}
                    </label>

                    <label className="field">
                      Unit
                      <input
                        type="text"
                        value={draft.unit}
                        onChange={(e) => handleUnitChange(draft.id, e.target.value)}
                        className="input"
                      />
                    </label>

                    <label className="field">
                      Reference Low
                      <input
                        type="number"
                        step="any"
                        value={draft.referenceLow}
                        onChange={(e) => handleRangeFieldChange(draft.id, "referenceLow", e.target.value)}
                        className="input"
                      />
                      {errors.referenceLow && <span className="message message-error">{errors.referenceLow}</span>}
                    </label>

                    <label className="field">
                      Reference High
                      <input
                        type="number"
                        step="any"
                        value={draft.referenceHigh}
                        onChange={(e) => handleRangeFieldChange(draft.id, "referenceHigh", e.target.value)}
                        className="input"
                      />
                      {errors.referenceHigh && <span className="message message-error">{errors.referenceHigh}</span>}
                    </label>

                    <label className="field">
                      Lab Name
                      <input
                        type="text"
                        value={draft.labName}
                        onChange={(e) => updateDraft(draft.id, { labName: e.target.value })}
                        className="input"
                      />
                    </label>

                    <label className="field">
                      Notes
                      <textarea
                        value={draft.notes}
                        onChange={(e) => updateDraft(draft.id, { notes: e.target.value })}
                        rows={2}
                        className="input"
                      />
                    </label>
                  </div>

                  <div className="record-row">
                    <strong>Extracted flag:</strong> {draft.extractedFlag ?? "--"} &nbsp;•&nbsp;
                    <strong>Calculated app status:</strong>{" "}
                    <span className={`lab-status lab-status-${calculatedStatus.toLowerCase().replace(/\s+/g, "-")}`}>
                      {calculatedStatus}
                    </span>
                  </div>

                  <div className="record-row">
                    {draft.rangeSource === "extracted" && (
                      <span className="lab-custom-badge">Range from report</span>
                    )}
                    {draft.rangeSource === "preset" && (
                      <span className="lab-custom-badge">Suggested range (preset), not from report</span>
                    )}
                    {draft.rangeSource !== "extracted" && draft.suggestedRange && (
                      <button
                        type="button"
                        onClick={() => handleUseSuggestedRange(draft.id)}
                        className="btn btn-chip"
                      >
                        Use suggested range ({draft.suggestedRange.low}-{draft.suggestedRange.high})
                      </button>
                    )}
                  </div>

                  {showDuplicateWarning && (
                    <div className="message message-error import-duplicate-warning">
                      <div>Possible duplicate</div>
                      <div className="goal-actions">
                        <button type="button" onClick={() => skipDuplicate(draft.id)} className="btn btn-chip">
                          Skip duplicate
                        </button>
                        <button type="button" onClick={() => dismissDuplicate(draft.id)} className="btn btn-chip">
                          Save anyway
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleDuplicateExpanded(draft.id)}
                          className="btn btn-chip"
                        >
                          {expandedDuplicateIds.has(draft.id) ? "Hide comparison" : "Compare with existing row"}
                        </button>
                      </div>
                      {expandedDuplicateIds.has(draft.id) && (
                        <p className="hint-text">
                          Existing result: {duplicate.result_value}
                          {duplicate.unit ? ` ${duplicate.unit}` : ""} on {duplicate.test_date}
                          {duplicate.reference_low !== null && duplicate.reference_high !== null
                            ? ` (saved range ${duplicate.reference_low}-${duplicate.reference_high})`
                            : ""}
                        </p>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          </>
          )}

          {saveBlockedMessage && (
            <p role="alert" aria-live="assertive" className="message message-error section">
              {saveBlockedMessage}
            </p>
          )}

          {saveSummary && saveSummary.failed > 0 && (
            <p role="alert" aria-live="assertive" className="message section message-error">
              {saveSummary.succeeded} of {saveSummary.total} row(s) saved.{" "}
              {saveSummary.failed} failed and remain in the draft — you can retry saving them.
            </p>
          )}

          {drafts.length > 0 && (
            <button
              type="button"
              onClick={handleSaveSelected}
              disabled={
                saving ||
                drafts.every((d) => !d.selected) ||
                (likelyDuplicateReport && !duplicateReportAcknowledged)
              }
              aria-busy={saving}
              className="btn btn-save section"
            >
              {saving ? "Saving..." : "Save Selected Results"}
            </button>
          )}
        </div>
      )}
          </>
        )}
      </div>

      {saveSummary && saveSummary.failed === 0 && (
        <>
          <p role="status" aria-live="polite" className="message section message-success">
            <span aria-hidden="true">✓</span> {saveSummary.succeeded} test
            {saveSummary.succeeded === 1 ? "" : "s"} successfully imported and saved.
          </p>
          <div className="goal-actions">
            <button
              type="button"
              onClick={() => {
                resetAll();
                setImportSectionExpanded(true);
              }}
              className="btn btn-chip"
            >
              Import Another PDF
            </button>
            <button
              type="button"
              onClick={() => onViewImportedReport?.(saveSummary.importBatchId)}
              className="btn btn-save"
            >
              View Imported Report
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default memo(ImportLabReportCard);
