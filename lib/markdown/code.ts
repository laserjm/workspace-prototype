import type { ExtraProps } from "react-markdown";

type Node = NonNullable<ExtraProps["node"]>;

const LANGUAGE_CLASS = /^language-(.+)$/;

/**
 * The code block a `pre` renderer receives, from the hast node react-markdown passes it: the
 * fence's language (null for an indented block or a bare fence) and the code itself. Display
 * math from `$$` arrives as a block with the language `math`.
 */
export function codeBlockOf(
  pre: Node | undefined,
): { language: string | null; code: string } | null {
  const code = pre?.children[0];
  if (code?.type !== "element" || code.tagName !== "code") return null;
  const classes = code.properties.className;
  const language = Array.isArray(classes)
    ? (classes
        .map((name) => LANGUAGE_CLASS.exec(String(name))?.[1])
        .find(Boolean) ?? null)
    : null;
  return { language, code: textOf(code) };
}

/** Inline `$$…$$` math, from the class `remark-math` gives its `code` element. */
export function isInlineMath(className: string | undefined): boolean {
  return className?.split(" ").includes("math-inline") ?? false;
}

/** The text of a hast node and its descendants. */
export function textOf(node: Node): string {
  return node.children
    .map((child) =>
      child.type === "text"
        ? child.value
        : child.type === "element"
          ? textOf(child)
          : "",
    )
    .join("");
}
