"use client";

import { useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  FileText,
  LoaderCircle,
  Paperclip,
  Plug,
  Plus,
  Shield,
  ShieldOff,
  Square,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton, iconButtonClassName } from "@/components/ui/icon-button";
import { inlineTriggerClassName } from "@/components/ui/inline-trigger";
import { cn } from "@/lib/utils";
import { SkillPicker, useSkills } from "@/modules/skills";
import {
  recordCountLabel,
  SourcePicker,
  SourceScopeSummary,
  useSources,
} from "@/modules/sources";
import {
  AttachDialog,
  AttachedItemChip,
  removeConnection,
  removeItem,
  type AttachedConnection,
} from "@/modules/records";
import type { ModelChoice } from "@/modules/agent";
import type { ThreadScope } from "../contracts";
import { attachmentChipClassName } from "./attachment-chip";
import { ProviderIcon } from "./provider-icon";

// The send button's two looks: idle grey, ready dark. Disabled stays opaque.
const sendButton =
  "size-9 rounded-full bg-accent text-icon-muted disabled:opacity-100 max-md:size-8 [&_svg:not([class*='size-'])]:size-5 [&_svg]:stroke-[2.3]";
const sendReady =
  "bg-primary text-primary-foreground hover:bg-primary/85 hover:text-primary-foreground";

// In a source session (`data-session` on <main>, read through group/main)
// the composer is a step denser.

