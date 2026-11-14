"use client";

// Follows T3 Code's apps/web/src/components/chat/MarkdownCodeBlock.tsx (MIT), scaled down: a
// header with the language and a copy button, and Shiki highlighting loaded on first use.

import type { HighlighterCore, LanguageInput, ThemedToken } from "shiki/core";
import {
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";
import { CopyButton } from "./copy-button";

const THEMES = { light: "github-light", dark: "github-dark" } as const;
// Past this, tokenising on every streamed chunk costs more than the colour is worth.
const MAX_HIGHLIGHTED_LENGTH = 50_000;

type Shiki = {
  highlighter: HighlighterCore;
  /** Each grammar's loader, under its names and aliases. */
  languages: Map<string, LanguageInput>;
};

let shikiLoad: Promise<Shiki> | null = null;

// Shiki, its JavaScript regex engine (no WASM) and the two themes load with the first code
// block; each language's grammar is its own chunk, loaded when a block uses it.
function loadShiki(): Promise<Shiki> {
  shikiLoad ??= Promise.all([
    import("shiki/core"),
    import("shiki/engine/javascript"),
    import("shiki/langs"),
    import("shiki/themes"),
  ]).then(
    async ([core, engine, { bundledLanguages }, { bundledThemes }]) => ({
      highlighter: await core.createHighlighterCore({
        themes: [bundledThemes[THEMES.light](), bundledThemes[THEMES.dark]()],
        langs: [],
        engine: engine.createJavaScriptRegexEngine(),
      }),
      languages: new Map(Object.entries(bundledLanguages)),
    }),
    (error: unknown) => {
      shikiLoad = null;
      throw error;
    },
  );
  return shikiLoad;
}

/** Languages whose grammar is loaded, and those Shiki has none for or failed to load. */
const ready = new Map<string, HighlighterCore | "plain">();
const loading = new Set<string>();
const listeners = new Set<() => void>();

function requestLanguage(language: string) {
  if (ready.has(language) || loading.has(language)) return;
  loading.add(language);
  loadShiki()
    .then(async ({ highlighter, languages }) => {
      const grammar = languages.get(language);
      if (!grammar) return "plain" as const;
      await highlighter.loadLanguage(grammar);
      return highlighter;
    })
    .catch(() => "plain" as const)
    .then((result) => {
      loading.delete(language);
      ready.set(language, result);
      for (const listener of listeners) listener();
    });
}

/** The highlighter once `language` is loaded; null before, on the server, and when it can't be. */
function useHighlighter(language: string | null): HighlighterCore | null {
  const loaded = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      if (language) requestLanguage(language);
      return () => listeners.delete(listener);
    },
    () => (language ? ready.get(language) : undefined),
    () => undefined,
  );
  return loaded && loaded !== "plain" ? loaded : null;
}

/** Shiki's styles for a token, with CSS properties in the form React takes. */
function tokenStyle(token: ThemedToken): CSSProperties | undefined {
  if (!token.htmlStyle) return undefined;
  return Object.fromEntries(
    Object.entries(token.htmlStyle).map(([name, value]) => [
      name.startsWith("--")
        ? name
        : name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase()),
      value,
    ]),
  );
}

function highlighted(
  highlighter: HighlighterCore,
  code: string,
  language: string,
): ReactNode {
  try {
    const { tokens } = highlighter.codeToTokens(code, {
      lang: language,
      themes: THEMES,
      defaultColor: false,
    });
    return tokens.map((line, index) => (
      // Lines are the code's own order and never move.
      <span key={index}>
        {index > 0 ? "\n" : null}
        {line.map((token) => (
          <span key={token.offset} style={tokenStyle(token)}>
            {token.content}
          </span>
        ))}
      </span>
    ));
  } catch {
    return code;
  }
}

/**
 * A fenced or indented code block: the language, a copy button and the code, coloured by Shiki
 * once its grammar has loaded. `actions` go before the copy button.
 */
export function CodeBlock({
  code,
  language,
  actions,
  className,
}: {
  code: string;
  language: string | null;
  actions?: ReactNode;
  className?: string;
}) {
  const text = code.replace(/\n$/, "");
  const highlighter = useHighlighter(
    text.length <= MAX_HIGHLIGHTED_LENGTH ? language : null,
  );
  return (
    <div
      data-slot="code-block"
      dir="ltr"
      className={cn(
        "my-3 overflow-hidden rounded-lg border border-border bg-muted",
        className,
      )}
    >
      <div className="flex min-h-8 items-center justify-between gap-2 ps-3.5 pe-1 pt-1 select-none">
        <span className="truncate font-mono text-2xs text-muted-foreground">
          {language ?? "text"}
        </span>
        <span className="flex shrink-0 items-center">
          {actions}
          <CopyButton text={text} label="Copy code" className="size-6" />
        </span>
      </div>
      <pre className="max-w-full overflow-x-auto px-3.5 pt-1 pb-3 font-mono text-xs leading-normal [scrollbar-width:thin]">
        {/* Shiki gives each token both themes' colours as variables; the theme picks one. */}
        <code className="[&_span]:text-(--shiki-light) dark:[&_span]:text-(--shiki-dark)">
          {highlighter && language ? highlighted(highlighter, text, language) : text}
        </code>
      </pre>
    </div>
  );
}
