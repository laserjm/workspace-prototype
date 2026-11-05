"use client";

// Follows T3 Code's apps/web/src/components/chat/MermaidDiagram.tsx (MIT): Pele draws the
// diagram, loaded on first use, and DOMPurify cleans its SVG.

import type { Mounted } from "pele/lazy";
import { CodeIcon, WorkflowIcon } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
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

/**
 * A Mermaid diagram, with its code block (`children`) shown until it is drawn, when it
 * cannot be, and on request.
 */
export function MermaidDiagram({
  source,
  children,
}: {
  source: string;
  children: ReactNode;
}) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);

  const mountDiagram = useCallback(
    (container: HTMLDivElement) => {
      let mounted: Mounted | undefined;
      let removed = false;
      const fail = (reason: unknown) => {
        if (removed) return;
        setStatus("failed");
        // Pele's later lines point a caret at the source, which needs a monospace block.
        const summary =
          reason instanceof Error ? reason.message.split("\n")[0].replace(/:$/, "") : "";
        setError(summary || "it could not be drawn");
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

  const drawn = status === "drawn";
  return (
    <div data-slot="mermaid" className="relative my-3">
      {error ? (
        <p className="mb-1.5 text-xs text-destructive-foreground">
          Couldn&apos;t draw this diagram: {error}
        </p>
      ) : null}
      {!drawn || showCode ? children : null}
      {/* Laid out but invisible while it loads, so Pele can measure the width it has. */}
      <div
        ref={mountDiagram}
        className={cn(
          theme,
          "flex justify-center overflow-x-auto rounded-lg border border-border bg-background px-3.5 py-3",
          status === "loading" && "invisible absolute inset-x-0 top-0",
          (status === "failed" || showCode) && "hidden",
        )}
      />
      {drawn ? (
        <IconButton
          label="Show code"
          aria-pressed={showCode}
          onClick={() => setShowCode((value) => !value)}
          className="absolute end-1.5 top-1.5"
        >
          {showCode ? <WorkflowIcon /> : <CodeIcon />}
        </IconButton>
      ) : null}
    </div>
  );
}
