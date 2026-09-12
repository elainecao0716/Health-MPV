import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// There's no React component-rendering test setup in this project yet (no
// @testing-library/react, no jsdom environment — see vitest.config.js), so this asserts against
// App.jsx's source text directly. The actual confirmation wording is fully covered by
// src/utils/labBulkDeleteMessages.test.js; this only guards the wiring — that the per-report
// "Delete" button opts into the whole-report wording, while "Delete Selected" does not.
const appSource = readFileSync(fileURLToPath(new URL("./App.jsx", import.meta.url)), "utf-8");

describe("Report Library bulk-delete confirmation wiring", () => {
  it("the per-report Delete button (deletes all of `rows`) requests whole-report wording", () => {
    expect(appSource).toMatch(
      /handleBulkDeleteLabResults\(rows,\s*{\s*isWholeReport:\s*true\s*}\)/
    );
  });

  it("Delete Selected (deletes only `selectedInGroup`) does not request whole-report wording", () => {
    expect(appSource).toMatch(/handleBulkDeleteLabResults\(selectedInGroup\)/);
    expect(appSource).not.toMatch(/handleBulkDeleteLabResults\(selectedInGroup,/);
  });
});
