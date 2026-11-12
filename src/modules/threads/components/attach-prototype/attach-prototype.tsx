"use client";
// PROTOTYPE, throwaway (wayfinder: "How the attach dialog filters and picks GitHub issues and pull
// requests"). Four variants of picking GitHub issues and pull requests into the composer, on the
// real composer, gated by `?variant=A` to `F`. Without `?variant=` the composer is unchanged.
// Sending is simulated: the question is not sent, it is shown in the dashed strip above the
// composer as the sent message would look. Data is canned (./fixtures.ts).
import { useState, type ReactNode, type RefObject } from "react";
import { PrototypeSwitcher, usePrototypeVariant } from "@/components/ui/prototype-switcher";
import { connectionById, itemByKey } from "./fixtures";
import { useDraft, type Draft } from "./draft";
import { DraftChips } from "./parts";
import { VariantAEntry } from "./variant-a";
import { VariantB } from "./variant-b";
import { useVariantC } from "./variant-c";
import { VariantD } from "./variant-d";
import { VariantEEntry } from "./variant-e";

const VARIANTS = [
  { key: "A", name: "Dialog + facets" },
  { key: "B", name: "Query palette" },
  { key: "C", name: "Inline #" },
  { key: "D", name: "Browse sheet" },
  { key: "E", name: "Simple dialog, typeahead + list" },
  { key: "F", name: "Simple dialog, chips in the field" },
] as const;

export function useAttachPrototype({
  prompt,
  setPrompt,
  textarea,
}: {
  prompt: string;
  setPrompt: (value: string) => void;
  textarea: RefObject<HTMLTextAreaElement | null>;
}) {
  const variant = usePrototypeVariant();
  const draft = useDraft();
  const [sent, setSent] = useState<{ prompt: string; draft: Draft }[]>([]);
  const [opened, setOpened] = useState("");
  // Called unconditionally (hooks); only used for variant C.
  const c = useVariantC({ draft, prompt, setPrompt, textarea });
  const key = VARIANTS.find((entry) => entry.key === variant)?.key;
  if (!key) return undefined;

  const entry: ReactNode =
    key === "A" ? <VariantAEntry draft={draft} /> : key === "B" ? <VariantB draft={draft} /> : key === "C" ? (
      c.entry
    ) : key === "D" ? (
      <VariantD draft={draft} />
    ) : (
      <VariantEEntry key={key} draft={draft} mode={key === "E" ? "list" : "chips"} />
    );

  const open = (connectionId: string, itemKey?: string) => {
    const item = itemKey ? itemByKey(connectionId, itemKey) : undefined;
    setOpened(
      item
        ? `Opens or focuses ${item.kind === "pr" ? "github.pull-request-view" : item.kind === "issue" ? "github.issue-view" : "confluence.page-view"} · ${item.key} in the right-hand panel`
        : `${connectionById(connectionId).name} has no view; the agent may search it in this thread`,
    );
  };

  return {
    entry,
    overlay: key === "C" ? c.overlay : null,
    onPromptChange: key === "C" ? c.onPromptChange : undefined,
    onKeyDown: key === "C" ? c.onKeyDown : undefined,
    placeholder: key === "C" ? c.placeholder : "Ask about the attached items, or anything…",
    chips: <DraftChips draft={draft.draft} onRemove={draft.remove} className="px-2 pb-3" />,
    /** Instead of sending: show the sent message, clear the draft. */
    send(text: string) {
      setSent((all) => [...all, { prompt: text, draft: draft.draft }]);
      draft.clear();
      setOpened("");
    },
    simulation: (
      <div className="mx-2 mb-3 rounded-lg border border-dashed border-amber-400 bg-amber-50/60 p-2 text-2xs dark:border-amber-400/50 dark:bg-amber-400/10">
        <div className="flex items-center gap-2 text-amber-800 dark:text-amber-300">
          <span className="font-medium">Prototype {key}</span>
          <span>· sending is simulated; the sent question shows here</span>
          <span className="flex-1" />
          {sent.length > 0 && (
            <button type="button" className="underline" onClick={() => setSent([])}>
              clear
            </button>
          )}
        </div>
        {sent.slice(-2).map((message, index) => (
          <div key={index} className="mt-2 flex flex-col items-end gap-1.5">
            <p className="max-w-[85%] rounded-2xl bg-accent px-3 py-2 text-xs whitespace-pre-wrap text-secondary-foreground">{message.prompt}</p>
            <DraftChips draft={message.draft} onClick={open} withTitle={false} className="max-w-[85%] justify-end" />
          </div>
        ))}
        {opened && <p className="mt-1.5 text-right text-3xs text-amber-800 dark:text-amber-300">↳ {opened}</p>}
        <details className="mt-1.5 text-3xs text-muted-foreground">
          <summary className="cursor-pointer">Draft state</summary>
          <pre className="mt-1 overflow-x-auto font-mono">{JSON.stringify(draft.draft, null, 1)}</pre>
        </details>
      </div>
    ),
    switcher: <PrototypeSwitcher variants={VARIANTS} current={key} />,
  };
}
