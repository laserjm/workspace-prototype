"use client";

import { HtmlRenderFrame } from "@/components/ui/html-render-frame";
import { Markdown } from "@/components/ui/markdown";
import type { WorkspaceUIMessage } from "../contracts";
import { preparingDotClassName } from "./response-turn";

type MessagePart = WorkspaceUIMessage["parts"][number];
type HtmlRenderPart = Extract<MessagePart, { type: "tool-html_render" }>;

/** Whether a message has anything `MessageParts` would show yet. */
export function hasVisibleParts(message: WorkspaceUIMessage | undefined) {
  return !!message?.parts.some(
    (part) =>
      (part.type === "text" && part.text.trim().length > 0) ||
      part.type === "tool-html_render",
  );
}

/** The message's text as its author wrote it, Markdown and all: what copying it copies. */
export function messageMarkdown(message: WorkspaceUIMessage) {
  return message.parts
    .flatMap((part) =>
      part.type === "text" && part.text.trim() ? [part.text.trim()] : [],
    )
    .join("\n\n");
}

/** Renders an assistant message's parts in stream order. */
export function MessageParts({
  message,
  streaming = false,
}: {
  message: WorkspaceUIMessage;
  /** The message is still arriving: its new blocks fade in. */
  streaming?: boolean;
}) {
  return message.parts.map((part, index) => {
    switch (part.type) {
      case "text":
        return part.text.trim() ? (
          <Markdown
            key={index}
            text={part.text}
            streaming={streaming}
            // A source session (data-session on <main>) reads a step denser.
            className="text-sm leading-relaxed text-foreground group-data-[session=source]/main:leading-5 [[data-slot=markdown]+&]:mt-3"
          />
        ) : null;
      case "tool-html_render":
        return <HtmlRenderToolPart key={part.toolCallId} part={part} />;
      default:
        return null;
    }
  });
}

function HtmlRenderToolPart({ part }: { part: HtmlRenderPart }) {
  switch (part.state) {
    case "input-streaming":
    case "input-available":
      return (
        <div
          className="mt-1 mb-4 flex items-center gap-2 rounded-lg border border-dashed border-border px-4 py-3.5 text-xs text-secondary-label"
          role="status"
        >
          <span className={preparingDotClassName} />
          Building {part.input?.title ? `“${part.input.title}”` : "a page"}…
        </div>
      );
    case "output-available":
      return (
        <HtmlRenderFrame
          html={part.input.html}
          title={part.output.title}
          height={part.output.height}
        />
      );
    case "output-error":
      return (
        <p className="mt-1 mb-3 text-xs text-destructive-foreground">
          Could not show{" "}
          {part.input?.title ? `“${part.input.title}”` : "the page"}.{" "}
          {part.errorText}
        </p>
      );
    default:
      return null;
  }
}
