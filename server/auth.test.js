import { describe, expect, it, vi } from "vitest";
import {
  MAX_TOKEN_LENGTH,
  createRequireUser,
  createSupabaseUserVerifier,
  extractBearerToken,
  rowsBelongToUser,
} from "./auth.js";

const TOKEN = "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ1c2VyLWEifQ.c2lnbmF0dXJl";

// Minimal stand-ins for Express's req/res.
const makeReq = (authorization) => ({ get: (name) => (name.toLowerCase() === "authorization" ? authorization : undefined) });
const makeRes = () => {
  const res = { statusCode: 200, body: undefined };
  res.status = (code) => ((res.statusCode = code), res);
  res.json = (body) => ((res.body = body), res);
  return res;
};
const run = async (middleware, authorization) => {
  const req = makeReq(authorization);
  const res = makeRes();
  const next = vi.fn();
  await middleware(req, res, next);
  return { req, res, next };
};

describe("extractBearerToken", () => {
  it("returns the token from a well-formed Bearer header", () => {
    expect(extractBearerToken(`Bearer ${TOKEN}`)).toBe(TOKEN);
  });

  it("rejects missing, empty, and non-Bearer headers", () => {
    for (const header of [undefined, null, "", "Bearer", "Bearer ", `Basic ${TOKEN}`, `bearer${TOKEN}`, TOKEN]) {
      expect(extractBearerToken(header)).toBeNull();
    }
  });

  it("rejects tokens containing spaces or unexpected characters", () => {
    expect(extractBearerToken(`Bearer ${TOKEN} extra`)).toBeNull();
    expect(extractBearerToken('Bearer abc"def')).toBeNull();
    expect(extractBearerToken("Bearer abc\ndef")).toBeNull();
  });

  it("rejects oversized tokens", () => {
    expect(extractBearerToken(`Bearer ${"a".repeat(MAX_TOKEN_LENGTH)}`)).toBe("a".repeat(MAX_TOKEN_LENGTH));
    expect(extractBearerToken(`Bearer ${"a".repeat(MAX_TOKEN_LENGTH + 1)}`)).toBeNull();
  });
});

describe("createSupabaseUserVerifier", () => {
  const verifierWith = (fetchImpl) =>
    createSupabaseUserVerifier({ supabaseUrl: "https://example.supabase.co/", supabaseKey: "sb_publishable_test", fetchImpl });

  it("calls Supabase's /auth/v1/user with the publishable key and the user's token", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ id: "user-a" }), { status: 200 }));
    await verifierWith(fetchImpl)(TOKEN);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://example.supabase.co/auth/v1/user");
    expect(init.headers).toEqual({ apikey: "sb_publishable_test", Authorization: `Bearer ${TOKEN}` });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("returns the user id for a valid token", async () => {
    const verify = verifierWith(async () => new Response(JSON.stringify({ id: "user-a", email: "a@example.com" })));
    expect(await verify(TOKEN)).toEqual({ status: "ok", user: { id: "user-a" } });
  });

  it("treats 401/403 from Supabase as an invalid token", async () => {
    for (const status of [401, 403]) {
      const verify = verifierWith(async () => new Response("{}", { status }));
      expect(await verify(TOKEN)).toEqual({ status: "invalid" });
    }
  });

  it("treats a 200 without a user id as invalid", async () => {
    const verify = verifierWith(async () => new Response(JSON.stringify({ role: "anon" })));
    expect(await verify(TOKEN)).toEqual({ status: "invalid" });
  });

  it("reports Supabase outages, timeouts, and unexpected responses as unavailable (never ok)", async () => {
    const cases = [
      async () => { throw new TypeError("fetch failed"); },
      async () => { throw new DOMException("timed out", "TimeoutError"); },
      async () => new Response("oops", { status: 500 }),
      async () => new Response("not json", { status: 200 }),
    ];
    for (const fetchImpl of cases) {
      expect(await verifierWith(fetchImpl)(TOKEN)).toEqual({ status: "unavailable" });
    }
  });
});

describe("createRequireUser", () => {
  it("rejects a request with no token (401) without calling the verifier", async () => {
    const verifyUser = vi.fn();
    const { res, next } = await run(createRequireUser(verifyUser), undefined);

    expect(res.statusCode).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(verifyUser).not.toHaveBeenCalled();
  });

  it("rejects a malformed header (401) without calling the verifier", async () => {
    const verifyUser = vi.fn();
    for (const header of ["Basic abc", "Bearer", `Bearer ${"a".repeat(MAX_TOKEN_LENGTH + 1)}`]) {
      const { res, next } = await run(createRequireUser(verifyUser), header);
      expect(res.statusCode).toBe(401);
      expect(next).not.toHaveBeenCalled();
    }
    expect(verifyUser).not.toHaveBeenCalled();
  });

  it("rejects an invalid or expired token (401)", async () => {
    const { res, next } = await run(createRequireUser(async () => ({ status: "invalid" })), `Bearer ${TOKEN}`);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/sign in again/i);
    expect(next).not.toHaveBeenCalled();
  });

  it("fails closed (503) when Supabase is unavailable or the verifier throws", async () => {
    for (const verifyUser of [async () => ({ status: "unavailable" }), async () => { throw new Error("boom"); }, async () => undefined]) {
      const { res, next } = await run(createRequireUser(verifyUser), `Bearer ${TOKEN}`);
      expect(res.statusCode).toBe(503);
      expect(next).not.toHaveBeenCalled();
    }
  });

  it("fails closed (503) when verification isn't configured", async () => {
    const { res, next } = await run(createRequireUser(null), `Bearer ${TOKEN}`);
    expect(res.statusCode).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });

  it("does not accept an 'ok' result that lacks a user id", async () => {
    const { res, next } = await run(createRequireUser(async () => ({ status: "ok", user: {} })), `Bearer ${TOKEN}`);
    expect(res.statusCode).toBe(503);
    expect(next).not.toHaveBeenCalled();
  });

  it("sets req.user and continues for a valid token", async () => {
    const verifyUser = vi.fn(async () => ({ status: "ok", user: { id: "user-a" } }));
    const { req, next } = await run(createRequireUser(verifyUser), `Bearer ${TOKEN}`);

    expect(verifyUser).toHaveBeenCalledWith(TOKEN);
    expect(req.user).toEqual({ id: "user-a" });
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe("rowsBelongToUser", () => {
  it("accepts rows that all belong to the signed-in user, including an empty list", () => {
    expect(rowsBelongToUser([], "user-a")).toBe(true);
    expect(rowsBelongToUser([{ user_id: "user-a" }, { user_id: "user-a", weight: 150 }], "user-a")).toBe(true);
  });

  it("rejects any row owned by another user", () => {
    expect(rowsBelongToUser([{ user_id: "user-a" }, { user_id: "user-b" }], "user-a")).toBe(false);
  });

  it("rejects rows with no owner, and non-object rows", () => {
    expect(rowsBelongToUser([{ weight: 150 }], "user-a")).toBe(false);
    expect(rowsBelongToUser([{ user_id: null }], "user-a")).toBe(false);
    expect(rowsBelongToUser([null], "user-a")).toBe(false);
    expect(rowsBelongToUser(["user-a"], "user-a")).toBe(false);
  });
});
