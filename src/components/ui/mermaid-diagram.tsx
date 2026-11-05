"use client";

// Follows T3 Code's apps/web/src/components/chat/MermaidDiagram.tsx and
// MarkdownMermaidCodeBlock.tsx (MIT): Pele draws the diagram, loaded on first use, and
// DOMPurify cleans its SVG.

import type { MountOptions, Mounted } from "pele/lazy";
import { CodeIcon, Maximize2Icon, WorkflowIcon } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";
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

/** Draws `source` into the element the returned ref is given, and reports how that went. */
function useDiagram(source: string, zoom: MountOptions["zoom"]) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const ref = useCallback(
    (container: HTMLDivElement) => {
      let mounted: Mounted | undefined;
      let removed = false;
      const fail = (reason: unknown) => {
        if (removed) return;
        setStatus("failed");
        // Pele's later lines point a caret at the source, which needs a monospace block.
        const summary =
          reason instanceof Error
            ? reason.message.split("\n")[0].replace(/:$/, "")
            : "";
        setError(summary || "it could not be drawn");
      };
      loadRenderer()
        .then(({ pele, sanitize }) =>
          pele.mountAsync(container, source.trim(), {
            links: false,
            images: false,
            zoom,
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
    [source, zoom],
  );
  return { ref, status, error };
}

const ZOOM_IN_PLACE = false;
const ZOOM_EXPANDED = { always: true, controls: true } as const;

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
  const { ref, status, error } = useDiagram(source, ZOOM_IN_PLACE);
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

/** The diagram at the size of the window, to pan and zoom. */
function ExpandedDiagram({
  source,
  onClose,
}: {
  source: string;
  onClose: () => void;
}) {
  const { ref } = useDiagram(source, ZOOM_EXPANDED);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex h-[calc(100svh-3rem)] w-[min(1400px,calc(100vw-3rem))] max-w-none flex-col gap-3 bg-background sm:max-w-none">
        <DialogTitle className="pr-8 text-sm font-medium">Diagram</DialogTitle>
        <DialogDescription className="sr-only">
          The diagram at full size. Scroll or pinch to zoom, and drag to pan.
        </DialogDescription>
        <div
          ref={ref}
          className={cn(
            theme,
            "relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-border",
          )}
        />
      </DialogContent>
    </Dialog>
  );
}
