"use client";

// Follows T3 Code's apps/web/src/components/chat/MermaidDiagram.tsx and
// MarkdownMermaidCodeBlock.tsx (MIT): Pele draws the diagram, loaded on first use, and
// DOMPurify cleans its SVG.

import type { Mounted } from "pele/lazy";
import {
  CodeIcon,
  Maximize2Icon,
  ScanIcon,
  WorkflowIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "./dialog";
import { CopyButton } from "./copy-button";
import { IconButton } from "./icon-button";

type Renderer = {
  pele: typeof import("pele/lazy");
  sanitize: (svg: string) => Node;
};

let rendererLoad: Promise<Renderer> | null = null;

// Neither library is in the page's bundle until a message has a diagram. Pele loads each
// diagram type as its own chunk.
function loadRenderer(): Promise<Renderer> {
  rendererLoad ??= Promise.all([import("pele/lazy"), import("dompurify")]).then(
    ([pele, { default: DOMPurify }]) => {
      const purifier = DOMPurify(window);
      return {
        pele,
        // Pele escapes labels and links and images are off; this is defence in depth against
        // anything in model output that could navigate, run script or fetch.
        sanitize: (svg) =>
          purifier.sanitize(svg, {
            FORBID_ATTR: ["href", "xlink:href", "src", "srcset"],
            FORBID_TAGS: ["a", "image", "foreignObject", "style"],
            USE_PROFILES: { svg: true, svgFilters: true },
            RETURN_DOM_FRAGMENT: true,
          }),
      };
    },
    (error: unknown) => {
      rendererLoad = null;
      throw error;
    },
  );
  return rendererLoad;
}

// Pele colours a diagram through these variables, so it follows the tokens and the theme
// without being drawn again.
const theme =
  "[--pele-bg:var(--background)] [--pele-fg:var(--foreground)] [--pele-muted:var(--muted-foreground)] [--pele-line:var(--muted-foreground)] [--pele-surface:var(--muted)] [--pele-surface-alt:var(--accent)] [--pele-border:var(--ring)] [--pele-accent:var(--info)] [--pele-critical:var(--destructive)] [--pele-error:var(--destructive)] [--pele-font:var(--font-sans)] [--pele-font-mono:var(--font-mono)] [--pele-radius:var(--radius-sm)]";

type Status = "loading" | "drawn" | "failed";

/** Why a diagram could not be drawn, in one line: Pele's later lines point a caret at the source. */
function failureOf(reason: unknown): string {
  const summary =
    reason instanceof Error ? reason.message.split("\n")[0].replace(/:$/, "") : "";
  return summary || "it could not be drawn";
}

/** Draws `source` into the element the returned ref is given, and reports how that went. */
function useDiagram(source: string) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const ref = useCallback(
    (container: HTMLDivElement) => {
      let mounted: Mounted | undefined;
      let removed = false;
      const fail = (reason: unknown) => {
        if (removed) return;
        setStatus("failed");
        setError(failureOf(reason));
      };
      loadRenderer()
        .then(({ pele, sanitize }) =>
          pele.mountAsync(container, source.trim(), {
            links: false,
            images: false,
            zoom: false,
            // Keep the author's direction; a wide diagram scales down to fit instead.
            autoDirection: false,
            sanitize,
            onRender: () => {
              if (removed) return;
              setStatus("drawn");
              setError(null);
            },
            onError: fail,
          }),
        )
        .then((diagram) => {
          if (removed) diagram.destroy();
          else mounted = diagram;
        }, fail);
      return () => {
        removed = true;
        mounted?.destroy();
      };
    },
    [source],
  );
  return { ref, status, error };
}

/**
 * A Mermaid diagram. Its code block, from `renderCode`, shows until it is drawn, when it
 * cannot be, and on request; `renderCode` is given the toggle back to the diagram.
 */
