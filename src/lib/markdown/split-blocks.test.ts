import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown from "react-markdown";
import { describe, expect, it } from "vitest";
import { markdownPlugins, markdownPluginsWithBreaks } from "./plugins";
import { splitMarkdownBlocks } from "./split-blocks";

// Whitespace between top-level blocks collapses in the rendered message.
const html = (source: string, lineBreaks: boolean) =>
  renderToStaticMarkup(
    createElement(
      Markdown,
      {
        remarkPlugins: lineBreaks ? markdownPluginsWithBreaks : markdownPlugins,
      },
      source,
    ),
  )
    .replace(/>\s+</g, "><")
    .trim();

describe("splitMarkdownBlocks", () => {
  it.each([
    "# Title\n\nFirst paragraph with `code` and **bold**.\n\nSecond [link](https://example.com).",
    "- one\n- two\n\n- loose three\n\n  continued\n\nAfter the list.",
    "1. first\n\n2. second\n\nText\n\n3) restarted",
    "```ts\nconst a = 1;\n\n\nconst b = 2;\n```\n\nafter\n\n~~~\nx\n\n~~~~\n\ny\n~~~\n\nend",
    "> quote\n\n> another quote\n\n> lazy\ncontinuation",
    "| a | b |\n| - | - |\n| 1 | 2 |\n\nAfter the table.",
    "para\n\n    indented code\n\nnext",
    "Setext\n===\n\nnext\n---\n\n- [ ] task\n- [x] done",
    "- a\n\n  ```\n  x\n\n```\n\nb",
    "- a\n\n  ```\n  x\n\ny\n\n  ```\n\nb",
    "line one\nline two\n\nthird",
  ])(
    "renders each block as the whole text renders, at every streamed prefix: %j",
    (text) => {
      for (const lineBreaks of [false, true]) {
        for (let end = 0; end <= text.length; end++) {
          const source = text.slice(0, end);
          const blocks = splitMarkdownBlocks(source);
          expect(blocks.join("")).toBe(source);
          expect(blocks.map((block) => html(block, lineBreaks)).join("")).toBe(
            html(source, lineBreaks),
          );
        }
      }
    },
  );

  it("splits only between closed blocks", () => {
    expect(
      splitMarkdownBlocks("a\n\n```\nb\n\nc\n```\n\n- d\n\n- e\n\nf"),
    ).toEqual(["a\n\n", "```\nb\n\nc\n```\n\n- d\n\n- e\n\n", "f"]);
  });

  it.each([
    "[ref]\n\n[ref]: /later",
    "a[^x]\n\n[^x]: note",
    "<details>\n\nbody\n\n</details>",
    "a\r\n\r\nb",
  ])("keeps text with document-wide syntax whole: %j", (text) => {
    expect(splitMarkdownBlocks(text)).toEqual([text]);
  });
});
