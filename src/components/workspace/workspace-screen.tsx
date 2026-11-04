"use client";

import { useEffect, useState } from "react";
import {
  Cable,
  Check,
  ChevronDown,
  GitFork,
  PanelBottom,
  PanelLeftOpen,
  PanelRight,
  Plus,
  SquareMenu,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TooltipProvider } from "@/components/ui/tooltip";
import { IconButton } from "./icon-button";
import { WorkspaceSidebar } from "./workspace-sidebar";
import { WorkspaceComposer } from "./workspace-composer";
import { ProjectIcon } from "./workspace-icons";
import { initialProjects, initialThreads, type Thread } from "./workspace-data";
import {
  defaultScope,
  getSource,
  scopeLabel,
  type SourceId,
  type SourceScope,
} from "@/lib/workspace/source-data";
import { ScopeDialog, SourceChoices, SourceMark } from "./source-picker";
import { SourceExplorer } from "./source-explorer";
import { type SkillId } from "@/lib/workspace/skill-data";
import {
  ChatStore,
  ChatStoreProvider,
  useThreadWorking,
} from "@/lib/chat/chat-store";
import { getModel, type ModelId } from "@/lib/chat/models";
import { ThreadConversation, type ForkTarget } from "./thread-conversation";
import { useSkillPreferences } from "./use-skill-preferences";
import { WorkspaceSettings, type SettingsSection } from "./workspace-settings";
import {
  formatWakeTime,
  threadShelf,
  type ThreadPlacement,
} from "./thread-lifecycle";
import { useSnoozeWake } from "./use-snooze-wake";

type DialogKind = "project" | "settings" | "sources" | "activity" | null;

