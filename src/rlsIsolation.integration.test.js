import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Database-level check that Supabase Row Level Security keeps users' health records apart: signed in
// as User A, try to read, change, delete, and plant rows belonging to User B.
//
// SKIPPED unless you opt in, so `npm test` never touches the database. To run it, create two
// dedicated TEST accounts in the app (never real patients' accounts), then:
//
//   RLS_TEST_USER_A_EMAIL=… RLS_TEST_USER_A_PASSWORD=… \
//   RLS_TEST_USER_B_EMAIL=… RLS_TEST_USER_B_PASSWORD=… \
//   npx vitest run src/rlsIsolation.integration.test.js
//
// It only ever writes rows it creates itself in User B's test account (marked RLS-ISOLATION-TEST),
// addresses them by id, and deletes them again at the end. It never reads, changes, or deletes any
// other row.

const env = process.env;
const credentials = {
  a: { email: env.RLS_TEST_USER_A_EMAIL, password: env.RLS_TEST_USER_A_PASSWORD },
  b: { email: env.RLS_TEST_USER_B_EMAIL, password: env.RLS_TEST_USER_B_PASSWORD },
};
const enabled = [credentials.a.email, credentials.a.password, credentials.b.email, credentials.b.password].every(Boolean);

const MARKER = "RLS-ISOLATION-TEST";
const TABLES = {
  health_records: (userId) => ({ user_id: userId, record_date: "2000-01-01", weight: 1, notes: MARKER }),
  daily_checkins: (userId) => ({
    user_id: userId, checkin_date: "2000-01-01", sleep_hours: null, water_cups: null, exercise_minutes: null, mood: null, notes: MARKER,
  }),
  lab_results: (userId) => ({
    user_id: userId, test_date: "2000-01-01", test_name: MARKER, category: null, result_value: 1, unit: null,
    reference_low: null, reference_high: null, status: "No Range", lab_name: null, notes: MARKER,
  }),
};

const newClient = () =>
  createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

describe.skipIf(!enabled)("Supabase RLS: User A cannot access, modify, or delete User B's health records", () => {
  const userA = newClient();
  const userB = newClient();
  const anonymous = newClient();
  let idA;
  let idB;
  const planted = {}; // table -> id of the marker row created in User B's account
  let accountsVerifiedEmpty = false; // cleanup only runs once the safety lock has passed

  beforeAll(async () => {
    const a = await userA.auth.signInWithPassword(credentials.a);
    const b = await userB.auth.signInWithPassword(credentials.b);
    if (a.error || b.error) throw new Error("Could not sign in the two RLS test accounts.");
    idA = a.data.user.id;
    idB = b.data.user.id;
    if (idA === idB) throw new Error("RLS test accounts A and B must be two different users.");

    // Safety lock: only ever run against brand-new, empty test accounts. If either account already
    // has any row in any table (e.g. a real account was entered by mistake), stop before writing.
    for (const [label, client, id] of [["A", userA, idA], ["B", userB, idB]]) {
      for (const table of Object.keys(TABLES)) {
        const { count, error } = await client.from(table).select("id", { count: "exact", head: true }).eq("user_id", id);
        if (error || count !== 0) {
          throw new Error(`Stopped before writing anything: test account ${label} is not empty (${table}). Use dedicated, empty test accounts.`);
        }
      }
    }
    accountsVerifiedEmpty = true;

    for (const [table, row] of Object.entries(TABLES)) {
      const { data, error } = await userB.from(table).insert([row(idB)]).select("id").single();
      if (error) throw new Error(`Could not create the ${table} test row in User B's account: ${error.message}`);
      planted[table] = data.id;
    }
  });

  afterAll(async () => {
    if (!accountsVerifiedEmpty) {
      await userA.auth.signOut();
      await userB.auth.signOut();
      return;
    }
    // Removes only rows this test created: the planted ones, plus any marker row a failed (i.e.
    // insecure) check might have left in either test account.
    for (const [table, id] of Object.entries(planted)) {
      await userB.from(table).delete().eq("id", id).eq("user_id", idB);
    }
    for (const table of Object.keys(TABLES)) {
      if (idB) await userB.from(table).delete().eq("user_id", idB).eq("notes", MARKER);
      if (idA) await userA.from(table).delete().eq("user_id", idA).eq("notes", MARKER);
    }
    await userA.auth.signOut();
    await userB.auth.signOut();
  });

  it.each(Object.keys(TABLES))("%s: User A cannot read User B's row", async (table) => {
    const byId = await userA.from(table).select("id").eq("id", planted[table]);
    expect(byId.error).toBeNull();
    expect(byId.data).toEqual([]);

    const byOwner = await userA.from(table).select("id", { count: "exact", head: true }).eq("user_id", idB);
    expect(byOwner.count).toBe(0);
  });

  it.each(Object.keys(TABLES))("%s: User A cannot modify User B's row", async (table) => {
    const attempt = await userA.from(table).update({ notes: "CHANGED-BY-USER-A" }).eq("id", planted[table]).select("id");
    expect(attempt.data ?? []).toEqual([]);

    const check = await userB.from(table).select("notes").eq("id", planted[table]).single();
    expect(check.data.notes).toBe(MARKER);
  });

  it.each(Object.keys(TABLES))("%s: User A cannot reassign their own row to User B", async (table) => {
    const own = await userA.from(table).insert([TABLES[table](idA)]).select("id").single();
    expect(own.error).toBeNull();
    try {
      const attempt = await userA.from(table).update({ user_id: idB }).eq("id", own.data.id).select("id");
      expect(attempt.error).not.toBeNull();
      const stillA = await userA.from(table).select("user_id").eq("id", own.data.id).single();
      expect(stillA.data.user_id).toBe(idA);
    } finally {
      await userA.from(table).delete().eq("id", own.data.id).eq("user_id", idA);
    }
  });

  it.each(Object.keys(TABLES))("%s: User A cannot delete User B's row", async (table) => {
    const attempt = await userA.from(table).delete().eq("id", planted[table]).select("id");
    expect(attempt.data ?? []).toEqual([]);

    const check = await userB.from(table).select("id").eq("id", planted[table]);
    expect(check.data).toHaveLength(1);
  });

  it.each(Object.keys(TABLES))("%s: User A cannot create a row in User B's account", async (table) => {
    const attempt = await userA.from(table).insert([TABLES[table](idB)]).select("id");
    expect(attempt.error).not.toBeNull();

    const check = await userB.from(table).select("id", { count: "exact", head: true }).eq("notes", MARKER);
    expect(check.count).toBe(1); // only the planted row
  });

  it.each(Object.keys(TABLES))("%s: a signed-out visitor sees nothing", async (table) => {
    const res = await anonymous.from(table).select("id", { count: "exact", head: true });
    expect(res.count ?? 0).toBe(0);
  });
});
