"use client";

// The rendering follows T3 Code's apps/web/src/components/ChatMarkdown.tsx (MIT), scaled down:
// GFM and $$ math through react-markdown, a component map instead of a stylesheet, streamed
// text split into blocks so only the last one re-renders, highlighted code blocks, Mermaid
// diagrams, and chips for links to pull requests, issues and files.

import { CircleDotIcon, FileIcon, GitPullRequestIcon } from "lucide-react";
import {
  createContext,
  createElement,
  memo,
  use,
  type ComponentProps,
  type JSX,
  type ReactNode,
} from "react";
import ReactMarkdown, {
  type Components,
  type ExtraProps,
} from "react-markdown";
import { codeBlockOf, isInlineMath, textOf } from "@/lib/markdown/code";
import {
  changeReferenceOf,
  fileNameOf,
  filePathOf,
} from "@/lib/markdown/links";
import {
  markdownPlugins,
  markdownPluginsWithBreaks,
  markdownUrlTransform,
} from "@/lib/markdown/plugins";
import { splitMarkdownBlocks } from "@/lib/markdown/split-blocks";
import {
  tableSource,
  tableToCsv,
  tableToMarkdown,
} from "@/lib/markdown/table";
import { cn } from "@/lib/utils";
import { CodeBlock } from "./code-block";
import { CopyDropdownMenu } from "./copy-button";
import { MathFormula } from "./math";
import { MermaidDiagram } from "./mermaid-diagram";

/** False for the block a reply is still streaming into, whose last fence may be unclosed. */
const BlockSettled = createContext(true);

/** The Markdown of the block being rendered, which hast positions index into. */
const BlockSource = createContext("");

/** The props react-markdown passes, without the hast node it adds for renderers that read it. */
function withoutNode<P extends ExtraProps>(props: P): Omit<P, "node"> {
  const rest = { ...props };
  delete rest.node;
  return rest;
}

/** Renders an element as `tag` with the classes, after any the Markdown gave it. */
function styled<T extends keyof JSX.IntrinsicElements>(tag: T, classes: string) {
  return function MarkdownElement(
    props: ComponentProps<T> & ExtraProps & { className?: string },
  ) {
    const { className, ...rest } = withoutNode(props);
    return createElement(tag, { ...rest, className: cn(classes, className) });
  };
}

// One level down: a message sits under the page's own h1. The size goes first: a text-* class
// after leading-* would replace it.
const heading = "mt-5 mb-2 font-semibold leading-snug text-foreground";

// A link to a pull request, an issue or a file, set off from the text around it.
const chip =
  "inline-flex max-w-full items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 align-bottom whitespace-nowrap text-xs leading-5 font-medium text-foreground no-underline [&>svg]:size-3 [&>svg]:shrink-0 [&>svg]:text-muted-foreground";

