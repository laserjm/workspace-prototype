import type { ExtraProps } from "react-markdown";
import { textOf } from "./code";

type Node = NonNullable<ExtraProps["node"]>;

/** A table's rows, header first, each as its cells. */
function rowsOf(table: Node): Node[][] {
  const rows: Node[][] = [];
  const visit = (parent: Node) => {
    for (const child of parent.children) {
      if (child.type !== "element") continue;
      if (child.tagName === "tr") {
        rows.push(
          child.children.filter(
            (cell): cell is Node =>
              cell.type === "element" && (cell.tagName === "th" || cell.tagName === "td"),
          ),
        );
      } else if (child.tagName === "thead" || child.tagName === "tbody") {
        visit(child);
      }
    }
  };
  visit(table);
  return rows;
}

const cellText = (cell: Node) => textOf(cell).replace(/\s+/g, " ").trim();

/**
 * The table as the Markdown it was written in, from the block's source, so bold, code and links
 * survive. Inside a list item or a quote, the prefix those put on every line is removed.
 */
export function tableSource(source: string, table: Node): string | null {
  const start = table.position?.start.offset;
  const end = table.position?.end.offset;
  if (start === undefined || end === undefined || end > source.length) return null;
  const column = start - (source.lastIndexOf("\n", start - 1) + 1);
  const prefix = new RegExp(`^[ \\t>]{0,${column}}`);
  const [first = "", ...rest] = source.slice(start, end).split("\n");
  return [first, ...rest.map((line) => line.replace(prefix, ""))].join("\n");
}

/** The table as Markdown rebuilt from its text, for when the source is not at hand. */
export function tableToMarkdown(table: Node): string {
  const [header = [], ...body] = rowsOf(table);
  const row = (cells: Node[]) =>
    `| ${cells.map((cell) => cellText(cell).replaceAll("|", "\\|")).join(" | ")} |`;
  const separator = `| ${header
    .map((cell) => {
      const align = cell.properties.align;
      return align === "center" ? ":---:" : align === "right" ? "---:" : "---";
    })
    .join(" | ")} |`;
  return [row(header), separator, ...body.map(row)].join("\n");
}

/** The table as CSV, which spreadsheets paste as cells. A formula keeps its TeX. */
export function tableToCsv(table: Node): string {
  return rowsOf(table)
    .map((cells) =>
      cells
        .map((cell) => {
          const value = cellText(cell);
          return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
        })
        .join(","),
    )
    .join("\n");
}
