import { supabase } from "../supabase";

export const SESSION_EXPIRED_MESSAGE = "Your session has expired. Please sign in again.";

// fetch() for the backend's protected endpoints (AI features, PDF import): attaches the signed-in
// user's Supabase access token as `Authorization: Bearer …`. getSession() refreshes an expired token
// before returning it. Throws (instead of sending the request) when there's no session, and turns a
// 401 response into the same "sign in again" message.
export const apiFetch = async (url, options = {}) => {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) throw new Error(SESSION_EXPIRED_MESSAGE);

  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(url, { ...options, headers });
  if (response.status === 401) throw new Error(SESSION_EXPIRED_MESSAGE);
  return response;
};
