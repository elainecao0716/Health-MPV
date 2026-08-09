import { describe, expect, it } from "vitest";
import { groupLabResultsByTestDate } from "./labHistoryGrouping";

const lab = (overrides) => ({
  id: "id",
  test_date: "2026-07-20",
  test_name: "Glucose",
  lab_name: null,
  source_filename: null,
  import_batch_id: null,
  ...overrides,
});

describe("groupLabResultsByTestDate", () => {
  it("groups rows sharing the same test_date into one group when none have an import_batch_id (legacy fallback)", () => {
    const rows = [
      lab({ id: "1", test_date: "2026-07-20" }),
      lab({ id: "2", test_date: "2026-07-20" }),
      lab({ id: "3", test_date: "2026-07-14" }),
    ];
    const groups = groupLabResultsByTestDate(rows);
    expect(groups).toHaveLength(2);
    expect(groups.find((g) => g.testDate === "2026-07-20").rows).toHaveLength(2);
    expect(groups.find((g) => g.testDate === "2026-07-14").rows).toHaveLength(1);
  });

  it("preserves the input array's order — both group order and row order within a group", () => {
    const rows = [
      lab({ id: "b1", test_date: "2026-07-14" }),
      lab({ id: "a1", test_date: "2026-07-20" }),
      lab({ id: "b2", test_date: "2026-07-14" }),
      lab({ id: "a2", test_date: "2026-07-20" }),
    ];
    const groups = groupLabResultsByTestDate(rows);
    // First-appearance order of each date, not re-sorted.
    expect(groups.map((g) => g.testDate)).toEqual(["2026-07-14", "2026-07-20"]);
    expect(groups[0].rows.map((r) => r.id)).toEqual(["b1", "b2"]);
    expect(groups[1].rows.map((r) => r.id)).toEqual(["a1", "a2"]);
  });

  it("returns an empty array for empty input", () => {
    expect(groupLabResultsByTestDate([])).toEqual([]);
  });

  it("returns one group with one row for a single-row input", () => {
    const groups = groupLabResultsByTestDate([lab({ id: "1" })]);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows).toHaveLength(1);
  });

  it("returns one group per row when every row has a distinct date", () => {
    const rows = [
      lab({ id: "1", test_date: "2026-07-20" }),
      lab({ id: "2", test_date: "2026-07-14" }),
      lab({ id: "3", test_date: "2026-06-01" }),
    ];
    const groups = groupLabResultsByTestDate(rows);
    expect(groups).toHaveLength(3);
    groups.forEach((g) => expect(g.rows).toHaveLength(1));
  });

  it("resolves labName to the first row's non-empty lab_name in the group", () => {
    const rows = [
      lab({ id: "1", lab_name: null }),
      lab({ id: "2", lab_name: "Sun Clinical Laboratories" }),
      lab({ id: "3", lab_name: "Quest Diagnostics" }),
    ];
    const groups = groupLabResultsByTestDate(rows);
    expect(groups[0].labName).toBe("Sun Clinical Laboratories");
  });

  it("resolves labName to null when no row has a usable lab_name", () => {
    const rows = [
      lab({ id: "1", lab_name: null }),
      lab({ id: "2", lab_name: undefined }),
      lab({ id: "3", lab_name: "   " }),
    ];
    const groups = groupLabResultsByTestDate(rows);
    expect(groups[0].labName).toBeNull();
  });

  it("resolves sourceFilename to the first row's non-empty source_filename in the group", () => {
    const rows = [
      lab({ id: "1", source_filename: null }),
      lab({ id: "2", source_filename: "Blood Test Cao, Elaine.pdf" }),
      lab({ id: "3", source_filename: "other.pdf" }),
    ];
    const groups = groupLabResultsByTestDate(rows);
    expect(groups[0].sourceFilename).toBe("Blood Test Cao, Elaine.pdf");
  });

  it("resolves sourceFilename to null when no row has a usable source_filename", () => {
    const rows = [
      lab({ id: "1", source_filename: null }),
      lab({ id: "2", source_filename: undefined }),
      lab({ id: "3", source_filename: "   " }),
    ];
    const groups = groupLabResultsByTestDate(rows);
    expect(groups[0].sourceFilename).toBeNull();
  });

  it("keeps two reports with the same test_date as separate groups when they have different import_batch_id (the actual bug this fixes)", () => {
    const rows = [
      ...Array.from({ length: 46 }, (_, i) =>
        lab({ id: `orig-${i}`, test_date: "2026-07-20", import_batch_id: "batch-original" })
      ),
      ...Array.from({ length: 46 }, (_, i) =>
        lab({ id: `dup-${i}`, test_date: "2026-07-20", import_batch_id: "batch-reimport" })
      ),
    ];
    const groups = groupLabResultsByTestDate(rows);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.testDate === "2026-07-20")).toBe(true);
    expect(groups.map((g) => g.rows.length)).toEqual([46, 46]);
  });

  it("groups rows sharing the same import_batch_id together even if a row's test_date somehow differs", () => {
    const rows = [
      lab({ id: "1", test_date: "2026-07-20", import_batch_id: "batch-a" }),
      lab({ id: "2", test_date: "2026-07-21", import_batch_id: "batch-a" }),
    ];
    const groups = groupLabResultsByTestDate(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows).toHaveLength(2);
  });

  it("exposes importBatchId (null for legacy rows) and a stable key distinguishing legacy groups from real batch ids", () => {
    const rows = [
      lab({ id: "1", test_date: "2026-07-20", import_batch_id: null }),
      lab({ id: "2", test_date: "2026-07-14", import_batch_id: "batch-a" }),
    ];
    const groups = groupLabResultsByTestDate(rows);
    const legacyGroup = groups.find((g) => g.testDate === "2026-07-20");
    const batchGroup = groups.find((g) => g.testDate === "2026-07-14");
    expect(legacyGroup.importBatchId).toBeNull();
    expect(legacyGroup.key).toBe("legacy:2026-07-20");
    expect(batchGroup.importBatchId).toBe("batch-a");
    expect(batchGroup.key).toBe("batch-a");
  });

  it("handles a group with more than 10 rows (realistic single-import batch size)", () => {
    const rows = Array.from({ length: 47 }, (_, i) => lab({ id: `row-${i}` }));
    const groups = groupLabResultsByTestDate(rows);
    expect(groups).toHaveLength(1);
    expect(groups[0].rows).toHaveLength(47);
  });
});
