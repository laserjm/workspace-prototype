// Adapted from T3 Code's apps/web/src/components/chat/markdownStreamBlocks.ts (MIT).

// Definitions, footnotes and raw HTML can tie blocks together across blank lines.
const DOCUMENT_WIDE_SYNTAX = /^ {0,3}(?:\[[^\]\n]+\]:|<[A-Za-z!?/])|\[\^/m;
// Code fences, and $$ blocks of display math, which also run across blank lines.
const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,}|\${2,})/;
// After a blank line these still continue the previous block: a list item or indented content.
const CONTINUATION_PATTERN = /^(?:[ \t]|(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$))/;

/** The fence a line opens or closes, if it is one. */
function fenceOpener(line: string): string | undefined {
  const opener = FENCE_PATTERN.exec(line)?.[1];
  if (!opener || opener[0] === "~") return opener;
  // After ``` or $$, a fence's info string cannot hold the same character: `$$x$$` is
  // inline math in a paragraph.
  const info = line.slice(line.indexOf(opener) + opener.length);
  return info.includes(opener[0]) ? undefined : opener;
}

/**
 * Cuts Markdown at blank lines that close every open block, so each piece renders exactly as
 * it would inside the whole text. A streamed reply then re-renders only its last block.
 * Returns the whole text as one block when it uses syntax that spans blocks.
 */
export function splitMarkdownBlocks(text: string): string[] {
  if (text.includes("\r") || DOCUMENT_WIDE_SYNTAX.test(text)) return [text];
  const blocks: string[] = [];
  let blockStart = 0;
  let lineStart = 0;
  let fence: string | null = null;
  let fenceIndent = 0;
  let afterBlankLine = false;
  for (const line of text.split("\n")) {
    const opener = fenceOpener(line);
    if (fence !== null) {
      // A line left of an indented fence may end the list item holding it, which isn't tracked.
      if (/\S/.test(line.slice(0, fenceIndent))) break;
      if (
        opener &&
        opener[0] === fence[0] &&
        opener.length >= fence.length &&
        line.trim() === opener
      ) {
        fence = null;
      }
    } else if (line.trim() === "") {
      afterBlankLine = true;
    } else {
      if (
        afterBlankLine &&
        lineStart > blockStart &&
        !CONTINUATION_PATTERN.test(line)
      ) {
        blocks.push(text.slice(blockStart, lineStart));
        blockStart = lineStart;
      }
      afterBlankLine = false;
      fence = opener ?? null;
      if (opener) fenceIndent = line.indexOf(opener);
    }
    lineStart += line.length + 1;
  }
  blocks.push(text.slice(blockStart));
  return blocks;
}
