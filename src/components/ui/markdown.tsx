"use client";

// The rendering follows T3 Code's apps/web/src/components/ChatMarkdown.tsx (MIT), scaled down:
// GFM through react-markdown, a component map instead of a stylesheet, and streamed text split
// into blocks so only the last one re-renders.

import {
  createContext,
  createElement,
  memo,
  use,
  type ComponentProps,
  type JSX,
} from "react";
import ReactMarkdown, {
  type Components,
  type ExtraProps,
} from "react-markdown";
import {
  markdownPlugins,
  markdownPluginsWithBreaks,
} from "@/lib/markdown/plugins";
import { splitMarkdownBlocks } from "@/lib/markdown/split-blocks";
import { cn } from "@/lib/utils";

/** Inside a fenced or indented code block, where `code` is not inline code. */
const InCodeBlock = createContext(false);

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
  th: styled(
    "th",
    "border-b border-border px-2 py-1.5 text-start font-medium text-foreground first:ps-0 last:pe-0",
  ),
  td: styled(
    "td",
    "border-b border-border/60 px-2 py-1.5 align-top first:ps-0 last:pe-0",
  ),
  a: function MarkdownLink(props) {
    const { className, href, ...rest } = withoutNode(props);
    const sameDocument = href?.startsWith("#") ?? false;
    return (
      <a
        {...rest}
        href={href}
        target={sameDocument ? undefined : "_blank"}
        rel={sameDocument ? undefined : "noopener noreferrer"}
        className={cn(
          "underline decoration-muted-foreground/50 underline-offset-2 hover:decoration-foreground",
          className,
        )}
      />
    );
  },
  pre: function MarkdownCodeBlock(props) {
    const { className, ...rest } = withoutNode(props);
    return (
      <InCodeBlock value>
        <pre
          {...rest}
          dir="ltr"
          className={cn(
            "my-3 max-w-full overflow-x-auto rounded-lg border border-border bg-muted px-3.5 py-3 font-mono text-xs leading-normal [scrollbar-width:thin]",
            className,
          )}
        />
      </InCodeBlock>
    );
  },
  code: function MarkdownCode(props) {
    const { className, ...rest } = withoutNode(props);
    const block = use(InCodeBlock);
    return (
      <code
        {...rest}
        className={cn(
          !block &&
            "rounded-sm bg-foreground/8 px-1.25 py-0.5 font-mono box-decoration-clone",
          className,
        )}
      />
    );
  },
  table: function MarkdownTable(props) {
    const { className, ...rest } = withoutNode(props);
    return (
      <div className="my-3 max-w-full overflow-x-auto">
        <table
          {...rest}
          className={cn(
            "w-full border-collapse text-start text-xs [&_tbody_tr:last-child>td]:border-b-0",
            className,
          )}
        />
      </div>
    );
  },
};

/** One block of the source; finished blocks keep their element tree while the reply streams. */
const MarkdownBlock = memo(function MarkdownBlock({
  text,
  lineBreaks,
}: {
  text: string;
  lineBreaks: boolean;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={lineBreaks ? markdownPluginsWithBreaks : markdownPlugins}
      components={components}
    >
      {text}
    </ReactMarkdown>
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
      {splitMarkdownBlocks(text).map((block, index) => (
        // Blocks only change at the end of the text, so an index keeps its block.
        <MarkdownBlock key={index} text={block} lineBreaks={lineBreaks} />
      ))}
    </div>
  );
}
