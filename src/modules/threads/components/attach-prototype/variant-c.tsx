"use client";
// PROTOTYPE, throwaway. Variant C, "Inline #": no dialog. The connection is chosen where today's
// source picker sits (choosing it attaches the connection itself); typing `#` in the question
// suggests that connection's issues and PRs, and picking one writes `web#482` into the text and
// adds its chip.
import { useState, type KeyboardEvent, type RefObject } from "react";
import { Check, ChevronDown, Hash } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { inlineTriggerClassName } from "@/components/ui/inline-trigger";
import { cn } from "@/lib/utils";
import { CONNECTIONS, connectionById, EMPTY_FILTER, search, shortRef, type Filter } from "./fixtures";
import type { DraftApi } from "./draft";
import { ConnectionIcon, ItemRow, LimitNote } from "./parts";

type Mention = { start: number; query: string };

export function useVariantC({
  draft,
  prompt,
  setPrompt,
  textarea,
}: {
  draft: DraftApi;
  prompt: string;
  setPrompt: (value: string) => void;
  textarea: RefObject<HTMLTextAreaElement | null>;
}) {
  const [connectionId, setConnectionId] = useState(CONNECTIONS[0].id);
  const [mention, setMention] = useState<Mention | null>(null);
  const [active, setActive] = useState(0);
  const [type, setType] = useState<Filter["type"]>("any");
  const [state, setState] = useState<Filter["state"]>("open");
  const connection = connectionById(connectionId);
  const query = mention?.query ?? "";
  const results = mention
    ? search(connectionId, { ...EMPTY_FILTER, type, state, text: query.replace(/^\d/, "#$&") }).slice(0, 7)
    : [];

  function onPromptChange(value: string) {
    const caret = textarea.current?.selectionStart ?? value.length;
    const found = /(?:^|\s)#([\w\-/.]*)$/.exec(value.slice(0, caret));
    setMention(found ? { start: caret - found[1].length - 1, query: found[1] } : null);
    setActive(0);
  }

  function pick(index: number) {
    const item = results[index];
    if (!item || !mention) return;
    draft.add(connectionId, item.key);
    const ref = shortRef(item);
    const end = mention.start + 1 + mention.query.length;
    const next = `${prompt.slice(0, mention.start)}${ref} ${prompt.slice(end)}`;
    setPrompt(next);
    setMention(null);
    requestAnimationFrame(() => {
      const caret = mention.start + ref.length + 1;
      textarea.current?.focus();
      textarea.current?.setSelectionRange(caret, caret);
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (!mention) return false;
    if (event.key === "ArrowDown") setActive((index) => Math.min(index + 1, results.length - 1));
    else if (event.key === "ArrowUp") setActive((index) => Math.max(index - 1, 0));
    else if (event.key === "Enter" || event.key === "Tab") {
      if (!results.length) return false;
      pick(active);
    } else if (event.key === "Escape") setMention(null);
    else return false;
    event.preventDefault();
    return true;
  }

  const entry = (
    <div className="flex items-center gap-3">
      <DropdownMenu>
        <DropdownMenuTrigger render={<button type="button" className={cn(inlineTriggerClassName, "shrink-0 py-1")} />}>
          <ConnectionIcon connection={connection} />
          <span>{connection.name}</span>
          <ChevronDown />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-72">
          <p className="px-2 py-1.5 text-xs text-muted-foreground">Ask about a connection</p>
          {CONNECTIONS.map((entry) => (
            <DropdownMenuItem
              key={entry.id}
              className="gap-2.5 py-2"
              onClick={() => {
                setConnectionId(entry.id);
                draft.attachConnection(entry.id);
              }}
            >
              <ConnectionIcon connection={entry} />
              <span>
                <strong className="block text-xs font-medium">{entry.name}</strong>
                <small className="mt-0.5 block text-3xs text-secondary-label">{entry.reach}</small>
              </span>
              {entry.id === connectionId && <Check className="ml-auto" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <p className="px-2 py-1.5 text-3xs leading-relaxed text-muted-foreground">
            Choosing one lets the agent search it. Type # in your question to attach specific issues and pull requests.
          </p>
        </DropdownMenuContent>
      </DropdownMenu>
      <span className="flex items-center gap-1 text-3xs text-muted-foreground">
        <Hash className="size-3" /> type # to attach
      </span>
    </div>
  );

  const overlay = mention && (
    <div className="absolute bottom-full left-2 z-40 mb-2 flex w-[min(30rem,calc(100%-1rem))] flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-popover">
      <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-3xs text-muted-foreground">
        <ConnectionIcon connection={connection} className="size-3" />
        <span className="text-secondary-foreground">{connection.name}</span>
        <span className="font-mono">#{query}</span>
        <span className="flex-1" />
        {connection.provider === "github" && (
          <>
            {(["any", "issue", "pr"] as const).map((value) => (
              <button key={value} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setType(value)} className={cn("rounded-sm px-1", type === value && "bg-accent text-secondary-foreground")}>
                {{ any: "All", issue: "Issues", pr: "PRs" }[value]}
              </button>
            ))}
            <span className="h-3 w-px bg-border" />
            {(["open", "any"] as const).map((value) => (
              <button key={value} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setState(value)} className={cn("rounded-sm px-1", state === value && "bg-accent text-secondary-foreground")}>
                {value === "open" ? "Open" : "Any state"}
              </button>
            ))}
          </>
        )}
      </div>
      <div role="listbox" className="max-h-72 overflow-y-auto py-1">
        {results.map((item, index) => (
          <div key={item.key} onMouseDown={(e) => e.preventDefault()}>
            <ItemRow item={item} checkbox={false} active={index === active} checked={draft.has(connectionId, item.key)} disabled={draft.full} onToggle={() => pick(index)} />
          </div>
        ))}
        {!results.length && <p className="p-4 text-center text-xs text-muted-foreground">No match for “{query}”.</p>}
      </div>
      <footer className="flex items-center justify-between border-t border-border px-3 py-1 text-3xs text-muted-foreground">
        <span>↑↓ · ⏎ attach · esc</span>
        <LimitNote count={draft.count} />
      </footer>
    </div>
  );

  return { entry, overlay, onPromptChange, onKeyDown, placeholder: "Ask anything. Type # to attach an issue or pull request…" };
}
