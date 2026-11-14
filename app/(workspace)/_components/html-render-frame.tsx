"use client";

// Adapted from T3 Code's apps/web/src/components/chat/HtmlRenderFrame.tsx (MIT).

import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { IconButton } from "./icon-button";
import {
  clampHtmlRenderHeight,
  HTML_RENDER_MAX_FIT_HEIGHT,
  HTML_RENDER_MIN_HEIGHT,
} from "@/modules/agent/contracts";
import { HtmlRenderDialog } from "./html-render-dialog";
import { HtmlRenderDocument } from "./html-render-document";

/**
 * A page even a few pixels taller than its frame scrolls inside it and takes the reader's scroll,
 * so the frame fits the page. Once the live page reports its height, that wins over the model's
 * estimate.
 */
function htmlRenderFrameHeight(height: number, contentHeight?: number) {
  if (contentHeight !== undefined)
    return Math.min(
      HTML_RENDER_MAX_FIT_HEIGHT,
      Math.max(HTML_RENDER_MIN_HEIGHT, Math.ceil(contentHeight)),
    );
  return clampHtmlRenderHeight(height);
}

export function HtmlRenderFrame({
  html,
  title,
  height,
}: {
  html: string;
  title: string;
  height: number;
}) {
  // The live page reports its height; client fonts can wrap it taller than the
  // model estimated, which would otherwise cause nested scrolling.
  const [contentHeight, setContentHeight] = useState<number>();
  const [expanded, setExpanded] = useState(false);
  return (
    <div
      className="group/frame relative mt-1 mb-4"
      style={{ height: htmlRenderFrameHeight(height, contentHeight) }}
    >
      <HtmlRenderDocument
        html={html}
        title={title}
        className="block size-full border-0"
        onContentHeight={setContentHeight}
      />
      <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity duration-150 group-hover/frame:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
        <IconButton
          label="Open full screen"
          className="border border-border bg-card/85 backdrop-blur-sm"
          onClick={() => setExpanded(true)}
        >
          <Maximize2 />
        </IconButton>
      </div>
      {expanded && (
        <HtmlRenderDialog
          html={html}
          title={title}
          onClose={() => setExpanded(false)}
        />
      )}
    </div>
  );
}
