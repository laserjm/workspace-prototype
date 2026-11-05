"use client";

// Follows T3 Code's apps/web/src/components/chat/MarkdownMath.tsx and MathTypeset.tsx (MIT):
// KaTeX loads with the first formula, and TeX it cannot parse stays readable as source.

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

type Katex = typeof import("katex").default;

let katex: Katex | null = null;
let katexLoad: Promise<void> | null = null;
const listeners = new Set<() => void>();

function requestKatex() {
  katexLoad ??= import("katex").then(
    (module) => {
      katex = module.default;
      for (const listener of listeners) listener();
    },
    () => {
      katexLoad = null;
    },
  );
}

/** KaTeX once it has loaded; null before and on the server. */
function useKatex(): Katex | null {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      requestKatex();
      return () => listeners.delete(listener);
    },
    () => katex,
    () => null,
  );
}

// Finished messages render the same formulas again on every visit to a thread. "" records TeX
// that does not parse.
const typeset = new Map<string, string>();
const MAX_TYPESET = 500;

function mathml(katex: Katex, tex: string, display: boolean): string {
  const key = `${display ? "display" : "inline"}:${tex}`;
  const cached = typeset.get(key);
  if (cached !== undefined) return cached;
  let markup = "";
  try {
    markup = katex.renderToString(tex, {
      displayMode: display,
      // The browser lays out MathML itself, so no KaTeX stylesheet or fonts are needed.
      output: "mathml",
      throwOnError: true,
      // No \href, \url, \htmlClass or other commands that emit active HTML.
      trust: false,
      strict: "ignore",
      maxSize: 20,
      maxExpand: 1000,
    });
  } catch {
    // Unfinished or unsupported TeX, such as mid-stream, shows as its source.
  }
  if (typeset.size >= MAX_TYPESET) typeset.clear();
  typeset.set(key, markup);
  return markup;
}

/** A `$$` formula: inline in a sentence, or on its own as display math. */
export function MathFormula({ tex, display }: { tex: string; display: boolean }) {
  const katex = useKatex();
  const source = tex.trim();
  const markup = katex ? mathml(katex, source, display) : "";
  const Element = display ? "div" : "span";
  return (
    <Element
      data-slot="math"
      className={cn(
        display
          ? "my-3 overflow-x-auto overflow-y-hidden py-1 text-base"
          : "inline-block max-w-full overflow-x-auto align-middle",
        !markup && "font-mono text-xs whitespace-pre-wrap text-muted-foreground",
      )}
      // KaTeX escapes the TeX it renders, and `trust: false` keeps it from emitting links or
      // attributes.
      {...(markup
        ? { dangerouslySetInnerHTML: { __html: markup } }
        : { children: display ? `$$\n${source}\n$$` : `$$${source}$$` })}
    />
  );
}
