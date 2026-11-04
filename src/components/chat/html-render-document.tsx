"use client";

// Adapted from HtmlRenderDocument in T3 Code's
// apps/web/src/components/files/BrowserDocumentFrame.tsx (MIT).

import { useEffectEvent, useLayoutEffect, useMemo, useRef } from "react";
import {
  WORKSPACE_HTML_RENDER_THEME,
  injectHtmlRenderBootstrap,
  readHtmlRenderContentHeight,
  readHtmlRenderLinkRequest,
} from "@/lib/html-render/html-render";

/**
 * Model-written HTML runs in a sandboxed frame with an opaque origin, so a
 * page cannot reach the app's session, cookies, or storage.
 */
export function HtmlRenderDocument({
  html,
  title,
  className,
  onContentHeight,
}: {
  html: string;
  title: string;
  className?: string;
  onContentHeight?: (height: number) => void;
}) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const srcDoc = useMemo(
    () => injectHtmlRenderBootstrap(html, WORKSPACE_HTML_RENDER_THEME),
    [html],
  );

  // Links require frame focus and recent reader activity: a page can take
  // focus by script, so this blocks opens on load.
  const onFrameMessage = useEffectEvent(
    (frame: HTMLIFrameElement, event: MessageEvent) => {
      const height = readHtmlRenderContentHeight(event.data);
      if (height !== undefined) {
        onContentHeight?.(height);
        return;
      }
      if (
        document.activeElement !== frame ||
        navigator.userActivation?.isActive === false
      )
        return;
      const link = readHtmlRenderLinkRequest(event.data);
      if (link) window.open(link.url, "_blank", "noopener,noreferrer");
    },
  );

  // Attach at commit because a fast page may post its height before passive effects run.
  useLayoutEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const onMessage = (event: MessageEvent) => {
      if (event.source === frame.contentWindow) onFrameMessage(frame, event);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <iframe
      ref={frameRef}
      srcDoc={srcDoc}
      title={title}
      // Never allow-same-origin: the opaque origin keeps the page out of the app's session.
      sandbox="allow-scripts allow-forms"
      // Lets a page's video or image viewer take the screen.
      allow="fullscreen"
      className={className}
      style={{ colorScheme: WORKSPACE_HTML_RENDER_THEME.appearance }}
    />
  );
}
