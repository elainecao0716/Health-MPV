import { memo, useState } from "react";

function AiCoachCard({ records, goalWeight, checkins, labResults }) {
  const [advice, setAdvice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records, goalWeight, checkins, labResults }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to generate advice.");
      }

      setAdvice(data.advice);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card ai-coach-card">
      <h2 className="heading-records">
        <span aria-hidden="true">🤖</span> AI Health Coach
      </h2>
      <p className="hint-text">
        Get personalized, AI-generated insights based on your logged health records, daily
        check-ins, and lab results.
      </p>

      <button
        onClick={handleGenerate}
        disabled={loading || records.length === 0}
        aria-busy={loading}
        className="btn btn-ai section"
      >
        {loading ? "Thinking..." : "Generate Advice"}
      </button>

      {records.length === 0 && !loading && (
        <p className="hint-text section">Add a health record first to get advice.</p>
      )}

      {error && (
        <p role="alert" aria-live="assertive" className="message message-error section">
          {error}
        </p>
      )}

      {advice && !error && (
        <div className="ai-advice-box section">
          <p className="ai-advice-text">{advice}</p>
        </div>
      )}
    </div>
  );
}

export default memo(AiCoachCard);
