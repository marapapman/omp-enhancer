export const MAX_LENGTH = 50000;

const TRUNCATION_MARKER = `\n\n[... truncated to ${MAX_LENGTH} chars]`;

export function truncateToolResultContent(content: any[] = []) {
  const totalLength = content.reduce((total, block) => (
    total + (block?.type === "text" && typeof block.text === "string" ? block.text.length : 0)
  ), 0);
  if (totalLength <= MAX_LENGTH) return null;

  let remaining = MAX_LENGTH;
  let markerAdded = false;
  const truncated = [];
  for (const block of content) {
    if (block?.type !== "text" || typeof block.text !== "string") {
      truncated.push(block);
      continue;
    }
    if (remaining > 0) {
      const text = block.text.slice(0, remaining);
      remaining -= text.length;
      const overflowed = text.length < block.text.length;
      truncated.push({
        ...block,
        text: overflowed ? `${text}${TRUNCATION_MARKER}` : text,
      });
      if (overflowed) markerAdded = true;
      continue;
    }
    if (!markerAdded) {
      truncated.push({ ...block, text: TRUNCATION_MARKER });
      markerAdded = true;
    }
  }
  return truncated;
}
