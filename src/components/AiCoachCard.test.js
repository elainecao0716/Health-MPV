import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// There's no React component-rendering test setup in this project yet (no
// @testing-library/react, no jsdom environment — see vitest.config.js), so this asserts
// against the component's source text directly rather than a rendered DOM. That's enough to
// catch an accidental revert of the capability hint without adding new test infrastructure
// for a copy-only change.
const componentSource = readFileSync(fileURLToPath(new URL("./AiCoachCard.jsx", import.meta.url)), "utf-8");

describe("AiCoachCard capability hint text", () => {
  it("tells the user it draws on health records, check-ins, and lab results", () => {
    expect(componentSource).toMatch(/health records/i);
    expect(componentSource).toMatch(/check-ins/i);
    expect(componentSource).toMatch(/lab results/i);
  });

  it("no longer claims to use only health records", () => {
    expect(componentSource).not.toMatch(/insights based on your logged health records\.\s*<\/p>/i);
  });
});
