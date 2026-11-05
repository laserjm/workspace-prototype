"use client";

import { useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  FileText,
  LoaderCircle,
  Paperclip,
  Plug,
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
import { IconButton } from "@/components/ui/icon-button";
import { SkillPicker, useSkills } from "@/modules/skills";
import {
  recordCountLabel,
  SourcePicker,
  SourceScopeSummary,
  useSources,
} from "@/modules/sources";
import type { ModelChoice } from "../domain/model-choice";
import type { ThreadScope } from "../domain/thread";
import { ProviderIcon } from "./provider-icon";

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
  const canSend = prompt.trim().length > 0 && !busy;

  async function submit() {
    if (!canSend) return;
    const draft = { prompt, attachments };
    setPrompt("");
    setAttachments([]);
    const sent = await onSend(
      draft.prompt.trim(),
      draft.attachments.map((file) => file.name),
      model.id,
      selectedSkill,
    );
    if (sent) return;
    setPrompt(draft.prompt);
    setAttachments(draft.attachments);
  }

  return (
    <div className={`composer-stack ${compact ? "composer-compact" : ""}`}>
      {!compact && scope && (
        <button
          type="button"
          className="example-prompt"
          onClick={() => {
            setPrompt(
              `${skill?.prompt ?? "Create a summary of these"} ${scopeLabel}.`,
            );
            requestAnimationFrame(() =>
              document
                .querySelector<HTMLTextAreaElement>(".workspace-draft textarea")
                ?.focus(),
            );
          }}
        >
          <span>Try it</span>
          {skill?.prompt ?? "Create a summary of these"} {scopeLabel}{" "}
          <ArrowUp size={12} />
        </button>
      )}
      <div className="composer-source-row">
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
        className="workspace-composer"
        aria-busy={busy}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {attachments.length > 0 && (
          <div className="composer-attachments">
            {attachments.map((file, index) => (
              <span className="attachment-chip" key={`${file.name}-${index}`}>
                <FileText size={14} />
                <span>{file.name}</span>
                <button
                  type="button"
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
        <div className="composer-toolbar">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  aria-label="Add attachments or data sources"
                  size="icon-sm"
                  variant="ghost"
                  className="workspace-icon-button"
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
              <DropdownMenuItem onClick={onSources}>
                <Plug />
                Connect a data source
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
          <div className="composer-toolbar-spacer" />
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="ghost"
                  type="button"
                  className="model-trigger"
                  aria-label={`Choose model, ${model.label} ${model.effort}`}
                />
              }
            >
              <ProviderIcon provider={model.provider} />
              <span>
                {model.label}{" "}
                <span className="model-effort">{model.effort}</span>
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
              className="send-button send-button-ready"
              onClick={onStop}
            >
              <Square className="fill-current" />
            </IconButton>
          ) : (
            <IconButton
              label="Send message"
              type="submit"
              className={`send-button ${canSend ? "send-button-ready" : ""}`}
              disabled={!canSend}
            >
              {busy ? <LoaderCircle className="animate-spin" /> : <ArrowUp />}
            </IconButton>
          )}
        </div>
      </form>
      <div className="composer-footnote">
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
                className="permission-trigger"
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
      {error && (
        <p role="alert" className="composer-error">
          {error}
        </p>
      )}
      {skill && (
        <p className="composer-skill-hint">
          <span>{skill.name}</span> ·{" "}
          {scope
            ? skill.output
            : "Choose a source to try this skill with sample data"}
        </p>
      )}
    </div>
  );
}
