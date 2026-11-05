import type { ExtraProps } from "react-markdown";

/**
 * The diagram source of a ```mermaid fence, from the hast node react-markdown passes a `pre`
 * renderer. Null for any other block, and for an empty fence.
 */
export function mermaidSource(pre: ExtraProps["node"]): string | null {
  const code = pre?.children[0];
  if (code?.type !== "element" || code.tagName !== "code") return null;
  const classes = code.properties.className;
  if (!Array.isArray(classes) || !classes.includes("language-mermaid")) {
    return null;
  }
  const source = code.children
    .map((child) => (child.type === "text" ? child.value : ""))
    .join("");
  return source.trim() ? source : null;
}
