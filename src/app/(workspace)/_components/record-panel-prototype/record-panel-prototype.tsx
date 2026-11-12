"use client";
// PROTOTYPE, throwaway (wayfinder: "How the right-hand panel hosts several record views").
// Four variants of the right-hand panel hosting record views, on the real workspace page, gated by
// `?variant=A|B|C|D`. The conversation is simulated by the buttons in the dashed strip, because
// attached items do not exist yet: "Send" stands for sending a question with attached items, and
// "Click chip" for clicking a record linked in the reply.
import { PanelRight } from "lucide-react";
import { PrototypeSwitcher } from "@/components/ui/prototype-switcher";
import { cn } from "@/lib/utils";
import { MESSAGES, RECORDS, shortLabel } from "./fixtures";
import { usePanelState } from "./panel-state";
import { VARIANTS } from "./variants";

export function RecordPanelPrototype({
  threadId,
  variant,
}: {
  threadId: string;
  variant: string;
}) {
  const [state, dispatch] = usePanelState(threadId);
  const current = VARIANTS.find((entry) => entry.key === variant) ?? VARIANTS[0];
  const Variant = current.Component;
  const replyLinks = MESSAGES.slice(0, state.sent).flatMap((message) => [...message.replyLinks]);

  return (
    <>
      <aside
        className={cn(
          "flex h-full w-120 min-w-80 shrink-0 flex-col border-l border-border bg-background",
          // Below the desktop width the panel floats over the conversation, as a sheet.
          "max-desktop:absolute max-desktop:inset-y-0 max-desktop:right-0 max-desktop:z-30 max-desktop:w-[min(30rem,88vw)] max-desktop:shadow-popover",
        )}
        aria-label="Record views (prototype)"
      >
        <div className="flex h-10 shrink-0 items-center gap-2 border-b border-border px-3 text-xs">
          <PanelRight className="size-3.5 text-muted-foreground" />
          <span className="font-medium text-secondary-foreground">Views</span>
          <span className="text-3xs text-muted-foreground">
            {state.openIds.length} open
          </span>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-2xs dark:border-amber-400/50 dark:bg-amber-400/10">
          <span className="font-medium text-amber-800 dark:text-amber-300">Simulate</span>
          {MESSAGES.map((message, index) => (
            <SimButton
              key={index}
              disabled={state.sent !== index}
              onClick={() => dispatch({ type: "send", index })}
              title={`${message.question} (attaches ${message.attached.map((id) => shortLabel(RECORDS[id])).join(", ")})`}
            >
              Send Q{index + 1} ({message.attached.length} attached)
            </SimButton>
          ))}
          {replyLinks.map((id) => (
            <SimButton key={id} onClick={() => dispatch({ type: "open", id, from: "chip" })}>
              Click chip {shortLabel(RECORDS[id])} in reply
            </SimButton>
          ))}
          {state.sent > 0 && (
            <SimButton onClick={() => dispatch({ type: "open", id: MESSAGES[0].attached[0], from: "chip" })}>
              Click chip {shortLabel(RECORDS[MESSAGES[0].attached[0]])} in Q1
            </SimButton>
          )}
          <SimButton onClick={() => dispatch({ type: "reset" })}>Reset</SimButton>
        </div>

        <Variant state={state} dispatch={dispatch} />

        <details className="shrink-0 border-t border-dashed border-amber-400 bg-amber-50 px-3 py-1.5 font-mono text-3xs text-amber-900 dark:border-amber-400/50 dark:bg-amber-400/10 dark:text-amber-200">
          <summary className="cursor-pointer">State</summary>
          <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap">
            {JSON.stringify(
              {
                thread: threadId.slice(0, 8),
                sent: state.sent,
                openIds: state.openIds,
                activeId: state.activeId,
                pinnedId: state.pinnedId,
                log: state.log,
              },
              null,
              1,
            )}
          </pre>
        </details>
      </aside>
      <PrototypeSwitcher variants={VARIANTS} current={current.key} />
    </>
  );
}

function SimButton({
  className,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      className={cn(
        "rounded-md border border-amber-300 bg-background px-1.5 py-0.5 text-amber-900 hover:bg-amber-100 disabled:opacity-40 dark:border-amber-400/40 dark:text-amber-200 dark:hover:bg-amber-400/20",
        className,
      )}
      {...props}
    />
  );
}
