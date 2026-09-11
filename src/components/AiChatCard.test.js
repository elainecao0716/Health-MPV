import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// There's no React component-rendering test setup in this project yet (no
// @testing-library/react, no jsdom environment — see vitest.config.js), so this asserts against
// the component's source text directly rather than a rendered DOM. The Markdown parsing logic
// itself is fully covered by src/utils/simpleMarkdown.test.js; this only guards the wiring —
// that assistant replies are routed through MarkdownMessage while user messages (which the user
// typed themselves, not the AI) stay as plain text.
const componentSource = readFileSync(fileURLToPath(new URL("./AiChatCard.jsx", import.meta.url)), "utf-8");

describe("AiChatCard message rendering wiring", () => {
  it("imports the Markdown renderer", () => {
    expect(componentSource).toMatch(/import MarkdownMessage from ["']\.\/MarkdownMessage["']/);
  });

  it("renders assistant messages through MarkdownMessage", () => {
    expect(componentSource).toMatch(/message\.role === ["']assistant["']\s*\?\s*<MarkdownMessage/);
  });

  it("still renders user messages as plain text, not through the Markdown renderer", () => {
    expect(componentSource).toMatch(/<MarkdownMessage[^>]*\/>\s*:\s*message\.content/);
  });
});
