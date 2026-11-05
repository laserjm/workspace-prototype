"use client";

import { useEffect, useState } from "react";
import {
  Cable,
  ChevronDown,
  PanelBottom,
  PanelLeftOpen,
  PanelRight,
  SquareMenu,
  X,
} from "lucide-react";
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
import { ProjectForm, ProjectIcon, type Project } from "@/modules/projects";
import { useSkillPreferences } from "@/modules/skills";
import {
  allRecordIds,
  recordCountLabel,
  SourceChoiceList,
  SourceExplorer,
  SourceScopeDialog,
  useSources,
} from "@/modules/sources";
import {
  ChatStore,
  ChatStoreProvider,
  createScope,
  placementOf,
  PromptForm,
  ThreadConversation,
  useThreads,
  useThreadWorking,
  type ForkTarget,
  type ModelChoice,
  type SnoozeTimeInPast,
  type Thread,
  type ThreadPlacement,
  type ThreadScope,
  type ThreadStillWorking,
} from "@/modules/threads";
import { NewThreadHeading } from "./new-thread-heading";
import { WorkspaceSettings, type SettingsSection } from "./workspace-settings";
import { WorkspaceSidebar } from "./workspace-sidebar";

type DialogKind = "project" | "settings" | "sources" | "activity" | null;

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
  const { sourceById } = useSources();
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
    forkThread,
  } = useThreads(initialThreads, {
    onPlacementNotStored: () =>
      setThreadNotice({
        message: "The session could not be moved. Try again.",
      }),
  });
  const [chatStore] = useState(() => new ChatStore());
  const [projects, setProjects] = useState(initialProjects);
  // The project a new thread goes into; null: no project.
  const [projectId, setProjectId] = useState<string | null>(null);
  const [history, setHistory] = useState<(string | null)[]>([null]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("general");
  const { enabledSkills, toggleSkill } = useSkillPreferences();
  const [newProjectName, setNewProjectName] = useState("");
  const [draftScope, setDraftScope] = useState<ThreadScope>();
  const [editingScope, setEditingScope] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(true);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const activeThread = threads.find(
    (thread) => thread.id === history[historyIndex],
  );
  const currentProjectId = activeThread ? activeThread.projectId : projectId;
  const currentProject = currentProjectId
    ? projectName(currentProjectId)
    : null;
  const responseWorking = useThreadWorking(activeThread?.id, chatStore);

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
    setSelectedRecordId(null);
    setSourceOpen(!window.matchMedia("(max-width: 1100px)").matches);
    setHistory((previous) => [
      ...previous.slice(0, historyIndex + 1),
      threadId,
    ]);
    setHistoryIndex((index) => index + 1);
    setMobileSidebarOpen(false);
  }

  function newThread() {
    setProjectId(currentProjectId);
    setDraftScope(undefined);
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
      setDraftScope(undefined);
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
      chatStore.isWorking(thread.id),
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

  function chooseSource(sourceId: string) {
    const scope = createScope(sourceId, allRecordIds(sourceById(sourceId)));
    setDraftScope(scope.ok ? scope.value : undefined);
    if (activeThread) {
      setProjectId(currentProjectId);
      navigate(null);
    }
    setDialog(null);
  }

  function openSettings(section: SettingsSection = "general") {
    setSettingsSection(section);
    setDialog("settings");
  }

  function clearSource() {
    setDraftScope(undefined);
    if (activeThread) {
      setProjectId(currentProjectId);
      navigate(null);
    }
  }

  function showSource() {
    setSelectedRecordId(null);
    setSourceOpen(true);
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
    chatStore.fork(activeThread.id, fork.id, target.messageId);
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

  async function sendMessage(
    prompt: string,
    attachments: string[],
    modelId: string,
    skillId?: string,
  ): Promise<boolean> {
    const model = models.find((item) => item.id === modelId);
    if (!model) return false;
    const message = { text: prompt, attachments };
    if (activeThread) {
      // Until the stored conversation is here, the composer keeps the draft: a send now would
      // show without the messages before it.
      if (chatStore.loadState(activeThread.id) === "loading") return false;
      const continued = continueThread(
        activeThread,
        model.provider,
        responseWorking,
      );
      if (!continued.ok) return false;
      if (threadNotice?.undo?.threadId === activeThread.id)
        setThreadNotice(undefined);
      void chatStore.send(activeThread.id, message, {
        modelId,
        skillId,
        scope: activeThread.scope,
      });
      return true;
    }
    const thread = await startThread({
      id: crypto.randomUUID(),
      projectId,
      prompt,
      provider: model.provider,
      scope: draftScope,
    });
    if (!thread) {
      setThreadNotice({
        message: "The thread could not be started. Try again.",
      });
      return false;
    }
    void chatStore.send(thread.id, message, {
      modelId,
      skillId,
      scope: thread.scope,
    });
    navigate(thread.id);
    return true;
  }

  function describeScope(scope: ThreadScope) {
    const source = sourceById(scope.sourceId);
    return `${source.name}: ${recordCountLabel(source, scope.recordIds.length)}`;
  }

  return (
    <ChatStoreProvider store={chatStore}>
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
            onSelect={(thread) => {
              if (thread.wokeAt) acknowledgeWake(thread.id);
              setProjectId(thread.projectId);
              navigate(thread.id);
            }}
            onNewThread={newThread}
            onNewProject={() => setDialog("project")}
            onToggle={toggleSidebar}
            onSettings={() => openSettings()}
            onSources={() => setDialog("sources")}
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
                <IconButton
                  label={panelOpen ? "Hide bottom panel" : "Show bottom panel"}
                  className="max-md:hidden"
                  aria-pressed={panelOpen}
                  onClick={() => setPanelOpen((open) => !open)}
                >
                  <PanelBottom />
                </IconButton>
                <IconButton
                  label={
                    activeThread?.scope
                      ? sourceOpen
                        ? "Hide source explorer"
                        : "Show source explorer"
                      : "Choose data source"
                  }
                  aria-pressed={activeThread?.scope ? sourceOpen : undefined}
                  onClick={() =>
                    activeThread?.scope
                      ? setSourceOpen((open) => !open)
                      : setDialog("sources")
                  }
                >
                  <PanelRight />
                </IconButton>
              </div>
            </header>

            <main
              id="workspace-main"
              // A source session sets the conversation beside the source panel.
              className={cn(
                "group/main relative min-h-0 flex-1 outline-none",
                activeThread?.scope && "flex",
                // A short window lets the new-thread draft scroll.
                !activeThread && "short:overflow-y-auto",
              )}
              data-session={activeThread?.scope ? "source" : "plain"}
              data-source-panel={
                activeThread?.scope && sourceOpen ? "open" : "closed"
              }
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
                    onSend={sendMessage}
                    onSources={() => setDialog("sources")}
                    scope={draftScope}
                    onScope={() => setEditingScope(true)}
                    onChooseSource={chooseSource}
                    onClearSource={clearSource}
                    enabledSkills={enabledSkills}
                    onManageSkills={() => openSettings("skills")}
                  />
                  <p className="mt-4 text-center text-2xs text-muted-foreground/70 max-md:text-3xs">
                    Explore with sample data. Live enterprise connections come
                    next.
                  </p>
                </div>
              ) : (
                <ThreadConversation
                  thread={activeThread}
                  models={models}
                  onRestore={() => handleRestore(activeThread.id)}
                  onOpenThread={navigate}
                  onViewSource={showSource}
                  onFork={(target) => void handleFork(target)}
                  composer={
                    <PromptForm
                      key={activeThread.id}
                      compact
                      busy={responseWorking}
                      onStop={() => void chatStore.stop(activeThread.id)}
                      models={models}
                      onSend={sendMessage}
                      onSources={() => setDialog("sources")}
                      scope={activeThread.scope}
                      enabledSkills={enabledSkills}
                      initialSkill={
                        chatStore
                          .peekMessages(activeThread.id)
                          .findLast((message) => message.role === "user")
                          ?.metadata?.skillId
                      }
                      onManageSkills={() => openSettings("skills")}
                      onChooseSource={chooseSource}
                      onClearSource={clearSource}
                      onScope={showSource}
                    />
                  }
                />
              )}
              {activeThread?.scope && sourceOpen && (
                <SourceExplorer
                  key={activeThread.id}
                  sourceId={activeThread.scope.sourceId}
                  recordIds={activeThread.scope.recordIds}
                  selectedId={selectedRecordId}
                  onSelect={setSelectedRecordId}
                  onClose={() => setSourceOpen(false)}
                />
              )}
            </main>

            {panelOpen && (
              <section
                className="z-25 h-47.5 shrink-0 border-t border-border bg-background max-md:h-34"
                aria-label="Project panel"
              >
                <div className="flex h-10.5 items-center justify-between px-5 text-xs text-muted-foreground">
                  <span>Thread context</span>
                  <IconButton
                    label="Close bottom panel"
                    onClick={() => setPanelOpen(false)}
                  >
                    <X />
                  </IconButton>
                </div>
                <div className="flex items-center justify-center gap-2.5 px-4 py-8 text-sm text-secondary-label max-md:flex-wrap max-md:p-4 max-md:text-xs">
                  <Cable className="size-4.5" />
                  <p>
                    {activeThread?.scope
                      ? `${describeScope(activeThread.scope)} in this thread’s read-only snapshot.`
                      : draftScope
                        ? `${describeScope(draftScope)} selected for your next thread.`
                        : "Choose a source to add context to your thread."}
                  </p>
                  <button
                    type="button"
                    onClick={() => setDialog("sources")}
                    className="inline-flex items-center gap-1 border-b border-input text-accent-foreground"
                  >
                    Explore data sources <ChevronDown className="size-3" />
                  </button>
                </div>
              </section>
            )}
          </div>
        </div>

        <Dialog
          open={dialog !== null}
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
        >
          {/* workspace-dialog stays as a hook while workspace.css still
              styles the source choices inside it. */}
          <DialogContent
            className={cn(
              "workspace-dialog",
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
                    : dialog === "sources"
                      ? "Choose a data source"
                      : "Workspace activity"}
              </DialogTitle>
              <DialogDescription>
                {dialog === "project"
                  ? "Give your next workspace a name."
                  : dialog === "settings"
                    ? "Make this workspace work the way you do."
                    : dialog === "sources"
                      ? activeThread
                        ? "Choose a source to start a new thread. Each thread keeps its own selected records. All sources use sample data."
                        : "Pick a sample enterprise source. You can choose which records to include before sending your first message."
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

            {dialog === "sources" && (
              <>
                <SourceChoiceList
                  selected={
                    activeThread?.scope?.sourceId ?? draftScope?.sourceId
                  }
                  onSelect={chooseSource}
                />
                <p className="text-xs leading-relaxed text-secondary-label">
                  More enterprise systems can follow the same pattern: choose a
                  source, scope the records, then work with a source-specific
                  view.
                </p>
              </>
            )}

            {dialog === "settings" && (
              <WorkspaceSettings
                section={settingsSection}
                onSection={setSettingsSection}
                enabledSkills={enabledSkills}
                onToggleSkill={toggleSkill}
                project={currentProject}
                onSources={() => setDialog("sources")}
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
        {editingScope && draftScope && (
          <SourceScopeDialog
            sourceId={draftScope.sourceId}
            recordIds={draftScope.recordIds}
            onClose={() => setEditingScope(false)}
            onApply={(recordIds) => {
              const scope = createScope(draftScope.sourceId, recordIds);
              if (scope.ok) setDraftScope(scope.value);
              setEditingScope(false);
            }}
          />
        )}
      </TooltipProvider>
    </ChatStoreProvider>
  );
}