/** The message composer: source and scope, attachments, model, skill and permissions. */
export function PromptForm({
  models,
  onSend,
  onSources,
  compact = false,
  scope,
  onScope,
  onChooseSource,
  onClearSource,
  enabledSkills,
  onManageSkills,
  initialSkill,
  busy = false,
  onStop,
}: {
  models: ModelChoice[];
  /** Resolves false when the message was not taken; the form then keeps it. */
  onSend: (
    prompt: string,
    attachments: string[],
    modelId: string,
    skillId?: string,
  ) => Promise<boolean>;
  onSources: () => void;
  compact?: boolean;
  scope?: ThreadScope;
  onScope?: () => void;
  onChooseSource?: (id: string) => void;
  onClearSource?: () => void;
  enabledSkills: string[];
  onManageSkills: () => void;
  initialSkill?: string;
  busy?: boolean;
  /** Shown in place of send while busy. */
  onStop?: () => void;
}) {
  const { sourceById } = useSources();
  const { skillById } = useSkills();
  const source = scope ? sourceById(scope.sourceId) : undefined;
  const scopeLabel =
    source && scope ? recordCountLabel(source, scope.recordIds.length) : "";
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState(models[0]);
  const [permission, setPermission] = useState("Full access");
  const [attachments, setAttachments] = useState<File[]>([]);
  // The records the question is about; sending them comes with the data part (#59).
  const [attached, setAttached] = useState<readonly AttachedConnection[]>([]);
  const [attaching, setAttaching] = useState(false);
  const [error, setError] = useState("");
  const [chosenSkill, setChosenSkill] = useState<string | undefined>(
    initialSkill,
  );
  const selectedSkill =
    chosenSkill && enabledSkills.includes(chosenSkill)
      ? chosenSkill
      : undefined;
  const skill = selectedSkill ? skillById(selectedSkill) : undefined;
  const fileInput = useRef<HTMLInputElement>(null);
  const textarea = useRef<HTMLTextAreaElement>(null);
  const canSend = prompt.trim().length > 0 && !busy;

  async function submit() {
    if (!canSend) return;
    const draft = { prompt, attachments, attached };
    setPrompt("");
    setAttachments([]);
    setAttached([]);
    const sent = await onSend(
      draft.prompt.trim(),
      draft.attachments.map((file) => file.name),
      model.id,
      selectedSkill,
    );
    if (sent) return;
    setPrompt(draft.prompt);
    setAttachments(draft.attachments);
    setAttached(draft.attached);
  }

  return (
    <div className="relative w-full shrink-0">
      {!compact && scope && (
        <button
          type="button"
          className="mx-2 mb-3 flex items-center gap-2 rounded-sm text-left text-2xs text-secondary-label hover:text-info-foreground max-md:ml-1 max-md:max-w-full max-md:gap-1 max-md:text-3xs"
          onClick={() => {
            setPrompt(
              `${skill?.prompt ?? "Create a summary of these"} ${scopeLabel}.`,
            );
            requestAnimationFrame(() => textarea.current?.focus());
          }}
        >
          <span className="rounded-sm bg-accent px-1.5 py-px text-3xs text-muted-foreground max-md:hidden">
            Try it
          </span>
          {skill?.prompt ?? "Create a summary of these"} {scopeLabel}{" "}
          <ArrowUp size={12} className="shrink-0 rotate-45" />
        </button>
      )}
      <div className="mx-2 mb-2.5 flex min-w-0 items-center gap-3 max-md:mx-1 max-md:gap-2">
        <button
          type="button"
          className={cn(inlineTriggerClassName, "shrink-0")}
          onClick={() => setAttaching(true)}
        >
          <Plus />
          <span>
            {attached.length ? "Change data sources" : "Choose a data source"}
          </span>
        </button>
        {onChooseSource && onClearSource && (
          <SourcePicker
            selected={scope?.sourceId}
            onSelect={onChooseSource}
            onClear={onClearSource}
          />
        )}
        {scope && onScope && (
          <SourceScopeSummary
            sourceId={scope.sourceId}
            recordCount={scope.recordIds.length}
            onClick={onScope}
            showSource={!onChooseSource}
          />
        )}
      </div>
      <form
        className={cn(
          "w-full rounded-2xl border border-border bg-card px-2.5 pt-4.5 pb-2 shadow-composer focus-within:border-ring/50 max-md:pt-3.5",
          "group-data-[session=source]/main:rounded-xl",
        )}
        aria-busy={busy}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {(attachments.length > 0 || attached.length > 0) && (
          <div className="flex flex-wrap gap-1.5 px-2 pb-3">
            {attached.map((connection) =>
              connection.items.length ? (
                connection.items.map((item) => (
                  <AttachedItemChip
                    key={`${connection.connectionId}:${item.type}:${item.key}`}
                    connection={connection}
                    item={item}
                    onRemove={() =>
                      setAttached((current) =>
                        removeItem(current, connection.connectionId, item.type, item.key),
                      )
                    }
                  />
                ))
              ) : (
                <AttachedItemChip
                  key={connection.connectionId}
                  connection={connection}
                  onRemove={() =>
                    setAttached((current) =>
                      removeConnection(current, connection.connectionId),
                    )
                  }
                />
              ),
            )}
            {attachments.map((file, index) => (
              <span
                className={attachmentChipClassName}
                key={`${file.name}-${index}`}
              >
                <FileText size={14} className="shrink-0" />
                <span className="truncate">{file.name}</span>
                <button
                  type="button"
                  className="flex rounded-xs"
                  aria-label={`Remove ${file.name}`}
                  onClick={() =>
                    setAttachments((files) =>
                      files.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          ref={textarea}
          // 16px on phones: iOS zooms into smaller fields on focus.
          className={cn(
            "block max-h-50 w-full resize-none border-none bg-transparent px-2 text-sm leading-relaxed text-secondary-foreground outline-none [field-sizing:content] placeholder:text-placeholder max-md:text-base",
            compact ? "min-h-12" : "min-h-14.5 max-md:min-h-15.5 4xl:min-h-15",
            "group-data-[session=source]/main:leading-5 max-md:group-data-[session=source]/main:leading-6",
          )}
          aria-label="Message"
          placeholder={
            source
              ? `Ask about these ${source.plural}…`
              : "Ask anything, or choose a source to add context…"
          }
          value={prompt}
          rows={compact ? 2 : 3}
          onChange={(event) => setPrompt(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              void submit();
            }
          }}
        />
        <div className="flex min-h-9 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  aria-label="Add attachments or data sources"
                  size="icon-sm"
                  variant="ghost"
                  className={cn(iconButtonClassName, "size-7.5")}
                />
              }
            >
              <Paperclip />
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-52" side="top">
              <DropdownMenuItem onClick={() => fileInput.current?.click()}>
                <Paperclip />
                Attach files
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setAttaching(true)}>
                <Plug />
                Choose a data source
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            ref={fileInput}
            type="file"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-label="Attach files"
            onChange={(event) => {
              const files = Array.from(event.target.files ?? []);
              if (files.some((file) => file.size > 20 * 1024 * 1024)) {
                setError("Choose files smaller than 20 MB.");
              } else {
                setError("");
                setAttachments((previous) => [...previous, ...files]);
              }
              event.target.value = "";
            }}
          />
          <div className="flex-1" />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  type="button"
                  className={cn(
                    "h-8 gap-1.5 rounded-md px-2 text-sm font-normal text-accent-foreground max-md:gap-1 max-md:pr-1",
                    "group-data-[session=source]/main:text-xs",
                  )}
                  aria-label={`Choose model, ${model.label} ${model.effort}`}
                />
              }
            >
              <ProviderIcon
                provider={model.provider}
                className={cn(
                  "size-5 max-md:size-4.5",
                  "group-data-[session=source]/main:size-4 max-md:group-data-[session=source]/main:size-4",
                )}
              />
              <span>
                {model.label}{" "}
                <span className="text-secondary-label">{model.effort}</span>
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-56">
              {models.map((item) => (
                <DropdownMenuItem key={item.id} onClick={() => setModel(item)}>
                  <ProviderIcon provider={item.provider} />
                  {item.label}
                  <span className="ml-auto text-xs text-muted-foreground">
                    {item.effort}
                  </span>
                  {model.id === item.id && <Check className="size-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {busy && onStop ? (
            <IconButton
              label="Stop response"
              type="button"
              className={cn(sendButton, sendReady)}
              onClick={onStop}
            >
              <Square className="fill-current" />
            </IconButton>
          ) : (
            <IconButton
              label="Send message"
              type="submit"
              className={cn(sendButton, canSend && sendReady)}
              disabled={!canSend}
            >
              {busy ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
            </IconButton>
          )}
        </div>
      </form>
      <div className="mx-1.5 mt-3 flex items-center justify-between gap-2">
        <SkillPicker
          selected={selectedSkill}
          enabledSkills={enabledSkills}
          onSelect={setChosenSkill}
          onManage={onManageSkills}
        />
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button
                type="button"
                className={inlineTriggerClassName}
                aria-label={`Permissions: ${permission}`}
              />
            }
          >
            {permission === "Full access" ? <ShieldOff /> : <Shield />}
            <span>{permission}</span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            {["Full access", "Ask before changes", "Read only"].map((item) => (
              <DropdownMenuItem key={item} onClick={() => setPermission(item)}>
                {item}
                {permission === item && <Check className="ml-auto" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <p className="px-2 py-1.5 text-xs leading-relaxed text-muted-foreground">
              Demo preferences. Responses are read-only and cannot change your
              source systems.
            </p>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {attaching && (
        <AttachDialog
          attached={attached}
          onApply={setAttached}
          onClose={() => setAttaching(false)}
          onConnect={onSources}
        />
      )}
      {error && (
        <p role="alert" className="mx-1.5 mt-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {skill && (
        <p className="mx-1.5 mt-2 text-3xs leading-relaxed text-muted-foreground/70">
          <span className="text-muted-foreground">{skill.name}</span> ·{" "}
          {scope
            ? skill.output
            : "Choose a source to try this skill with sample data"}
        </p>
      )}
    </div>
  );
}
