import { describe, expect, it } from "vitest";
import { buildBulkDeleteConfirmMessage, buildBulkDeleteLargeBatchPromptMessage } from "./labBulkDeleteMessages";

describe("buildBulkDeleteConfirmMessage", () => {
  it("states the entire report and all its lab results will be deleted when isWholeReport is true", () => {
    const message = buildBulkDeleteConfirmMessage(12, "2024-01-01 to 2024-01-01", true);
    expect(message).toContain("entire report");
    expect(message).toContain("all 12 lab result(s)");
    expect(message).toContain("2024-01-01 to 2024-01-01");
    expect(message).toContain("This cannot be undone.");
  });

  it("keeps the existing Delete Selected wording, unchanged, when isWholeReport is false", () => {
    expect(buildBulkDeleteConfirmMessage(3, "2024-01-01", false)).toBe(
      "Delete 3 lab result(s) dated 2024-01-01? This cannot be undone."
    );
  });

  it("defaults to the Delete Selected wording when isWholeReport is omitted", () => {
    expect(buildBulkDeleteConfirmMessage(3, "2024-01-01")).toBe(
      "Delete 3 lab result(s) dated 2024-01-01? This cannot be undone."
    );
  });
});

describe("buildBulkDeleteLargeBatchPromptMessage", () => {
  it("states the entire report and all its lab results will be deleted when isWholeReport is true", () => {
    const message = buildBulkDeleteLargeBatchPromptMessage(45, "2024-01-01", true);
    expect(message).toContain("entire report");
    expect(message).toContain("all 45 lab results");
    expect(message).toContain("2024-01-01");
    expect(message).toContain("This cannot be undone.");
    expect(message).toContain("Type DELETE to confirm.");
  });

  it("keeps the existing Delete Selected wording, unchanged, when isWholeReport is false", () => {
    expect(buildBulkDeleteLargeBatchPromptMessage(15, "2024-01-01", false)).toBe(
      "You are about to permanently delete 15 lab results (2024-01-01). This is a large batch and cannot be undone. Type DELETE to confirm."
    );
  });

  it("defaults to the Delete Selected wording when isWholeReport is omitted", () => {
    expect(buildBulkDeleteLargeBatchPromptMessage(15, "2024-01-01")).toBe(
      "You are about to permanently delete 15 lab results (2024-01-01). This is a large batch and cannot be undone. Type DELETE to confirm."
    );
  });
});
