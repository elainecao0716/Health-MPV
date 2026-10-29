// Server logging that can't leak secrets or personal details. Every line passes through scrub(),
// which blanks anything shaped like an API key, a sign-in token, or an email address, and errors are
// reduced to their status number and a short machine-readable code — never the raw message, which
// for upstream APIs can echo request details (OpenAI's errors can include a masked key fragment).

const REDACTIONS = [
  [/\bsk-[A-Za-z0-9_*-]{6,}/g, "[redacted-key]"], // OpenAI keys, including masked forms
  [/\bsb_(secret|publishable)_[A-Za-z0-9_-]{6,}/g, "[redacted-key]"], // Supabase keys
  [/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]*/g, "[redacted-token]"], // JWTs
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted-token]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[redacted-email]"],
];

export const scrub = (value) => {
  let text = typeof value === "string" ? value : String(value);
  for (const [pattern, replacement] of REDACTIONS) text = text.replace(pattern, replacement);
  return text;
};

const SAFE_CODE = /^[A-Za-z0-9_.-]{1,64}$/;

// The short, non-sensitive identifiers worth logging for an error: its HTTP status and a code such
// as "insufficient_quota", "rate_limit_exceeded", or "ECONNRESET".
export const describeError = (err) => {
  const status = Number.isInteger(err?.status) ? err.status : "-";
  const code = [err?.code, err?.error?.code, err?.type, err?.name].find(
    (c) => typeof c === "string" && SAFE_CODE.test(c)
  );
  return `status=${status} code=${code ?? "unknown"}`;
};

export const logInfo = (message) => console.log(scrub(message));
export const logWarn = (message) => console.warn(scrub(message));

export const logError = (label, err) => {
  console.error(scrub(`[server] ${label}: ${describeError(err)}`));
};
