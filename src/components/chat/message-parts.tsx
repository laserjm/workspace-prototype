"use client";

import type { WorkspaceUIMessage } from "@/lib/chat/message";
import { HtmlRenderFrame } from "./html-render-frame";

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

/** Renders an assistant message's parts in stream order. */
export function MessageParts({ message }: { message: WorkspaceUIMessage }) {
  return message.parts.map((part, index) => {
    switch (part.type) {
      case "text":
        return part.text.trim() ? (
          <p key={index} className="message-text">
            {part.text}
          </p>
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
        <div className="html-render-pending" role="status">
          <span className="response-preparing-dot" />
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
        <p className="html-render-error">
          Could not show {part.input?.title ? `“${part.input.title}”` : "the page"}
          . {part.errorText}
        </p>
      );
    default:
      return null;
  }
}
