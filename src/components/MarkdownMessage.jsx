import { parseMarkdownBlocks } from "../utils/simpleMarkdown";

// Renders AI-authored Markdown (headings, paragraphs, bold/italic emphasis, bullet/numbered
// lists) as real React elements — never via dangerouslySetInnerHTML, so there's no
// HTML-injection surface even though the text originates from an external AI response.
const InlineSpans = ({ spans }) =>
  spans.map((span, index) => {
    if (span.type === "bold") return <strong key={index}>{span.content}</strong>;
    if (span.type === "italic") return <em key={index}>{span.content}</em>;
    return <span key={index}>{span.content}</span>;
  });

function MarkdownMessage({ text }) {
  const blocks = parseMarkdownBlocks(text);

  if (blocks.length === 0) return null;

  return blocks.map((block, index) => {
    if (block.type === "heading") {
      // Demoted so an AI-written "#" heading never outranks the chat UI's own headings.
      const HeadingTag = `h${Math.min(block.level + 2, 6)}`;
      return (
        <HeadingTag key={index} className="chat-markdown-heading">
          <InlineSpans spans={block.spans} />
        </HeadingTag>
      );
    }
    if (block.type === "list") {
      const ListTag = block.ordered ? "ol" : "ul";
      return (
        <ListTag key={index} className="chat-markdown-list">
          {block.items.map((itemSpans, itemIndex) => (
            <li key={itemIndex}>
              <InlineSpans spans={itemSpans} />
            </li>
          ))}
        </ListTag>
      );
    }
    return (
      <p key={index} className="chat-markdown-paragraph">
        <InlineSpans spans={block.spans} />
      </p>
    );
  });
}

export default MarkdownMessage;
