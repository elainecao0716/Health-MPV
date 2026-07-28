import { useState } from "react";

function AiLabInsightsCard({ labResults }) {
  const [selectedTest, setSelectedTest] = useState("");
  const [insights, setInsights] = useState(null);
  const [generatedAt, setGeneratedAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const distinctTestNames = [...new Set(labResults.map((l) => l.test_name))].sort();

  const runAnalysis = async (mode) => {
    if (mode === "single" && !selectedTest) {
      setError("Choose a test to analyze first.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/lab-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "single"
            ? { mode, testName: selectedTest, labResults }
            : { mode, labResults }
        ),
      });

      let data = null;
      try {
        data = await response.json();
      } catch {
        throw new Error(`Could not reach the AI Health Coach server (status ${response.status}).`);
      }

      if (!response.ok) {
        throw new Error(data?.error || `Server error (status ${response.status}).`);
      }

      if (!data?.insights) {
        throw new Error("The server response did not include an analysis.");
      }

      setInsights(data.insights);
      setGeneratedAt(data.generatedAt ?? new Date().toISOString());
    } catch (err) {
      const message =
        err instanceof TypeError
          ? "Unable to reach the AI Health Coach server. Make sure the backend is running on port 4000."
          : err.message || "Something went wrong. Please try again.";
      console.error("[AiLabInsightsCard] /api/lab-insights request failed:", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="card ai-coach-card">
      <h2 className="heading-records">🧠 Lab Insights</h2>
      <p className="hint-text">
        AI-generated, plain-language summary of your lab trends — grounded in values your app already
        calculated.
      </p>

      <div className="lab-insights-controls section">
        <label className="field">
          Test
          <select
            value={selectedTest}
            onChange={(e) => setSelectedTest(e.target.value)}
            className="input"
          >
            <option value="">Choose a test</option>
            {distinctTestNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>

        <div className="goal-actions">
          <button
            type="button"
            onClick={() => runAnalysis("single")}
            disabled={loading || labResults.length === 0}
            className="btn btn-ai"
          >
            {loading ? "Analyzing..." : "Analyze Selected Test"}
          </button>
          <button
            type="button"
            onClick={() => runAnalysis("all")}
            disabled={loading || labResults.length === 0}
            className="btn btn-ai"
          >
            {loading ? "Analyzing..." : "Analyze All Recent Labs"}
          </button>
        </div>
      </div>

      {labResults.length === 0 && !loading && (
        <p className="hint-text section">Add a lab result first to get insights.</p>
      )}

      {error && <p className="message message-error section">{error}</p>}

      {insights && !error && (
        <div className="ai-advice-box section">
          {generatedAt && (
            <p className="hint-text lab-insights-timestamp">
              Generated {new Date(generatedAt).toLocaleString()}
            </p>
          )}
          <p className="ai-advice-text">{insights}</p>
          <p className="hint-text lab-insights-disclaimer">
            Educational summary only — not a diagnosis or treatment recommendation.
          </p>
        </div>
      )}
    </div>
  );
}

export default AiLabInsightsCard;
