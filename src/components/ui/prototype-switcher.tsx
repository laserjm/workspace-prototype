"use client";
// PROTOTYPE tooling, throwaway: the floating variant switcher from the prototype skill. Reads and
// writes `?variant=` with history.replaceState, so a variant is shareable and survives a reload.
// Renders nothing in production builds.
import { useEffect, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

const EVENT = "prototype-variant";

function subscribe(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener(EVENT, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(EVENT, callback);
  };
}

/** The `?variant=` key, or undefined without one (and always in production). */
export function usePrototypeVariant(): string | undefined {
  return useSyncExternalStore(
    subscribe,
    () =>
      process.env.NODE_ENV === "production"
        ? undefined
        : (new URLSearchParams(window.location.search).get("variant") ?? undefined),
    () => undefined,
  );
}

function setVariant(key: string) {
  const url = new URL(window.location.href);
  url.searchParams.set("variant", key);
  window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new Event(EVENT));
}

export function PrototypeSwitcher({
  variants,
  current,
}: {
  variants: readonly { key: string; name: string }[];
  current: string;
}) {
  const index = Math.max(0, variants.findIndex((variant) => variant.key === current));
  const step = (by: number) =>
    setVariant(variants[(index + by + variants.length) % variants.length].key);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, [contenteditable]")) return;
      if (event.key === "ArrowLeft") step(-1);
      if (event.key === "ArrowRight") step(1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (process.env.NODE_ENV === "production") return null;
  const variant = variants[index];
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-full bg-foreground px-1.5 py-1 text-xs text-background shadow-popover">
      <button type="button" aria-label="Previous variant" className="rounded-full p-1 hover:bg-background/20" onClick={() => step(-1)}>
        <ChevronLeft className="size-4" />
      </button>
      <span className="min-w-40 px-1 text-center font-medium">
        {variant.key} ({variant.name})
      </span>
      <button type="button" aria-label="Next variant" className="rounded-full p-1 hover:bg-background/20" onClick={() => step(1)}>
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
