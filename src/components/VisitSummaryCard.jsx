import { memo, useState } from "react";
import { buildVisitSummarySections, visitSummaryToPlainText } from "../utils/visitSummary";
import StatusMessage from "./StatusMessage";

function VisitSummaryCard({ records, checkins, labResults, savedGoal }) {
  const [sections, setSections] = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [copyStatus, setCopyStatus] = useState(null);

  const hasAnyData = records.length > 0 || checkins.length > 0 || labResults.length > 0;

  const handlePrepare = () => {
    setCopyStatus(null);
    setGeneratedAt(new Date());
    setSections(buildVisitSummarySections({ records, checkins, labResults, savedGoal }));
  };

  const handleClear = () => {
    setSections(null);
    setGeneratedAt(null);
    setCopyStatus(null);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleCopy = async () => {
    if (!sections) return;
    const plainText = visitSummaryToPlainText(sections, generatedAt.toLocaleString());
    try {
      await navigator.clipboard.writeText(plainText);
      setCopyStatus({ type: "success", message: "Copied to clipboard!" });
    } catch {
      setCopyStatus({ type: "error", message: "Could not copy automatically — select and copy the text manually." });
    }
  };

  return (
    <div className="card visit-summary-card">
      <h2 className="heading-records">
        <span aria-hidden="true">📋</span> Prepare Visit Summary
      </h2>
      <p className="hint-text">
        A concise, factual summary of your recorded data — no diagnoses or treatment recommendations —
        for sharing with your clinician.
      </p>

      <div className="goal-actions section">
        <button
          type="button"
          onClick={handlePrepare}
          disabled={!hasAnyData}
          className="btn btn-ai"
        >
          Prepare Visit Summary
        </button>
        {sections && (
          <>
            <button type="button" onClick={handleCopy} className="btn btn-chip">
              Copy Summary
            </button>
            <button type="button" onClick={handlePrint} className="btn btn-chip">
              Print Summary
            </button>
            <button type="button" onClick={handleClear} className="btn btn-cancel">
              Clear Summary
            </button>
          </>
        )}
      </div>

      {!hasAnyData && (
        <p className="hint-text section">Log a health record, check-in, or lab result first.</p>
      )}

      <StatusMessage status={copyStatus} />

      {sections && (
        <div className="visit-summary-print-area section">
          <h3 className="heading-records">Health MPV — Visit Summary</h3>
          <p className="hint-text">Generated {generatedAt.toLocaleString()}</p>

          {sections.map((section) => (
            <div
              key={section.title}
              className={`visit-summary-section ${
                section.title === "User-Entered Notes"
                  ? "visit-summary-section-notes"
                  : section.title === "Out-of-Range Lab Results"
                    ? "visit-summary-section-out-of-range"
                    : ""
              }`}
            >
              <h4 className="visit-summary-section-title">
                {section.title}
                {section.title === "User-Entered Notes" && (
                  <span className="hint-text"> — as typed by you, not calculated</span>
                )}
              </h4>
              <ul className="visit-summary-list">
                {section.lines.map((line, idx) => (
                  <li key={idx}>{line}</li>
                ))}
              </ul>
            </div>
          ))}

          <p className="hint-text">
            Educational summary only — not a diagnosis or treatment recommendation.
          </p>
        </div>
      )}
    </div>
  );
}

export default memo(VisitSummaryCard);
