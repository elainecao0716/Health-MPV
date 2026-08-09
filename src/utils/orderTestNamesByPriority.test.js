import { describe, expect, it } from "vitest";
import { orderTestNamesByPriority } from "./orderTestNamesByPriority";

describe("orderTestNamesByPriority", () => {
  it("moves priority names that are present to the front, in priority order", () => {
    const result = orderTestNamesByPriority(
      ["Glucose", "TSH"],
      ["Ferritin", "TSH", "ALT", "Glucose"]
    );
    expect(result).toEqual(["Glucose", "TSH", "Ferritin", "ALT"]);
  });

  it("keeps the relative order of non-priority names after the priority ones", () => {
    const result = orderTestNamesByPriority(["Glucose"], ["Zinc", "Ferritin", "Glucose", "ALT"]);
    expect(result).toEqual(["Glucose", "Zinc", "Ferritin", "ALT"]);
  });

  it("skips priority names that aren't actually available", () => {
    const result = orderTestNamesByPriority(["Glucose", "Vitamin D"], ["Ferritin", "Glucose"]);
    expect(result).toEqual(["Glucose", "Ferritin"]);
  });

  it("returns an empty array when there are no available names", () => {
    expect(orderTestNamesByPriority(["Glucose"], [])).toEqual([]);
  });

  it("returns availableNames unchanged when there's no overlap with priorityNames", () => {
    const result = orderTestNamesByPriority(["Glucose"], ["Zinc", "Ferritin"]);
    expect(result).toEqual(["Zinc", "Ferritin"]);
  });
});
