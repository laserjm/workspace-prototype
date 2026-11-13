"use client";

import { useEffect, useState } from "react";
import { ChevronDown, PanelLeftOpen, SquareMenu } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { IconButton } from "@/components/ui/icon-button";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { pluralLabels, useIntegrations } from "@/modules/integrations";
import { ProjectForm, ProjectIcon, type Project } from "@/modules/projects";
import { useSkillPreferences } from "@/modules/skills";
import {
  RecordPanel,
  RecordPanelProvider,
  RecordPanelToggle,
  type AttachedConnection,
} from "@/modules/records";
import {
  placementOf,
  PromptForm,
  ThreadConversation,
  useThreads,
  type ConversationControls,
  type FirstQuestion,
  type Question,
  type ForkTarget,
  type SnoozeTimeInPast,
  type Thread,
  type ThreadPlacement,
  type ThreadStillWorking,
} from "@/modules/threads";
import type { ChatOptions, ModelChoice } from "@/modules/agent";
import { NewThreadHeading } from "./new-thread-heading";
import { WorkspaceSettings, type SettingsSection } from "./workspace-settings";
import { WorkspaceSidebar } from "./workspace-sidebar";

type DialogKind = "project" | "settings" | "activity" | null;

const SNOOZE_REFUSED: Record<
  (SnoozeTimeInPast | ThreadStillWorking)["_tag"],
  string
> = {
  SnoozeTimeInPast: "That time has passed. Choose another time.",
  ThreadStillWorking: "Wait for the response to finish before snoozing.",
};

