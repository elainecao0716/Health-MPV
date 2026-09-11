import { describe, expect, it } from "vitest";
import { updateSelectionAfterDelete } from "./labSelection";

describe("updateSelectionAfterDelete", () => {
  it("removes ids that were successfully deleted", () => {
    const prev = new Set(["a", "b", "c"]);
    const next = updateSelectionAfterDelete(prev, ["a", "b"], []);
    expect(next).toEqual(new Set(["c"]));
  });

  it("keeps ids that failed to delete selected, so a retry targets exactly what's still there", () => {
    const prev = new Set(["a"]);
    const next = updateSelectionAfterDelete(prev, [], ["a", "b"]);
    expect(next).toEqual(new Set(["a", "b"]));
  });

  it("handles partial failure: succeeded ids removed, failed ids kept selected", () => {
    const prev = new Set(["a", "b", "c"]);
    const next = updateSelectionAfterDelete(prev, ["a"], ["b"]);
    expect(next).toEqual(new Set(["b", "c"]));
  });

  it("preserves a selection belonging to a different, untouched report on success", () => {
    // "z" stands in for a row selected in a report this delete call never touched.
    const prev = new Set(["a", "z"]);
    const next = updateSelectionAfterDelete(prev, ["a"], []);
    expect(next).toEqual(new Set(["z"]));
  });

  it("preserves a different report's selection even when this whole delete attempt fails", () => {
    const prev = new Set(["a", "z"]);
    const next = updateSelectionAfterDelete(prev, [], ["a"]);
    expect(next).toEqual(new Set(["a", "z"]));
  });

  it("does not mutate the previous Set", () => {
    const prev = new Set(["a"]);
    updateSelectionAfterDelete(prev, ["a"], []);
    expect(prev).toEqual(new Set(["a"]));
  });
});
