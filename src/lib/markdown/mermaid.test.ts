import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown, { type ExtraProps } from "react-markdown";
import { describe, expect, it } from "vitest";
import { mermaidSource } from "./mermaid";
import { markdownPlugins } from "./plugins";

/** The mermaidSource of every code block in the text, in order. */
function sources(text: string) {
  const found: (string | null)[] = [];
  renderToStaticMarkup(
    createElement(
      Markdown,
      {
        remarkPlugins: markdownPlugins,
        components: {
          pre: ({ node }: ExtraProps) => {
            found.push(mermaidSource(node));
            return null;
          },
        },
      },
      text,
    ),
  );
  return found;
}

describe("mermaidSource", () => {
  it("reads the source of a mermaid fence", () => {
    expect(
      sources("```mermaid\nflowchart LR\n  A --> B\n```\n\n~~~mermaid title\nx\n~~~"),
    ).toEqual(["flowchart LR\n  A --> B\n", "x\n"]);
  });

  it("ignores other code blocks and empty fences", () => {
    expect(
      sources("```ts\nconst a = 1;\n```\n\n    indented\n\n```mermaid\n\n```"),
    ).toEqual([null, null, null]);
  });
});