export function MermaidDiagram({
  source,
  renderCode,
}: {
  source: string;
  renderCode: (actions: ReactNode) => ReactNode;
}) {
  const { ref, status, error } = useDiagram(source);
  const [showCode, setShowCode] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const drawn = status === "drawn";
  return (
    <div data-slot="mermaid" className="relative my-3">
      {error ? (
        <p className="mb-1.5 text-xs text-destructive-foreground">
          Couldn&apos;t draw this diagram: {error}
        </p>
      ) : null}
      {!drawn || showCode
        ? renderCode(
            drawn ? (
              <IconButton
                label="Show diagram"
                className="size-6"
                onClick={() => setShowCode(false)}
              >
                <WorkflowIcon />
              </IconButton>
            ) : null,
          )
        : null}
      {/* Laid out but invisible while it loads, so Pele can measure the width it has. */}
      <div
        className={cn(
          "overflow-hidden rounded-lg border border-border bg-background",
          status === "loading" && "invisible absolute inset-x-0 top-0",
          (status === "failed" || showCode) && "hidden",
        )}
      >
        <div className="flex min-h-8 items-center justify-between gap-2 ps-3.5 pe-1 pt-1 select-none">
          <span className="font-mono text-2xs text-muted-foreground">mermaid</span>
          <span className="flex shrink-0 items-center">
            <IconButton
              label="Expand diagram"
              className="size-6"
              onClick={() => setExpanded(true)}
            >
              <Maximize2Icon />
            </IconButton>
            <IconButton
              label="Show code"
              className="size-6"
              onClick={() => setShowCode(true)}
            >
              <CodeIcon />
            </IconButton>
            <CopyButton text={source.trim()} label="Copy code" className="size-6" />
          </span>
        </div>
        <div
          ref={ref}
          className={cn(theme, "flex justify-center overflow-x-auto px-3.5 pb-3")}
        />
      </div>
      {expanded ? (
        <ExpandedDiagram source={source} onClose={() => setExpanded(false)} />
      ) : null}
    </div>
  );
}

const MAX_SCALE = 4;
// A small diagram opens larger than it is drawn in the message, but not blown up.
const MAX_FIT = 2;
const FIT_MARGIN = 24;
const ZOOM_STEP = 1.25;

type Zoom = { scale: number; min: number; fitted: boolean };

type Viewer = {
  zoomBy: (factor: number) => void;
  fit: () => void;
};

/**
 * Draws `source` at its own size into the scrolling element the returned ref is given, fitted
 * to it, and zooms it there. The viewport scrolls natively; dragging pans, and Ctrl or ⌘ with
 * the wheel, or a pinch, zooms around the pointer.
 */
function useDiagramViewer(source: string) {
  const [zoom, setZoom] = useState<Zoom | null>(null);
  const [error, setError] = useState<string | null>(null);
  const viewer = useRef<Viewer | null>(null);
  const ref = useCallback(
    (viewport: HTMLDivElement) => {
      let removed = false;
      let natural = { width: 0, height: 0 };
      let scale = 1;
      let fitted = true;
      const canvas = viewport.ownerDocument.createElement("div");
      // Auto margins centre a diagram smaller than the viewport without clipping a larger one.
      canvas.className = "m-auto shrink-0";
      viewport.replaceChildren(canvas);

      const fitScale = () =>
        Math.min(
          (viewport.clientWidth - FIT_MARGIN * 2) / natural.width,
          (viewport.clientHeight - FIT_MARGIN * 2) / natural.height,
          MAX_FIT,
        );
      const minScale = () => Math.min(fitScale(), 0.25);

      // Keeps the point at (x, y) in the viewport under the same spot of the diagram.
      const apply = (
        next: number,
        x = viewport.clientWidth / 2,
        y = viewport.clientHeight / 2,
      ) => {
        if (!natural.width) return;
        const anchorX = (viewport.scrollLeft + x - canvas.offsetLeft) / scale;
        const anchorY = (viewport.scrollTop + y - canvas.offsetTop) / scale;
        scale = Math.min(Math.max(next, minScale()), MAX_SCALE);
        canvas.style.width = `${natural.width * scale}px`;
        canvas.style.height = `${natural.height * scale}px`;
        viewport.scrollLeft = anchorX * scale + canvas.offsetLeft - x;
        viewport.scrollTop = anchorY * scale + canvas.offsetTop - y;
        setZoom({ scale, min: minScale(), fitted });
      };
      const fit = () => {
        fitted = true;
        apply(fitScale());
      };
      viewer.current = {
        zoomBy: (factor) => {
          fitted = false;
          apply(scale * factor);
        },
        fit,
      };

      const onWheel = (event: WheelEvent) => {
        // A plain wheel or two-finger scroll moves the viewport; a pinch arrives with ctrlKey.
        if (!event.ctrlKey && !event.metaKey) return;
        event.preventDefault();
        const box = viewport.getBoundingClientRect();
        const delta = Math.min(Math.max(-event.deltaY, -24), 24);
        fitted = false;
        apply(scale * 2 ** (delta * 0.02), event.clientX - box.left, event.clientY - box.top);
      };
      let drag: { x: number; y: number } | null = null;
      const onPointerDown = (event: PointerEvent) => {
        if (event.pointerType !== "mouse" || event.button !== 0) return;
        // The scrollbars sit outside the client area and drag themselves.
        const box = viewport.getBoundingClientRect();
        if (
          event.clientX - box.left - viewport.clientLeft >= viewport.clientWidth ||
          event.clientY - box.top - viewport.clientTop >= viewport.clientHeight
        ) {
          return;
        }
        drag = { x: event.clientX, y: event.clientY };
        viewport.setPointerCapture(event.pointerId);
        viewport.style.cursor = "grabbing";
      };
      const onPointerMove = (event: PointerEvent) => {
        if (!drag) return;
        viewport.scrollLeft -= event.clientX - drag.x;
        viewport.scrollTop -= event.clientY - drag.y;
        drag = { x: event.clientX, y: event.clientY };
      };
      const onPointerUp = () => {
        drag = null;
        viewport.style.cursor = "";
      };
      viewport.addEventListener("wheel", onWheel, { passive: false });
      viewport.addEventListener("pointerdown", onPointerDown);
      viewport.addEventListener("pointermove", onPointerMove);
      viewport.addEventListener("pointerup", onPointerUp);
      viewport.addEventListener("pointercancel", onPointerUp);
      // Until someone zooms, the diagram keeps fitting the window as it resizes.
      const resize = new ResizeObserver(() => (fitted ? fit() : apply(scale)));
      resize.observe(viewport);

      loadRenderer()
        .then(async ({ pele, sanitize }) => {
          const style = getComputedStyle(viewport);
          // Unlike mount, render lays the diagram out at its own width, as written.
          const result = await pele.renderAsync(source.trim(), {
            links: false,
            images: false,
            autoDirection: false,
            fontFamily: style.getPropertyValue("--pele-font").trim() || undefined,
            fontFamilyMono:
              style.getPropertyValue("--pele-font-mono").trim() || undefined,
          });
          if (removed) return;
          canvas.replaceChildren(sanitize(result.svg));
          const svg = canvas.querySelector("svg");
          if (svg) {
            svg.style.width = "100%";
            svg.style.height = "100%";
            svg.style.maxWidth = "none";
          }
          natural = { width: result.width, height: result.height };
          fit();
        })
        .catch((reason: unknown) => {
          if (!removed) setError(failureOf(reason));
        });

      return () => {
        removed = true;
        viewer.current = null;
        resize.disconnect();
        viewport.removeEventListener("wheel", onWheel);
        viewport.removeEventListener("pointerdown", onPointerDown);
        viewport.removeEventListener("pointermove", onPointerMove);
        viewport.removeEventListener("pointerup", onPointerUp);
        viewport.removeEventListener("pointercancel", onPointerUp);
      };
    },
    [source],
  );
  return { ref, zoom, error, viewer };
}