export function WorkspaceScreen() {
  const [threads, setThreads] = useState(initialThreads);
  const [threadNotice, setThreadNotice] = useState<{
    message: string;
    undo?: {
      threadId: string;
      placement: ThreadPlacement;
      returnToThread: boolean;
    };
  }>();
  useSnoozeWake(threads, setThreads);
  const [projects, setProjects] = useState(initialProjects);
  const [project, setProject] = useState<string | null>("workspace-prototype");
  const [history, setHistory] = useState<(string | null)[]>([null]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [settingsSection, setSettingsSection] =
    useState<SettingsSection>("general");
  const { enabledSkills, toggleSkill } = useSkillPreferences();
  const [projectName, setProjectName] = useState("");
  const [draftScope, setDraftScope] = useState<SourceScope>();
  const [editingScope, setEditingScope] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(true);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const [chatStore] = useState(() => new ChatStore());
  const activeThread = threads.find(
    (thread) => thread.id === history[historyIndex],
  );
  const currentProject = activeThread?.project ?? project;
  const responseWorking = useThreadWorking(activeThread?.id, chatStore);

  useEffect(() => {
    if (!threadNotice) return;
    const timer = setTimeout(() => setThreadNotice(undefined), 8_000);
    return () => clearTimeout(timer);
  }, [threadNotice]);

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
    setProject(currentProject);
    setDraftScope(undefined);
    navigate(null);
  }

  function placeThread(
    id: string,
    placement: ThreadPlacement,
    message: string,
    nextId?: string | null,
  ) {
    const thread = threads.find((item) => item.id === id);
    if (!thread) return;
    const returnToThread = activeThread?.id === id && nextId !== undefined;
    setThreadNotice({
      message,
      undo: {
        threadId: id,
        placement: {
          settledAt: thread.settledAt,
          snoozedUntil: thread.snoozedUntil,
          wokeAt: thread.wokeAt,
        },
        returnToThread,
      },
    });
    setThreads((previous) =>
      previous.map((item) =>
        item.id === id ? { ...item, ...placement } : item,
      ),
    );
    if (returnToThread) {
      const next = threads.find((item) => item.id === nextId);
      setProject(next?.project ?? thread.project);
      setDraftScope(undefined);
      navigate(nextId ?? null);
    }
  }

  function settleThread(id: string, nextId: string | null) {
    placeThread(
      id,
      {
        settledAt: new Date().toISOString(),
        snoozedUntil: undefined,
        wokeAt: undefined,
      },
      "Session settled",
      nextId,
    );
  }

  function snoozeThread(id: string, until: string, nextId: string | null) {
    const thread = threads.find((item) => item.id === id);
    if (!thread) return;
    if (
      !Number.isFinite(Date.parse(until)) ||
      Date.parse(until) <= Date.now()
    ) {
      setThreadNotice({
        message: "That time has passed. Choose another time.",
      });
      return;
    }
    if (chatStore.isWorking(thread.id)) {
      setThreadNotice({
        message: "Wait for the response to finish before snoozing.",
      });
      return;
    }
    placeThread(
      id,
      { settledAt: undefined, snoozedUntil: until, wokeAt: undefined },
      "Session snoozed",
      nextId,
    );
  }

  function restoreThread(id: string) {
    placeThread(
      id,
      { settledAt: undefined, snoozedUntil: undefined, wokeAt: undefined },
      "Session returned to active",
    );
  }

  function undoThreadPlacement() {
    if (!threadNotice?.undo) return;
    const { threadId, placement, returnToThread } = threadNotice.undo;
    setThreads((previous) =>
      previous.map((thread) =>
        thread.id === threadId ? { ...thread, ...placement } : thread,
      ),
    );
    if (returnToThread) {
      const thread = threads.find((item) => item.id === threadId);
      if (thread) setProject(thread.project);
      navigate(threadId);
    }
    setThreadNotice(undefined);
  }

  function chooseSource(sourceId: SourceId) {
    setDraftScope(defaultScope(sourceId));
    if (activeThread) {
      setProject(currentProject);
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
      setProject(currentProject);
      navigate(null);
    }
  }

  function openRecord(id: string) {
    setSelectedRecordId(id);
    setSourceOpen(true);
  }

  function forkFromResponse(target: ForkTarget) {
    if (!activeThread) return;
    const fork: Thread = {
      ...activeThread,
      id: crypto.randomUUID(),
      title: `Fork: ${activeThread.title.replace(/^Fork: /, "")}`,
      age: "now",
      done: false,
      settledAt: undefined,
      snoozedUntil: undefined,
      wokeAt: undefined,
      scope: activeThread.scope
        ? {
            ...activeThread.scope,
            recordIds: [...activeThread.scope.recordIds],
          }
        : undefined,
      forkedFrom: {
        threadId: activeThread.id,
        title: activeThread.title,
        responseIndex: target.kind === "sample" ? 0 : target.responseIndex,
      },
    };
    chatStore.fork(
      activeThread.id,
      fork.id,
      target.kind === "live" ? target.messageId : undefined,
    );
    setThreads((previous) => [fork, ...previous]);
    setProject(fork.project);
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

  function sendMessage(
    prompt: string,
    attachments: string[],
    modelId: ModelId,
    skillId?: SkillId,
  ) {
    if (responseWorking) return;
    const { provider } = getModel(modelId);
    const message = { text: prompt, attachments };
    if (activeThread) {
      if (threadNotice?.undo?.threadId === activeThread.id)
        setThreadNotice(undefined);
      setThreads((previous) =>
        previous.map((thread) =>
          thread.id === activeThread.id
            ? {
                ...thread,
                provider,
                settledAt: undefined,
                snoozedUntil: undefined,
                wokeAt: undefined,
              }
            : thread,
        ),
      );
      void chatStore.send(activeThread.id, message, {
        modelId,
        skillId,
        scope: activeThread.scope,
      });
      return;
    }
    const thread: Thread = {
      id: crypto.randomUUID(),
      project: project ?? "No project",
      kind: "workspace",
      title: prompt,
      branch: "main",
      age: "now",
      provider,
      scope: draftScope
        ? { ...draftScope, recordIds: [...draftScope.recordIds] }
        : undefined,
    };
    setThreads((previous) => [thread, ...previous]);
    void chatStore.send(thread.id, message, {
      modelId,
      skillId,
      scope: thread.scope,
    });
    navigate(thread.id);
  }

  return (
    <ChatStoreProvider store={chatStore}>
    <TooltipProvider delay={450}>
      <div
        className={`workspace-app ${sidebarOpen ? "" : "sidebar-collapsed"} ${mobileSidebarOpen ? "mobile-sidebar-open" : ""}`}
      >
        <a className="workspace-skip-link" href="#workspace-main">
          Skip to workspace
        </a>
        {mobileSidebarOpen && (
          <button
            type="button"
            className="sidebar-backdrop"
            aria-label="Close sidebar"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}
        <WorkspaceSidebar
          threads={threads}
          projects={projects}
          activeId={activeThread?.id}
          onSelect={(thread) => {
            if (thread.wokeAt)
              setThreads((previous) =>
                previous.map((item) =>
                  item.id === thread.id ? { ...item, wokeAt: undefined } : item,
                ),
              );
            setProject(thread.project);
            navigate(thread.id);
          }}
          onNewThread={newThread}
          onNewProject={() => setDialog("project")}
          onToggle={toggleSidebar}
          onSettings={() => openSettings()}
          onSources={() => setDialog("sources")}
          onActivity={() => setDialog("activity")}
          onSettle={settleThread}
          onSnooze={snoozeThread}
          onRestore={restoreThread}
          notice={
            threadNotice
              ? {
                  message: threadNotice.message,
                  onUndo: threadNotice.undo ? undoThreadPlacement : undefined,
                }
              : undefined
          }
        />

        <div className="workspace-canvas" inert={mobileSidebarOpen}>
          <header className="workspace-header">
            <div className="sidebar-reopen">
              <IconButton label="Open sidebar" onClick={toggleSidebar}>
                <PanelLeftOpen />
              </IconButton>
            </div>
            <div className="workspace-breadcrumb" aria-label="Current project">
              {currentProject && (
                <>
                  <button
                    type="button"
                    className="breadcrumb-project"
                    onClick={newThread}
                  >
                    <ProjectIcon kind="workspace" />
                    <span>{currentProject}</span>
                  </button>
                  <span className="breadcrumb-divider">/</span>
                </>
              )}
              <span className="breadcrumb-thread">
                {activeThread?.title ?? "New thread"}
              </span>
            </div>
            <div className="workspace-header-actions">
              <IconButton
                label="Workspace settings"
                onClick={() => openSettings()}
              >
                <SquareMenu />
              </IconButton>
              <IconButton
                label={panelOpen ? "Hide bottom panel" : "Show bottom panel"}
                className={panelOpen ? "is-active" : ""}
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
                className={activeThread?.scope && sourceOpen ? "is-active" : ""}
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
            className={`workspace-main ${activeThread?.scope ? "source-session" : ""} ${activeThread?.scope && sourceOpen ? "source-session-open" : ""}`}
            tabIndex={-1}
          >
            {!activeThread ? (
              <div className="workspace-draft enterprise-draft">
                <div className="draft-heading">
                  <h1
                    aria-label={
                      project
                        ? `What would you like to know in ${project}?`
                        : "What should we work on?"
                    }
                  >
                    {project ? (
                      <>
                        What would you like to know in{" "}
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            render={
                              <button
                                type="button"
                                className="heading-project"
                                aria-label="Choose project"
                              />
                            }
                          >
                            <span>{project}</span>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="w-72" align="center">
                            {projects.map((name) => (
                              <DropdownMenuItem
                                key={name}
                                onClick={() => setProject(name)}
                              >
                                <ProjectIcon kind="workspace" />
                                <span className="truncate">{name}</span>
                                {name === project && (
                                  <Check className="ml-auto" />
                                )}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => setDialog("project")}
                            >
                              <Plus />
                              Add a project
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                        ?
                      </>
                    ) : (
                      "What should we work on?"
                    )}
                  </h1>
                  <button
                    type="button"
                    className="start-without-project"
                    onClick={() =>
                      setProject(project ? null : "workspace-prototype")
                    }
                  >
                    {project
                      ? "or start without a project"
                      : "or choose a project"}
                  </button>
                </div>
                <WorkspaceComposer
                  key={project ?? "no-project"}
                  onSend={sendMessage}
                  onSources={() => setDialog("sources")}
                  scope={draftScope}
                  onScope={() => setEditingScope(true)}
                  onChooseSource={chooseSource}
                  onClearSource={clearSource}
                  enabledSkills={enabledSkills}
                  onManageSkills={() => openSettings("skills")}
                />
                <p className="draft-demo-note">
                  Explore with sample data. Live enterprise connections come
                  next.
                </p>
              </div>
            ) : (
              <div className="conversation-view">
                {threadShelf(activeThread) !== "active" && (
                  <div className="thread-placement-banner">
                    <span>
                      {activeThread.snoozedUntil
                        ? `Snoozed until ${formatWakeTime(activeThread.snoozedUntil)}`
                        : "This session is settled."}
                    </span>
                    <button
                      type="button"
                      onClick={() => restoreThread(activeThread.id)}
                    >
                      {activeThread.snoozedUntil
                        ? "Wake now"
                        : "Return to active"}
                    </button>
                  </div>
                )}
                {activeThread.forkedFrom && (
                  <div className="thread-fork-origin">
                    <GitFork size={12} />
                    <span>Forked from</span>
                    <button
                      type="button"
                      onClick={() =>
                        navigate(activeThread.forkedFrom!.threadId)
                      }
                    >
                      {activeThread.forkedFrom.title}
                    </button>
                    <span>
                      · response {activeThread.forkedFrom.responseIndex + 1}
                    </span>
                  </div>
                )}
                {activeThread.scope && (
                  <div className="session-context-heading">
                    <SourceMark id={activeThread.scope.sourceId} />
                    <div>
                      <strong>
                        {getSource(activeThread.scope.sourceId).collection}
                      </strong>
                      <span>
                        {scopeLabel(activeThread.scope)} · Read-only sample
                        snapshot
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRecordId(null);
                        setSourceOpen(true);
                      }}
                    >
                      View source <ChevronDown size={12} />
                    </button>
                  </div>
                )}
                <ThreadConversation
                  key={`conversation:${activeThread.id}`}
                  thread={activeThread}
                  onOpenRecord={openRecord}
                  onFork={forkFromResponse}
                />
                <WorkspaceComposer
                  key={`composer:${activeThread.id}`}
                  compact
                  busy={responseWorking}
                  onStop={() => void chatStore.stop(activeThread.id)}
                  onSend={sendMessage}
                  onSources={() => setDialog("sources")}
                  scope={activeThread.scope}
                  enabledSkills={enabledSkills}
                  initialSkill={
                    chatStore
                      .peekMessages(activeThread.id)
                      .findLast((message) => message.role === "user")?.metadata
                      ?.skillId ?? activeThread.sample?.skillId
                  }
                  onManageSkills={() => openSettings("skills")}
                  onChooseSource={chooseSource}
                  onClearSource={clearSource}
                  onScope={() => {
                    setSelectedRecordId(null);
                    setSourceOpen(true);
                  }}
                />
              </div>
            )}
            {activeThread?.scope && sourceOpen && (
              <SourceExplorer
                key={activeThread.id}
                scope={activeThread.scope}
                selectedId={selectedRecordId}
                onSelect={setSelectedRecordId}
                onClose={() => setSourceOpen(false)}
              />
            )}
          </main>

          {panelOpen && (
            <section
              className="workspace-bottom-panel"
              aria-label="Project panel"
            >
              <div className="bottom-panel-header">
                <span>Thread context</span>
                <IconButton
                  label="Close bottom panel"
                  onClick={() => setPanelOpen(false)}
                >
                  <X />
                </IconButton>
              </div>
              <div className="bottom-panel-content">
                <Cable />
                <p>
                  {activeThread?.scope
                    ? `${getSource(activeThread.scope.sourceId).name}: ${scopeLabel(activeThread.scope)} in this thread’s read-only snapshot.`
                    : draftScope
                      ? `${getSource(draftScope.sourceId).name}: ${scopeLabel(draftScope)} selected for your next thread.`
                      : "Choose a source to add context to your thread."}
                </p>
                <button type="button" onClick={() => setDialog("sources")}>
                  Explore data sources <ChevronDown />
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
        <DialogContent
          className={`workspace-dialog ${dialog === "settings" ? "skills-settings-dialog" : "sm:max-w-md"}`}
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
            <form
              className="workspace-dialog-form"
              onSubmit={(event) => {
                event.preventDefault();
                const name = projectName.trim();
                if (!name) return;
                setProjects((previous) =>
                  previous.includes(name) ? previous : [...previous, name],
                );
                setProject(name);
                setProjectName("");
                navigate(null);
                setDialog(null);
              }}
            >
              <label htmlFor="project-name">Project name</label>
              <input
                id="project-name"
                autoFocus
                placeholder="my-workspace"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                maxLength={80}
                required
              />
              <Button type="submit" disabled={!projectName.trim()}>
                Create project
              </Button>
            </form>
          )}

          {dialog === "sources" && (
            <>
              <SourceChoices
                selected={activeThread?.scope?.sourceId ?? draftScope?.sourceId}
                onSelect={chooseSource}
              />
              <p className="source-catalog-note">
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
            <div className="activity-list">
              {threads.slice(0, 5).map((thread) => (
                <button
                  type="button"
                  key={thread.id}
                  onClick={() => {
                    setProject(thread.project);
                    navigate(thread.id);
                    setDialog(null);
                  }}
                >
                  <ProjectIcon kind={thread.kind} />
                  <span>{thread.title}</span>
                  <ChevronDown />
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {editingScope && draftScope && (
        <ScopeDialog
          scope={draftScope}
          onClose={() => setEditingScope(false)}
          onApply={(scope) => {
            setDraftScope(scope);
            setEditingScope(false);
          }}
        />
      )}
    </TooltipProvider>
    </ChatStoreProvider>
  );
}
