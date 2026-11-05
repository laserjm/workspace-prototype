"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type ReactNode,
} from "react";

const STORAGE_KEY = "workspace:source-panel-width";
const DEFAULT_WIDTH = 400;
const MIN_WIDTH = 320;
const MIN_CONVERSATION_WIDTH = 440;
// While dragging, <html data-resizing="source-panel"> keeps the col-resize
// cursor everywhere (a base rule in globals.css) and lights the handle.

function readWidth() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const width = Number(stored);
    if (stored !== null && Number.isFinite(width))
      return Math.max(MIN_WIDTH, Math.min(1000, width));
  } catch {
    // Resizing remains available when browser storage is unavailable.
  }
  return DEFAULT_WIDTH;
}

function saveWidth(width: number) {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(width));
  } catch {
    // Keep the current width for this mounted panel.
  }
}

export function ResizableSourcePanel({ children }: { children: ReactNode }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    target: HTMLDivElement;
    pointerId: number;
    startX: number;
    startWidth: number;
    width: number;
  } | null>(null);
  const [width, setWidth] = useState(readWidth);
  const [maxWidth, setMaxWidth] = useState(1000);
  const displayedWidth = Math.min(maxWidth, Math.max(MIN_WIDTH, width));

  useEffect(() => {
    const container = panelRef.current?.parentElement;
    if (!container) return;
    const observer = new ResizeObserver(() => {
      setMaxWidth(
        Math.max(
          MIN_WIDTH,
          Math.min(1000, container.clientWidth - MIN_CONVERSATION_WIDTH),
        ),
      );
    });
    observer.observe(container);
    const onBlur = () => {
      const active = drag.current;
      if (!active) return;
      drag.current = null;
      saveWidth(active.width);
      if (active.target.hasPointerCapture(active.pointerId))
        active.target.releasePointerCapture(active.pointerId);
      delete document.documentElement.dataset.resizing;
    };
    window.addEventListener("blur", onBlur);
    return () => {
      observer.disconnect();
      window.removeEventListener("blur", onBlur);
      drag.current = null;
      delete document.documentElement.dataset.resizing;
    };
  }, []);

  function clamp(next: number) {
    return Math.min(maxWidth, Math.max(MIN_WIDTH, next));
  }

  function commit(next: number) {
    const clamped = clamp(next);
    setWidth(clamped);
    saveWidth(clamped);
  }

  function finishDrag(event: PointerEvent<HTMLDivElement>, cancelled = false) {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drag.current = null;
    if (cancelled) setWidth(active.startWidth);
    else commit(active.width);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    delete document.documentElement.dataset.resizing;
  }

  return (
    <div
      className="relative h-full max-w-[calc(100%-27.5rem)] min-w-80 shrink-0"
      ref={panelRef}
      style={{ width: displayedWidth }}
    >
      <div
        role="separator"
        aria-label="Resize source explorer"
        aria-controls="source-explorer"
        aria-orientation="vertical"
        aria-valuemin={MIN_WIDTH}
        aria-valuemax={maxWidth}
        aria-valuenow={Math.round(displayedWidth)}
        aria-valuetext={`${Math.round(displayedWidth)} pixels wide`}
        tabIndex={0}
        className="absolute inset-y-0 -left-1 z-20 w-2 cursor-col-resize touch-none outline-none select-none after:absolute after:inset-y-0 after:left-1 after:w-0.5 after:bg-transparent after:transition-colors after:duration-150 hover:after:bg-ring focus-visible:after:bg-muted-foreground active:after:bg-ring in-data-[resizing=source-panel]:after:bg-ring"
        title="Drag to resize · Double-click to reset"
        onPointerDown={(event) => {
          if (event.button !== 0 || drag.current) return;
          event.preventDefault();
          event.currentTarget.focus();
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = {
            target: event.currentTarget,
            pointerId: event.pointerId,
            startX: event.clientX,
            startWidth: displayedWidth,
            width: displayedWidth,
          };
          document.documentElement.dataset.resizing = "source-panel";
        }}
        onPointerMove={(event) => {
          const active = drag.current;
          if (!active || active.pointerId !== event.pointerId) return;
          active.width = clamp(
            active.startWidth + active.startX - event.clientX,
          );
          setWidth(active.width);
        }}
        onPointerUp={(event) => finishDrag(event)}
        onPointerCancel={(event) => finishDrag(event, true)}
        onLostPointerCapture={(event) => finishDrag(event)}
        onDoubleClick={() => commit(DEFAULT_WIDTH)}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 64 : 24;
          const next = {
            ArrowLeft: displayedWidth + step,
            ArrowRight: displayedWidth - step,
            Home: MIN_WIDTH,
            End: maxWidth,
          }[event.key];
          if (event.key === "Escape" && drag.current) {
            const active = drag.current;
            drag.current = null;
            setWidth(active.startWidth);
            active.target.releasePointerCapture(active.pointerId);
            delete document.documentElement.dataset.resizing;
            event.preventDefault();
          } else if (next !== undefined) {
            event.preventDefault();
            commit(next);
          }
        }}
      />
      {children}
    </div>
  );
}
