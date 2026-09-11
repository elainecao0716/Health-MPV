// A small, deliberately limited Markdown parser for AI chat/coach responses. It parses into
// plain data (headings, paragraphs, lists, and inline bold/italic spans) rather than an HTML
// string, so a caller can turn the result into React elements directly — no
// dangerouslySetInnerHTML and no HTML-injection surface, even though the input text originates
// from an external AI response. Only covers what this app's AI prompts actually ask the model
// to produce (short paragraphs, headings, bullet/numbered lists, bold/italic emphasis) — not
// code blocks, tables, links, or nested lists.

const HEADING_PATTERN = /^(#{1,6})\s+(.+)$/;
const UNORDERED_ITEM_PATTERN = /^[-*]\s+(.+)$/;
const ORDERED_ITEM_PATTERN = /^\d+\.\s+(.+)$/;
const INLINE_EMPHASIS_PATTERN = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_[^_\n]+_)/g;

// Splits a line of text into plain/bold/italic spans, e.g. "Hi **there**" ->
// [{type: "text", content: "Hi "}, {type: "bold", content: "there"}].
export const parseInlineMarkdown = (text) => {
  if (!text) return [];
  return text
    .split(INLINE_EMPHASIS_PATTERN)
    .filter((piece) => piece !== "")
    .map((piece) => {
      if ((piece.startsWith("**") && piece.endsWith("**")) || (piece.startsWith("__") && piece.endsWith("__"))) {
        return { type: "bold", content: piece.slice(2, -2) };
      }
      if ((piece.startsWith("*") && piece.endsWith("*")) || (piece.startsWith("_") && piece.endsWith("_"))) {
        return { type: "italic", content: piece.slice(1, -1) };
      }
      return { type: "text", content: piece };
    });
};

// Splits AI response text into block-level elements: headings, paragraphs, and lists. Each
// block's text is further split into inline spans via parseInlineMarkdown. Blank lines separate
// blocks; consecutive non-blank plain lines are joined into one paragraph (a single newline is a
// soft line break, matching standard Markdown behavior).
export const parseMarkdownBlocks = (text) => {
  if (!text) return [];

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks = [];
  let paragraphLines = [];
  let openList = null; // { ordered, items: string[] }

  const flushParagraph = () => {
    if (paragraphLines.length > 0) {
      blocks.push({ type: "paragraph", spans: parseInlineMarkdown(paragraphLines.join(" ").trim()) });
      paragraphLines = [];
    }
  };
  const flushList = () => {
    if (openList) {
      blocks.push({
        type: "list",
        ordered: openList.ordered,
        items: openList.items.map((item) => parseInlineMarkdown(item)),
      });
      openList = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === "") {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = HEADING_PATTERN.exec(line);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push({ type: "heading", level: headingMatch[1].length, spans: parseInlineMarkdown(headingMatch[2]) });
      continue;
    }

    const unorderedMatch = UNORDERED_ITEM_PATTERN.exec(line);
    const orderedMatch = unorderedMatch ? null : ORDERED_ITEM_PATTERN.exec(line);
    if (unorderedMatch || orderedMatch) {
      flushParagraph();
      const ordered = Boolean(orderedMatch);
      if (!openList || openList.ordered !== ordered) {
        flushList();
        openList = { ordered, items: [] };
      }
      openList.items.push((unorderedMatch ?? orderedMatch)[1]);
      continue;
    }

    flushList();
    paragraphLines.push(line);
  }

  flushParagraph();
  flushList();
  return blocks;
};