export function WorkspaceShell({
  initialThreads,
  initialProjects,
  models,
  user,
}: {
  initialThreads: Thread[];
  initialProjects: Project[];
  models: ModelChoice[];
  user: { name: string; email: string };
}) {
  const [threadNotice, setThreadNotice] = useState<{
    message: string;
    undo?: {
      threadId: string;
      placement: ThreadPlacement;
      returnToThread: boolean;
    };
  }>();
  const {
    threads,
    settleThread,
    snoozeThread,
    restoreThread,
    returnThread,
    acknowledgeWake,
    startThread,
    continueThread,
    countTurn,
    forkThread,
  } = useThreads(initialThreads, {
    onPlacementNotStored: () =>
      setThreadNotice({
        message: "The session could not be moved. Try again.",
      }),
  });
  // Only the open thread can have a response in flight: leaving it stops its response.
  const [workingThreadId, setWorkingThreadId] = useState<string | null>(null);
  // A thread this page just started, and the first question its chat sends when it opens.
  const [started, setStarted] = useState<
    FirstQuestion & { threadId: string }
  >();
  const [projects, setProjects] = useState(initialProjects);
  // The project a new thread goes into; null: no project.
  const [projectId, setProjectId] = useState<string | null>(null);
  const [history, setHistory] = useState<(string | null)[]>([null]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("general");
  const { enabledSkills, toggleSkill } = useSkillPreferences();
  const [newProjectName, setNewProjectName] = useState("");
  // The open thread's composer draft of attached items, which the record panel adds to too.
  const [draftAttached, setDraftAttached] = useState<
    readonly AttachedConnection[]
  >([]);
  const activeThread = threads.find(
    (thread) => thread.id === history[historyIndex],
  );
  const currentProjectId = activeThread ? activeThread.projectId : projectId;
  // With nothing connected, the new-thread page says what connecting the first provider offers.
  const { providers, connections } = useIntegrations();
  const firstProvider = providers.find((provider) => provider.records);
  const invitation =
    !connections.length && firstProvider?.records
      ? `Connect ${firstProvider.name} to ask about your ${pluralLabels(firstProvider.records)}`
      : undefined;
  const currentProject = currentProjectId
    ? projectName(currentProjectId)
    : null;

  useEffect(() => {
    if (!threadNotice) return;
    const timer = setTimeout(() => setThreadNotice(undefined), 8_000);
    return () => clearTimeout(timer);
  }, [threadNotice]);

  function projectName(id: string | null) {
    return (
      (id && projects.find((item) => item.id === id)?.name) || "No project"
    );
  }

  function navigate(threadId: string | null) {
    setDraftAttached([]);
    setHistory((previous) => [
      ...previous.slice(0, historyIndex + 1),
      threadId,
    ]);
    setHistoryIndex((index) => index + 1);
    setMobileSidebarOpen(false);
  }

  function newThread() {
    setProjectId(currentProjectId);
    navigate(null);
  }

  /**
   * After a thread moved shelves: offer an undo and, when the open thread was parked from
   * the sidebar, continue with the next active one (`nextId`).
   */
  function announcePlacement(
    previous: Thread,
    message: string,
    nextId?: string | null,
  ) {
    const returnToThread =
      activeThread?.id === previous.id && nextId !== undefined;
    setThreadNotice({
      message,
      undo: {
        threadId: previous.id,
        placement: placementOf(previous),
        returnToThread,
      },
    });
    if (returnToThread) {
      const next = threads.find((item) => item.id === nextId);
      setProjectId(next ? next.projectId : previous.projectId);
      navigate(nextId ?? null);
    }
  }

  function handleSettle(id: string, nextId: string | null) {
    const thread = threads.find((item) => item.id === id);
    if (!thread) return;
    settleThread(id);
    announcePlacement(thread, "Session settled", nextId);
  }

  function handleSnooze(id: string, until: string, nextId: string | null) {
    const thread = threads.find((item) => item.id === id);
    if (!thread) return;
    const result = snoozeThread(
      thread,
      new Date(until),
      workingThreadId === thread.id,
    );
    if (!result.ok) {
      setThreadNotice({ message: SNOOZE_REFUSED[result.error._tag] });
      return;
    }
    announcePlacement(thread, "Session snoozed", nextId);
  }

  function handleRestore(id: string) {
    const thread = threads.find((item) => item.id === id);
    if (!thread) return;
    restoreThread(id);
    announcePlacement(thread, "Session returned to active");
  }

  function undoThreadPlacement() {
    if (!threadNotice?.undo) return;
    const { threadId, placement, returnToThread } = threadNotice.undo;
    returnThread(threadId, placement);
    if (returnToThread) {
      const thread = threads.find((item) => item.id === threadId);
      if (thread) setProjectId(thread.projectId);
      navigate(threadId);
    }
    setThreadNotice(undefined);
  }

  function openSettings(section: SettingsSection = "general") {
    setSettingsSection(section);
    setDialog("settings");
  }

  async function handleFork(target: ForkTarget) {
    if (!activeThread) return;
    const fork = await forkThread(activeThread, target.messageId);
    if (!fork) {
      setThreadNotice({
        message: "The thread could not be forked. Try again.",
      });
      return;
    }
    setProjectId(fork.projectId);
    navigate(fork.id);
  }

  function toggleSidebar() {
    if (window.matchMedia("(max-width: 767px)").matches)
      setMobileSidebarOpen((open) => !open);
    else setSidebarOpen((open) => !open);
  }

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileSidebarOpen(false);
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSidebarOpen(true);
        if (window.matchMedia("(max-width: 767px)").matches) {
          setMobileSidebarOpen(true);
        }
        requestAnimationFrame(() =>
          document.getElementById("thread-search")?.focus(),
        );
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  function chatOptions(modelId: string, skillId: string | undefined): ChatOptions {
    return { modelId, skillId, skillIds: enabledSkills };
  }

  /** Asks the open thread's chat; false keeps the draft in the composer. */
  async function askThread(
    controls: ConversationControls,
    question: Question,
    modelId: string,
    skillId?: string,
  ): Promise<boolean> {
    const model = models.find((item) => item.id === modelId);
    // Until the stored conversation is here, the composer keeps the draft: a send now would
    // show without the messages before it.
    if (!activeThread || !model || !controls.ready) return false;
    const continued = continueThread(
      activeThread,
      model.provider,
      controls.busy,
    );
    if (!continued.ok) return false;
    if (threadNotice?.undo?.threadId === activeThread.id)
      setThreadNotice(undefined);
    controls.send(question, chatOptions(modelId, skillId));
    countTurn(activeThread.id, question.attachments.length);
    return true;
  }

  /** Stores a new thread, then opens it; its chat sends the first question. */
  async function startNewThread(
    question: Question,
    modelId: string,
    skillId?: string,
  ): Promise<boolean> {
    const model = models.find((item) => item.id === modelId);
    if (!model) return false;
    const thread = await startThread({
      id: crypto.randomUUID(),
      projectId,
      prompt: question.text,
      provider: model.provider,
    });
    if (!thread) {
      setThreadNotice({
        message: "The thread could not be started. Try again.",
      });
      return false;
    }
    setStarted({
      threadId: thread.id,
      question,
      options: chatOptions(modelId, skillId),
    });
    countTurn(thread.id, question.attachments.length);
    navigate(thread.id);
    return true;
  }

  return (
    <TooltipProvider delay={450}>
        {/* Layout state for descendants: utilities read it as
            group-data-[sidebar=collapsed]/app:… and
            group-data-[mobile-sidebar=open]/app:…. The two widths are
            variables because the sidebar and the composer size themselves
            from them. */}
        <div
          className="group/app flex h-svh min-h-105 overflow-hidden bg-background text-sm leading-normal text-foreground antialiased [--workspace-composer-width:856px] [--workspace-sidebar-width:296px] max-desktop:[--workspace-sidebar-width:256px] max-md:min-h-90"
          data-sidebar={sidebarOpen ? "open" : "collapsed"}
          data-mobile-sidebar={mobileSidebarOpen ? "open" : "closed"}
        >
          <a
            className="fixed -top-15 left-4 z-100 rounded-sm bg-primary px-4 py-2 text-primary-foreground focus:top-3"
            href="#workspace-main"
          >
            Skip to workspace
          </a>
          {mobileSidebarOpen && (
            <button
              type="button"
              className="fixed inset-0 z-30 bg-black/15 backdrop-blur-xs md:hidden"
              aria-label="Close sidebar"
              onClick={() => setMobileSidebarOpen(false)}
            />
          )}
          <WorkspaceSidebar
            user={user}
            threads={threads}
            projects={projects}
            projectName={projectName}
            activeId={activeThread?.id}
            workingId={workingThreadId}
            onSelect={(thread) => {
              if (thread.wokeAt) acknowledgeWake(thread.id);
              setProjectId(thread.projectId);
              navigate(thread.id);
            }}
            onNewThread={newThread}
            onNewProject={() => setDialog("project")}
            onToggle={toggleSidebar}
            onSettings={() => openSettings()}
            onSources={() => openSettings("sources")}
            onActivity={() => setDialog("activity")}
            onSettle={handleSettle}
            onSnooze={handleSnooze}
            onRestore={handleRestore}
            notice={
              threadNotice
                ? {
                    message: threadNotice.message,
                    onUndo: threadNotice.undo ? undoThreadPlacement : undefined,
                  }
                : undefined
            }
          />

          <RecordPanelProvider threadId={activeThread?.id ?? null}>
          <div
            className="relative flex min-w-0 flex-1 flex-col"
            inert={mobileSidebarOpen}
          >
            <header className="z-20 flex h-13.5 shrink-0 items-center gap-2.5 pr-5 pl-6 max-md:gap-1.5 max-md:px-2.5">
              <div className="hidden group-data-[sidebar=collapsed]/app:flex max-md:flex">
                <IconButton label="Open sidebar" onClick={toggleSidebar}>
                  <PanelLeftOpen />
                </IconButton>
              </div>
              <div
                className="flex min-w-0 flex-1 items-center gap-3.5 text-sm max-md:gap-2 max-md:text-xs"
                aria-label="Current project"
              >
                {currentProject && (
                  <>
                    <button
                      type="button"
                      className="inline-flex min-w-0 max-w-[45%] items-center gap-2 font-medium text-secondary-label max-md:max-w-34 max-md:gap-1"
                      onClick={newThread}
                    >
                      <ProjectIcon className="max-md:size-3.5 max-md:text-5xs" />
                      <span className="truncate">{currentProject}</span>
                    </button>
                    <span className="text-secondary-label">/</span>
                  </>
                )}
                <span className="truncate font-medium">
                  {activeThread?.title ?? "New thread"}
                </span>
              </div>
              <div className="flex shrink-0 gap-2 max-md:gap-0.5">
                <IconButton
                  label="Workspace settings"
                  onClick={() => openSettings()}
                >
                  <SquareMenu />
                </IconButton>
                {/* No panel, and so no button, on the new-thread page. */}
                {activeThread && <RecordPanelToggle />}
              </div>
            </header>

            <main
              id="workspace-main"
              // An open thread sets the conversation beside the record panel.
              className={cn(
                "group/main relative min-h-0 flex-1 outline-none",
                activeThread && "flex",
                // A short window lets the new-thread draft scroll.
                !activeThread && "short:overflow-y-auto",
              )}
              tabIndex={-1}
            >
              {!activeThread ? (
                <div className="absolute top-[47%] left-1/2 flex w-[min(var(--workspace-composer-width),calc(100%-4rem))] -translate-1/2 flex-col gap-5 max-desktop:w-[calc(100%-3rem)] max-md:top-[46%] max-md:w-[calc(100%-2rem)] max-md:gap-4 short:static short:mx-auto short:mt-7.5 short:mb-15 short:w-[min(var(--workspace-composer-width),calc(100%-2.5rem))] short:translate-none">
                  <NewThreadHeading
                    projectId={projectId}
                    projects={projects}
                    onProject={setProjectId}
                    onAddProject={() => setDialog("project")}
                  />
                  <PromptForm
                    key={projectId ?? "no-project"}
                    models={models}
                    onSend={startNewThread}
                    onSources={() => openSettings("sources")}
                    enabledSkills={enabledSkills}
                    onManageSkills={() => openSettings("skills")}
                  />
                  {invitation && (
                    <p className="mt-4 text-center text-2xs text-muted-foreground/70 max-md:text-3xs">
                      <button
                        type="button"
                        className="underline-offset-2 hover:text-foreground hover:underline"
                        onClick={() => openSettings("sources")}
                      >
                        {invitation}
                      </button>
                    </p>
                  )}
                </div>
              ) : (
                <ThreadConversation
                  key={`conversation:${activeThread.id}`}
                  thread={activeThread}
                  models={models}
                  enabledSkills={enabledSkills}
                  firstQuestion={
                    started?.threadId === activeThread.id ? started : undefined
                  }
                  onFirstQuestionSent={() => setStarted(undefined)}
                  onWorkingChange={(working) =>
                    setWorkingThreadId((current) =>
                      working
                        ? activeThread.id
                        : current === activeThread.id
                          ? null
                          : current,
                    )
                  }
                  onRestore={() => handleRestore(activeThread.id)}
                  onOpenThread={navigate}
                  onFork={(target) => void handleFork(target)}
                  panel={(messages) => (
                    <RecordPanel
                      messages={messages}
                      draft={draftAttached}
                      onDraftChange={setDraftAttached}
                      onConnect={() => openSettings("sources")}
                    />
                  )}
                  composer={(controls) => (
                    <PromptForm
                      compact
                      busy={controls.busy}
                      onStop={controls.stop}
                      models={models}
                      onSend={(question, modelId, skillId) =>
                        askThread(controls, question, modelId, skillId)
                      }
                      onSources={() => openSettings("sources")}
                      enabledSkills={enabledSkills}
                      initialSkill={controls.lastSkillId}
                      onManageSkills={() => openSettings("skills")}
                      attached={draftAttached}
                      onAttachedChange={setDraftAttached}
                    />
                  )}
                />
              )}
            </main>
          </div>
          </RecordPanelProvider>
        </div>

        <Dialog
          open={dialog !== null}
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
        >
          <DialogContent
            className={cn(
              dialog === "settings"
                ? "max-h-[calc(100dvh-3rem)] w-190 max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-190 max-md:p-5"
                : "sm:max-w-md",
            )}
          >
            <DialogHeader>
              <DialogTitle>
                {dialog === "project"
                  ? "Add a project"
                  : dialog === "settings"
                    ? "Workspace settings"
                    : "Workspace activity"}
              </DialogTitle>
              <DialogDescription>
                {dialog === "project"
                  ? "Give your next workspace a name."
                  : dialog === "settings"
                    ? "Make this workspace work the way you do."
                    : "Recent conversations in this workspace."}
              </DialogDescription>
            </DialogHeader>

            {dialog === "project" && (
              <ProjectForm
                name={newProjectName}
                onNameChange={setNewProjectName}
                onCreated={(project) => {
                  // A name the user already uses answers with that project.
                  setProjects((previous) =>
                    previous.some((item) => item.id === project.id)
                      ? previous
                      : [...previous, project],
                  );
                  setProjectId(project.id);
                  navigate(null);
                  setDialog(null);
                }}
              />
            )}

            {dialog === "settings" && (
              <WorkspaceSettings
                section={settingsSection}
                onSection={setSettingsSection}
                enabledSkills={enabledSkills}
                onToggleSkill={toggleSkill}
                project={currentProject}
              />
            )}

            {dialog === "activity" && (
              <div className="flex flex-col gap-2">
                {threads.slice(0, 5).map((thread) => (
                  <button
                    type="button"
                    key={thread.id}
                    className="flex items-center gap-2.5 rounded-sm py-2 text-left"
                    onClick={() => {
                      setProjectId(thread.projectId);
                      navigate(thread.id);
                      setDialog(null);
                    }}
                  >
                    <ProjectIcon />
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {thread.title}
                    </span>
                    <ChevronDown className="size-3 -rotate-90" />
                  </button>
                ))}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </TooltipProvider>
  );
}
