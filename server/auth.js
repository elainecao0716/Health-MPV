// Request authentication and ownership checks for the endpoints that handle private health data.
// The browser sends its Supabase session token as `Authorization: Bearer <token>`; the server asks
// Supabase Auth who that token belongs to before any OpenAI call or PDF processing happens. Tokens
// are never logged, stored, or sent anywhere except Supabase Auth.

export const MAX_TOKEN_LENGTH = 4096; // real Supabase access tokens are ~1 KB; anything far larger is junk
export const VERIFY_TIMEOUT_MS = 5000;

const SIGN_IN_AGAIN = "Please sign in again to use this feature.";

// Returns the bearer token from an Authorization header, or null when it's missing or malformed.
export const extractBearerToken = (header) => {
  if (typeof header !== "string") return null;
  const match = header.match(/^Bearer ([A-Za-z0-9._~+/-]+=*)$/);
  if (!match) return null;
  const token = match[1];
  return token.length > MAX_TOKEN_LENGTH ? null : token;
};

// Asks Supabase Auth (GET /auth/v1/user) who a token belongs to. Using the live endpoint rather than
// verifying the JWT locally means signed-out and revoked sessions are rejected immediately, not
// only once the token expires. Resolves to one of:
//   { status: "ok", user: { id } }   token is valid
//   { status: "invalid" }            token is expired, revoked, malformed, or not a user token
//   { status: "unavailable" }        Supabase couldn't be reached or answered unexpectedly
export const createSupabaseUserVerifier = ({
  supabaseUrl,
  supabaseKey,
  fetchImpl = fetch,
  timeoutMs = VERIFY_TIMEOUT_MS,
}) => {
  const endpoint = `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/user`;

  return async (token) => {
    let response;
    try {
      response = await fetchImpl(endpoint, {
        headers: { apikey: supabaseKey, Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return { status: "unavailable" };
    }

    if (response.status === 401 || response.status === 403) return { status: "invalid" };
    if (!response.ok) return { status: "unavailable" };

    let body;
    try {
      body = await response.json();
    } catch {
      return { status: "unavailable" };
    }
    const id = body?.id;
    if (typeof id !== "string" || id.length === 0) return { status: "invalid" };
    return { status: "ok", user: { id } };
  };
};

// Express middleware: rejects the request unless it carries a valid Supabase session token, and
// sets req.user = { id } when it does. Fails closed — if verification isn't configured or Supabase
// can't be reached, the request is refused rather than let through.
export const createRequireUser = (verifyUser) => async (req, res, next) => {
  if (typeof verifyUser !== "function") {
    return res.status(503).json({ error: "Sign-in verification is not configured on the server." });
  }

  const token = extractBearerToken(req.get("authorization"));
  if (!token) return res.status(401).json({ error: SIGN_IN_AGAIN });

  let result;
  try {
    result = await verifyUser(token);
  } catch {
    result = { status: "unavailable" };
  }

  if (result?.status === "ok" && typeof result.user?.id === "string" && result.user.id) {
    req.user = { id: result.user.id };
    return next();
  }
  if (result?.status === "invalid") return res.status(401).json({ error: SIGN_IN_AGAIN });
  return res.status(503).json({ error: "Could not verify your sign-in right now. Please try again shortly." });
};

// True when every row is an object owned by `userId`. The browser sends rows exactly as Supabase
// returned them (select "*"), so each one carries its owner's user_id; a row without one, or with
// someone else's, means the request is trying to submit data that isn't the signed-in user's.
export const rowsBelongToUser = (rows, userId) =>
  rows.every((row) => row !== null && typeof row === "object" && row.user_id === userId);
