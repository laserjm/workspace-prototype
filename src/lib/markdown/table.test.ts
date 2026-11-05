import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Markdown, { type ExtraProps } from "react-markdown";
import { describe, expect, it } from "vitest";
import { markdownPlugins } from "./plugins";
import { tableSource, tableToCsv, tableToMarkdown } from "./table";

/** Each table in the text as Markdown from its source, as rebuilt Markdown, and as CSV. */
function tables(text: string) {
  const found: { source: string | null; markdown: string; csv: string }[] = [];
  renderToStaticMarkup(
    createElement(
      Markdown,
      {
        remarkPlugins: markdownPlugins,
        components: {
          table: ({ node }: ExtraProps) => {
            if (node) {
              found.push({
                source: tableSource(text, node),
                markdown: tableToMarkdown(node),
                csv: tableToCsv(node),
              });
            }
            return null;
          },
        },
      },
      text,
    ),
  );
  return found;
}

const table = [
  "| Ticket | Owner | Note |",
  "| :- | :-: | -: |",
  "| **PLAT-124** | Ana | Uses `a, b` and \"quotes\" |",
  "| [PLAT-7](https://example.com) | Bo | $$x^2$$ \\| y |",
].join("\n");

describe("table copy", () => {
  it("copies Markdown as it was written", () => {
    expect(tables(`Before\n\n${table}\n\nAfter`)[0].source).toBe(table);
  });

  it("drops the prefix a list item or a quote puts on each line", () => {
    const indented = table.split("\n").join("\n   ");
    expect(tables(`1. Item\n\n   ${indented}`)[0].source).toBe(table);
    const quoted = table.split("\n").join("\n> ");
    expect(tables(`> ${quoted}`)[0].source).toBe(table);
  });

  it("rebuilds Markdown from the text, with alignment and escaped pipes", () => {
    expect(tables(table)[0].markdown).toBe(
      [
        "| Ticket | Owner | Note |",
        "| --- | :---: | ---: |",
        '| PLAT-124 | Ana | Uses a, b and "quotes" |',
        "| PLAT-7 | Bo | x^2 \\| y |",
      ].join("\n"),
    );
  });

  it("copies CSV, quoting cells with commas or quotes", () => {
    expect(tables(table)[0].csv).toBe(
      [
        "Ticket,Owner,Note",
        'PLAT-124,Ana,"Uses a, b and ""quotes"""',
        "PLAT-7,Bo,x^2 | y",
      ].join("\n"),
    );
  });
});
