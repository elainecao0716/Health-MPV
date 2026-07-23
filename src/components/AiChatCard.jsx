import { useEffect, useRef, useState } from "react";

const STARTER_QUESTIONS = [
  "Summarize my progress",
  "What trends do you notice?",
  "How close am I to my goal?",
];

function AiChatCard({ records, goalWeight, checkins, labResults }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (text) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const nextMessages = [...messages, { role: "user", content: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: nextMessages, records, goalWeight, checkins, labResults }),
      });

      // The dev proxy (or a dead backend) can return a non-JSON or empty body
      // (e.g. a bare 502), so don't assume response.json() will succeed.
      let data = null;
      try {
        data = await response.json();
      } catch {
        throw new Error(
          `Could not reach the AI Health Coach server (status ${response.status}). ` +
            "Make sure the backend (server/server.js) is running."
        );
      }

      if (!response.ok) {
        throw new Error(data?.error || `Server error (status ${response.status}).`);
      }

      if (!data?.reply) {
        throw new Error("The server response did not include a reply.");
      }

      setMessages([...nextMessages, { role: "assistant", content: data.reply }]);
    } catch (err) {
      const message =
        err instanceof TypeError
          ? "Unable to reach the AI Health Coach server. Make sure the backend is running on port 4000."
          : err.message || "Something went wrong. Please try again.";
      // Safe to log: never includes the API key or full record contents.
      console.error("[AiChatCard] /api/chat request failed:", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = () => sendMessage(input);

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    setMessages([]);
    setError(null);
  };

  return (
    <div className="card ai-chat-card">
      <h2 className="heading-records">💬 Chat with Your AI Health Coach</h2>
      <p className="hint-text">Ask questions about your logged health records.</p>

      <div className="chat-starters section">
        {STARTER_QUESTIONS.map((question) => (
          <button
            key={question}
            onClick={() => sendMessage(question)}
            disabled={loading}
            className="btn btn-chat-starter"
          >
            {question}
          </button>
        ))}
      </div>

      <div className="chat-window section">
        {messages.length === 0 && (
          <p className="empty-text">Ask a question or tap a suggestion above to get started.</p>
        )}

        {messages.map((message, index) => (
          <div
            key={index}
            className={`chat-bubble ${
              message.role === "user" ? "chat-bubble-user" : "chat-bubble-assistant"
            }`}
          >
            {message.content}
          </div>
        ))}

        {loading && <div className="chat-bubble chat-bubble-assistant chat-bubble-loading">Thinking...</div>}

        <div ref={messagesEndRef} />
      </div>

      {error && <p className="message message-error">{error}</p>}

      <div className="chat-input-row section">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your health records..."
          className="input"
        />
        <button
          onClick={handleSend}
          disabled={loading || input.trim() === ""}
          className="btn btn-ai"
        >
          Send
        </button>
        <button
          onClick={handleClear}
          disabled={loading || messages.length === 0}
          className="btn btn-cancel"
        >
          Clear Chat
        </button>
      </div>
    </div>
  );
}

export default AiChatCard;