/** The diagram at the size of the window, to scroll, pan and zoom. */
function ExpandedDiagram({
  source,
  onClose,
}: {
  source: string;
  onClose: () => void;
}) {
  const { ref, zoom, error, viewer } = useDiagramViewer(source);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex h-[calc(100svh-3rem)] w-[min(1400px,calc(100vw-3rem))] max-w-none flex-col gap-3 bg-background sm:max-w-none">
        <div className="flex items-center justify-between gap-3 pe-8">
          <DialogTitle className="text-sm font-medium">Diagram</DialogTitle>
          {zoom ? (
            <div className="flex items-center gap-0.5" role="toolbar" aria-label="Zoom">
              <IconButton
                label="Zoom out"
                disabled={zoom.scale <= zoom.min * 1.001}
                onClick={() => viewer.current?.zoomBy(1 / ZOOM_STEP)}
              >
                <ZoomOutIcon />
              </IconButton>
              <span className="w-11 text-center text-xs text-muted-foreground tabular-nums">
                {Math.round(zoom.scale * 100)}%
              </span>
              <IconButton
                label="Zoom in"
                disabled={zoom.scale >= MAX_SCALE * 0.999}
                onClick={() => viewer.current?.zoomBy(ZOOM_STEP)}
              >
                <ZoomInIcon />
              </IconButton>
              <IconButton
                label="Fit to window"
                aria-pressed={zoom.fitted}
                onClick={() => viewer.current?.fit()}
              >
                <ScanIcon />
              </IconButton>
            </div>
          ) : null}
        </div>
        <DialogDescription className="sr-only">
          The diagram at full size. Scroll to move around, drag to pan, and pinch or hold Ctrl
          or ⌘ while scrolling to zoom.
        </DialogDescription>
        {error ? (
          <p className="text-xs text-destructive-foreground">
            Couldn&apos;t draw this diagram: {error}
          </p>
        ) : null}
        <div
          ref={ref}
          className={cn(
            theme,
            "relative flex min-h-0 flex-1 overflow-auto rounded-lg border border-border select-none",
          )}
        />
      </DialogContent>
    </Dialog>
  );
}
