// Every status message in this app already follows the { type: "success" | "error", message }
// shape — this centralizes how each is announced to assistive tech instead of repeating the
// same aria-live/role logic at every call site. Errors are role="alert" (assertive) so they
// interrupt; success/info is role="status" (polite) so it doesn't.
function StatusMessage({ status, className = "" }) {
  if (!status || !status.message) return null;
  const isError = status.type === "error";

  return (
    <p
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      className={`message ${isError ? "message-error" : "message-success"} ${className}`.trim()}
    >
      {status.message}
    </p>
  );
}

export default StatusMessage;
