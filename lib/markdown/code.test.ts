import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown, { type ExtraProps } from "react-markdown";
import { describe, expect, it } from "vitest";
import { codeBlockOf, isInlineMath } from "./code";
import { markdownPlugins } from "./plugins";

/** What the `pre` and inline `code` renderers see for each block and span in the text. */
function seen(text: string) {
  const blocks: ReturnType<typeof codeBlockOf>[] = [];
  const inline: { math: boolean; text: string }[] = [];
  renderToStaticMarkup(
    createElement(
      Markdown,
      {
        remarkPlugins: markdownPlugins,
        components: {
          pre: ({ node }: ExtraProps) => {
            blocks.push(codeBlockOf(node));
            return null;
          },
          code: ({ className, children }: ExtraProps & { className?: string; children?: unknown }) => {
            inline.push({ math: isInlineMath(className), text: String(children) });
            return null;
          },
        },
      },
      text,
    ),
  );
  return { blocks, inline };
}

describe("codeBlockOf", () => {
  it("reads the language and code of a fence", () => {
    expect(
      seen("```mermaid\nflowchart LR\n  A --> B\n```\n\n~~~ts title=a.ts\nx\n~~~").blocks,
    ).toEqual([
      { language: "mermaid", code: "flowchart LR\n  A --> B\n" },
      { language: "ts", code: "x\n" },
    ]);
  });

  it("has no language for an indented block or a bare fence", () => {
    expect(seen("    indented\n\n```\nbare\n```").blocks).toEqual([
      { language: null, code: "indented\n" },
      { language: null, code: "bare\n" },
    ]);
  });

  it("reads display math as a math block", () => {
    expect(seen("$$\na^2 + b^2\n$$\n\n```math\nx\n```").blocks).toEqual([
      { language: "math", code: "a^2 + b^2" },
      { language: "math", code: "x\n" },
    ]);
  });
});

describe("isInlineMath", () => {
  it("tells $$ math from inline code, and leaves single dollars as text", () => {
    expect(seen("`code`, $$x^2$$ and $5 to $10").inline).toEqual([
      { math: false, text: "code" },
      { math: true, text: "x^2" },
    ]);
  });
});
