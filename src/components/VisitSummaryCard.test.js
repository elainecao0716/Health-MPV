import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// There's no React component-rendering test setup in this project yet (no
// @testing-library/react, no jsdom environment — see vitest.config.js), so this asserts against
// the component's and stylesheet's source text directly rather than a rendered/computed DOM.
// That's enough to catch an accidental removal of the "Out-of-Range Lab Results" red styling
// without adding new test infrastructure for a presentation-only change.
const componentSource = readFileSync(fileURLToPath(new URL("./VisitSummaryCard.jsx", import.meta.url)), "utf-8");
const cssSource = readFileSync(fileURLToPath(new URL("../App.css", import.meta.url)), "utf-8");

describe("VisitSummaryCard Out-of-Range Lab Results styling", () => {
  it("assigns a dedicated class to the Out-of-Range Lab Results section", () => {
    expect(componentSource).toMatch(
      /section\.title === ["']Out-of-Range Lab Results["']\s*\n?\s*\?\s*["']visit-summary-section-out-of-range["']/
    );
  });

  it("still assigns the existing dedicated class to User-Entered Notes, unchanged", () => {
    expect(componentSource).toMatch(
      /section\.title === ["']User-Entered Notes["']\s*\n?\s*\?\s*["']visit-summary-section-notes["']/
    );
  });

  it("colors the Out-of-Range Lab Results heading red and bold in App.css", () => {
    const rule = cssSource.match(/\.visit-summary-section-out-of-range \.visit-summary-section-title\s*{([^}]*)}/);
    expect(rule).not.toBeNull();
    expect(rule[1]).toMatch(/color:\s*var\(--color-danger\)/);
    expect(rule[1]).toMatch(/font-weight:\s*var\(--weight-bold\)/);
  });

  it("colors every line (including the bullet) in that section red in App.css", () => {
    const listRule = cssSource.match(/\.visit-summary-section-out-of-range \.visit-summary-list\s*{([^}]*)}/);
    expect(listRule).not.toBeNull();
    expect(listRule[1]).toMatch(/color:\s*var\(--color-danger\)/);

    const markerRule = cssSource.match(
      /\.visit-summary-section-out-of-range \.visit-summary-list li::marker\s*{([^}]*)}/
    );
    expect(markerRule).not.toBeNull();
    expect(markerRule[1]).toMatch(/color:\s*var\(--color-danger\)/);
  });

  it("does not touch the base section-title/list rules shared by every other section", () => {
    const baseTitleRule = cssSource.match(/(?<!-out-of-range )\.visit-summary-section-title\s*{([^}]*)}/);
    expect(baseTitleRule).not.toBeNull();
    expect(baseTitleRule[1]).not.toMatch(/--color-danger/);

    const baseListRule = cssSource.match(/(?<!-out-of-range )\.visit-summary-list\s*{([^}]*)}/);
    expect(baseListRule).not.toBeNull();
    expect(baseListRule[1]).not.toMatch(/--color-danger/);
  });
});