const components: Components = {
  h1: styled("h2", `text-xl ${heading}`),
  h2: styled("h3", `text-lg ${heading}`),
  h3: styled("h4", `text-base ${heading}`),
  h4: styled("h5", `text-sm ${heading}`),
  h5: styled("h6", `text-sm ${heading}`),
  h6: styled("h6", `text-sm ${heading} text-muted-foreground`),
  p: styled("p", "my-3"),
  ul: styled(
    "ul",
    "my-3 list-disc ps-5 [&_ul]:list-[circle] [&.contains-task-list]:list-none [&.contains-task-list]:ps-1",
  ),
  ol: styled("ol", "my-3 list-decimal ps-5"),
  li: styled(
    "li",
    "my-1 ps-0.5 marker:text-muted-foreground [&>:is(p,ul,ol)]:my-1",
  ),
  // GFM task list items: react-markdown renders them disabled, as the author wrote them.
  input: styled("input", "me-1.5 -mt-0.5 align-middle accent-foreground"),
  blockquote: styled(
    "blockquote",
    "my-3 border-s-2 border-border ps-3 text-muted-foreground",
  ),
  hr: styled("hr", "my-5 border-border"),
  strong: styled("strong", "font-semibold"),
  // As in T3 Code, a cell is capped at 24rem and wraps at words past that; a formula keeps its
  // width and the table scrolls. Headers sit on a muted row with rounded ends.
  th: styled(
    "th",
    "max-w-96 bg-muted px-2.5 py-1.5 text-start align-top font-medium text-pretty text-foreground wrap-break-word first:rounded-s-md last:rounded-e-md has-data-[slot=math]:max-w-none",
  ),
  td: styled(
    "td",
    "max-w-96 border-b border-border/60 px-2.5 py-1.5 text-start align-top text-pretty wrap-break-word has-data-[slot=math]:max-w-none",
  ),
  a: function MarkdownLink({ node, className, href, children, ...rest }) {
    const file = filePathOf(href);
    if (file || href?.startsWith("file:")) {
      return (
        <span title={file ?? undefined} className={chip}>
          <FileIcon aria-hidden />
          {/* A bare path reads as its file name; link text the author wrote stays. */}
          {file && node && textOf(node) === href ? fileNameOf(file) : children}
        </span>
      );
    }
    const reference = changeReferenceOf(href);
    const sameDocument = href?.startsWith("#") ?? false;
    const external = {
      href,
      target: sameDocument ? undefined : "_blank",
      rel: sameDocument ? undefined : "noopener noreferrer",
    };
    if (reference) {
      const Icon =
        reference.kind === "pull-request" ? GitPullRequestIcon : CircleDotIcon;
      return (
        <a {...rest} {...external} className={cn(chip, "hover:bg-accent")}>
          <Icon aria-hidden />
          {node && textOf(node) === href ? reference.label : children}
        </a>
      );
    }
    return (
      <a
        {...rest}
        {...external}
        className={cn(
          "underline decoration-muted-foreground/50 underline-offset-2 hover:decoration-foreground",
          className,
        )}
      >
        {children}
      </a>
    );
  },
  pre: function MarkdownCodeBlock({ node, children, ...rest }) {
    const block = codeBlockOf(node);
    const settled = use(BlockSettled);
    if (!block) return <pre {...rest}>{children}</pre>;
    if (block.language === "math") {
      return <MathFormula tex={block.code} display />;
    }
    const codeBlock = (actions?: ReactNode) => (
      <CodeBlock code={block.code} language={block.language} actions={actions} />
    );
    // A diagram is drawn once its block can no longer change.
    return block.language === "mermaid" && settled && block.code.trim() ? (
      <MermaidDiagram source={block.code} renderCode={codeBlock} />
    ) : (
      codeBlock()
    );
  },
  // Only inline code reaches this: `pre` renders a block's code itself.
  code: function MarkdownCode(props) {
    const { className, children, ...rest } = withoutNode(props);
    if (isInlineMath(className)) {
      return <MathFormula tex={String(children)} display={false} />;
    }
    return (
      <code
        {...rest}
        className={cn(
          "rounded-sm bg-foreground/8 px-1.25 py-0.5 font-mono box-decoration-clone",
          className,
        )}
      >
        {children}
      </code>
    );
  },
  table: function MarkdownTable({ node, className, ...rest }) {
    const source = use(BlockSource);
    return (
      // As wide as the table, up to the message, so the copy button sits under its right edge.
      <div data-slot="table" className="my-3 w-fit max-w-full">
        <div className="max-w-full overflow-x-auto [scrollbar-width:thin]">
          <table
            {...rest}
            className={cn(
              // Sized to its content, as on GitHub: short columns never wrap, a small table
              // stays small, and one wider than the message scrolls. The message's
              // wrap-anywhere would let columns shrink to a letter wide, so cells wrap at words.
              "w-max border-collapse text-start text-xs wrap-normal break-normal [&_tbody_tr:last-child>td]:border-b-0",
              className,
            )}
          />
        </div>
        {node ? (
          <div className="mt-0.5 flex justify-end select-none">
            <CopyDropdownMenu
              label="Copy table"
              className="size-6"
              formats={[
                {
                  label: "Copy as Markdown",
                  text: () => tableSource(source, node) ?? tableToMarkdown(node),
                },
                { label: "Copy as CSV", text: () => tableToCsv(node) },
              ]}
            />
          </div>
        ) : null}
      </div>
    );
  },
};

/** One block of the source; finished blocks keep their element tree while the reply streams. */
const MarkdownBlock = memo(function MarkdownBlock({
  text,
  lineBreaks,
  settled,
}: {
  text: string;
  lineBreaks: boolean;
  settled: boolean;
}) {
  return (
    <BlockSettled value={settled}>
      <BlockSource value={text}>
        <ReactMarkdown
          remarkPlugins={lineBreaks ? markdownPluginsWithBreaks : markdownPlugins}
          urlTransform={markdownUrlTransform}
          components={components}
        >
          {text}
        </ReactMarkdown>
      </BlockSource>
    </BlockSettled>
  );
});

/**
 * Markdown a message shows: GitHub-flavoured, with raw HTML as literal text. While `streaming`,
 * each new block fades in.
 */
export function Markdown({
  text,
  lineBreaks = false,
  streaming = false,
  className,
  ...props
}: {
  text: string;
  /** Keep single newlines, for text a person typed. */
  lineBreaks?: boolean;
  streaming?: boolean;
} & Omit<ComponentProps<"div">, "children">) {
  const blocks = splitMarkdownBlocks(text);
  return (
    <div
      {...props}
      data-slot="markdown"
      data-streaming={streaming || undefined}
      className={cn(
        "min-w-0 wrap-anywhere *:first:mt-0 *:last:mb-0 [&_img]:my-3 [&_img]:max-w-full [&_img]:rounded-md",
        // @starting-style applies only when an element is first inserted, so
        // opening a finished thread never replays the fade.
        "motion-safe:data-streaming:*:transition-opacity motion-safe:data-streaming:*:duration-600 motion-safe:data-streaming:*:starting:opacity-0",
        className,
      )}
    >
      {blocks.map((block, index) => (
        // Blocks only change at the end of the text, so an index keeps its block.
        <MarkdownBlock
          key={index}
          text={block}
          lineBreaks={lineBreaks}
          settled={!streaming || index < blocks.length - 1}
        />
      ))}
    </div>
  );
}
