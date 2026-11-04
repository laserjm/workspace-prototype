"use client";

// Adapted from T3 Code's apps/web/src/components/chat/HtmlRenderFrame.tsx (MIT).

import { useState } from "react";
import { Maximize2 } from "lucide-react";
import { IconButton } from "./icon-button";
import { htmlRenderFrameHeight } from "@/lib/html-render/html-render";
import { HtmlRenderDialog } from "./html-render-dialog";
import { HtmlRenderDocument } from "./html-render-document";

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
      className="html-render-frame"
      style={{ height: htmlRenderFrameHeight(height, contentHeight) }}
    >
      <HtmlRenderDocument
        html={html}
        title={title}
        className="html-render-document"
        onContentHeight={setContentHeight}
      />
      <div className="html-render-actions">
        <IconButton
          label="Open full screen"
          className="html-render-action"
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
