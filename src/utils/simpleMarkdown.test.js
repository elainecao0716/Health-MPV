import { describe, expect, it } from "vitest";
import { parseInlineMarkdown, parseMarkdownBlocks } from "./simpleMarkdown";

describe("parseInlineMarkdown", () => {
  it("returns plain text as a single text span", () => {
    expect(parseInlineMarkdown("Hello there")).toEqual([{ type: "text", content: "Hello there" }]);
  });

  it("parses **bold** spans", () => {
    expect(parseInlineMarkdown("Hi **there** friend")).toEqual([
      { type: "text", content: "Hi " },
      { type: "bold", content: "there" },
      { type: "text", content: " friend" },
    ]);
  });

  it("parses __bold__ spans", () => {
    expect(parseInlineMarkdown("__important__")).toEqual([{ type: "bold", content: "important" }]);
  });

  it("parses *italic* spans without consuming a bold pair on the same line", () => {
    expect(parseInlineMarkdown("This is *great* and **awesome**")).toEqual([
      { type: "text", content: "This is " },
      { type: "italic", content: "great" },
      { type: "text", content: " and " },
      { type: "bold", content: "awesome" },
    ]);
  });

  it("returns an empty array for empty/undefined input", () => {
    expect(parseInlineMarkdown("")).toEqual([]);
    expect(parseInlineMarkdown(undefined)).toEqual([]);
  });
});

describe("parseMarkdownBlocks", () => {
  it("returns an empty array for empty/undefined input", () => {
    expect(parseMarkdownBlocks("")).toEqual([]);
    expect(parseMarkdownBlocks(undefined)).toEqual([]);
  });

  it("parses a plain sentence as a single paragraph", () => {
    expect(parseMarkdownBlocks("Great progress this week.")).toEqual([
      { type: "paragraph", spans: [{ type: "text", content: "Great progress this week." }] },
    ]);
  });

  it("parses a ### heading separately from a following paragraph", () => {
    const blocks = parseMarkdownBlocks("### Summary\nYou're doing well.");
    expect(blocks).toEqual([
      { type: "heading", level: 3, spans: [{ type: "text", content: "Summary" }] },
      { type: "paragraph", spans: [{ type: "text", content: "You're doing well." }] },
    ]);
  });

  it("joins consecutive non-blank lines into one paragraph (soft line break)", () => {
    const blocks = parseMarkdownBlocks("Line one\nLine two");
    expect(blocks).toEqual([{ type: "paragraph", spans: [{ type: "text", content: "Line one Line two" }] }]);
  });

  it("splits on a blank line into separate paragraphs", () => {
    const blocks = parseMarkdownBlocks("First paragraph.\n\nSecond paragraph.");
    expect(blocks).toEqual([
      { type: "paragraph", spans: [{ type: "text", content: "First paragraph." }] },
      { type: "paragraph", spans: [{ type: "text", content: "Second paragraph." }] },
    ]);
  });

  it("groups consecutive '-' lines into one unordered list", () => {
    const blocks = parseMarkdownBlocks("Tips:\n- Drink water\n- Sleep 8 hours");
    expect(blocks).toEqual([
      { type: "paragraph", spans: [{ type: "text", content: "Tips:" }] },
      {
        type: "list",
        ordered: false,
        items: [[{ type: "text", content: "Drink water" }], [{ type: "text", content: "Sleep 8 hours" }]],
      },
    ]);
  });

  it("groups consecutive numbered lines into one ordered list", () => {
    const blocks = parseMarkdownBlocks("1. First step\n2. Second step");
    expect(blocks).toEqual([
      {
        type: "list",
        ordered: true,
        items: [[{ type: "text", content: "First step" }], [{ type: "text", content: "Second step" }]],
      },
    ]);
  });

  it("applies inline emphasis parsing inside headings and list items", () => {
    const blocks = parseMarkdownBlocks("## Next Steps\n- **Drink** more water\n- Try *gentle* stretching");
    expect(blocks).toEqual([
      { type: "heading", level: 2, spans: [{ type: "text", content: "Next Steps" }] },
      {
        type: "list",
        ordered: false,
        items: [
          [
            { type: "bold", content: "Drink" },
            { type: "text", content: " more water" },
          ],
          [
            { type: "text", content: "Try " },
            { type: "italic", content: "gentle" },
            { type: "text", content: " stretching" },
          ],
        ],
      },
    ]);
  });

  it("handles a full multi-block coach-style reply without leaking raw markdown characters", () => {
    const text =
      "### Progress Summary\n" +
      "You've lost **3 lbs** this month, great work.\n\n" +
      "### Next Steps\n" +
      "1. Keep logging daily\n" +
      "2. Aim for *consistent* sleep\n\n" +
      "This is not medical advice.";
    const blocks = parseMarkdownBlocks(text);

    // No block's rendered text should still contain literal markdown syntax characters.
    const allSpanText = blocks.flatMap((b) => (b.type === "list" ? b.items.flat() : b.spans)).map((s) => s.content);
    for (const content of allSpanText) {
      expect(content).not.toMatch(/[#*_]/);
    }

    expect(blocks[0]).toEqual({ type: "heading", level: 3, spans: [{ type: "text", content: "Progress Summary" }] });
    expect(blocks[2]).toEqual({ type: "heading", level: 3, spans: [{ type: "text", content: "Next Steps" }] });
    expect(blocks[3]).toEqual({
      type: "list",
      ordered: true,
      items: [
        [{ type: "text", content: "Keep logging daily" }],
        [
          { type: "text", content: "Aim for " },
          { type: "italic", content: "consistent" },
          { type: "text", content: " sleep" },
        ],
      ],
    });
  });
});
