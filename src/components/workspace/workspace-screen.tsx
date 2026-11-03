"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import {
  Cable,
  Check,
  ChevronDown,
  FileText,
  Folder,
  PanelBottom,
  PanelLeftOpen,
  PanelRight,
  Plus,
  Settings2,
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
} from "./source-data";
import { ScopeDialog, SourceChoices, SourceMark } from "./source-picker";
import { SourceExplorer } from "./source-explorer";
import { SourceResponse } from "./source-response";

type DialogKind = "project" | "settings" | "sources" | "activity" | null;

export function WorkspaceScreen() {
  const [threads, setThreads] = useState(initialThreads);
  const [projects, setProjects] = useState(initialProjects);
  const [project, setProject] = useState<string | null>("workspace-prototype");
  const [history, setHistory] = useState<(string | null)[]>([null]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [projectName, setProjectName] = useState("");
  const [draftScope, setDraftScope] = useState<SourceScope>();
  const [editingScope, setEditingScope] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(true);
  const [selectedRecordId, setSelectedRecordId] = useState<string | null>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const activeThread = threads.find(
    (thread) => thread.id === history[historyIndex],
  );
  const currentProject = activeThread?.project ?? project;

  useEffect(() => {
    const messages = messagesRef.current;
    if (messages)
      messages.scrollTop = activeThread?.followUps?.length
        ? messages.scrollHeight
        : 0;
  }, [activeThread?.id, activeThread?.followUps?.length]);

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

  function chooseSource(sourceId: SourceId) {
    setDraftScope(defaultScope(sourceId));
    if (activeThread) {
      setProject(currentProject);
      navigate(null);
    }
    setDialog(null);
  }

  function openRecord(id: string) {
    setSelectedRecordId(id);
    setSourceOpen(true);
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
    provider: "claude" | "openai",
  ) {
    if (activeThread) {
      setThreads((previous) =>
        previous.map((thread) =>
          thread.id === activeThread.id
            ? {
                ...thread,
                provider,
                followUps: [
                  ...(thread.followUps ?? []),
                  { text: prompt, attachments },
                ],
              }
            : thread,
        ),
      );
      return;
    }
    const thread: Thread = {
      id: crypto.randomUUID(),
      project: project ?? "No project",
      kind: "workspace",
      title: prompt.length > 56 ? `${prompt.slice(0, 56)}…` : prompt,
      branch: "main",
      age: "now",
      prompt,
      attachments,
      provider,
      scope: draftScope
        ? { ...draftScope, recordIds: [...draftScope.recordIds] }
        : undefined,
    };
    setThreads((previous) => [thread, ...previous]);
    navigate(thread.id);
  }

  return (
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
          activeId={activeThread?.id}
          onSelect={(thread) => {
            setProject(thread.project);
            navigate(thread.id);
          }}
          onNewThread={newThread}
          onNewProject={() => setDialog("project")}
          onToggle={toggleSidebar}
          onSettings={() => setDialog("settings")}
          onSources={() => setDialog("sources")}
          onActivity={() => setDialog("activity")}
          onBack={() => setHistoryIndex((index) => Math.max(0, index - 1))}
          onForward={() =>
            setHistoryIndex((index) => Math.min(history.length - 1, index + 1))
          }
          canGoBack={historyIndex > 0}
          canGoForward={historyIndex < history.length - 1}
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
                onClick={() => setDialog("settings")}
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
                  onClearSource={() => setDraftScope(undefined)}
                />
                <p className="draft-demo-note">
                  Explore with sample data. Live enterprise connections come
                  next.
                </p>
              </div>
            ) : (
              <div className="conversation-view">
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
                <div className="conversation-messages" ref={messagesRef}>
                  <div className="user-message">
                    <p>{activeThread.prompt ?? activeThread.title}</p>
                    {activeThread.attachments?.map((name, index) => (
                      <span
                        className="attachment-chip"
                        key={`${name}-${index}`}
                      >
                        <FileText size={14} />
                        {name}
                      </span>
                    ))}
                  </div>
                  {activeThread.scope && (
                    <SourceResponse
                      scope={activeThread.scope}
                      prompt={activeThread.prompt ?? activeThread.title}
                      onOpenRecord={openRecord}
                    />
                  )}
                  {activeThread.followUps?.map((message, index) => (
                    <Fragment key={index}>
                      <div className="user-message" key={index}>
                        <p>{message.text}</p>
                        {message.attachments.map((name, attachmentIndex) => (
                          <span
                            className="attachment-chip"
                            key={`${name}-${attachmentIndex}`}
                          >
                            <FileText size={14} />
                            {name}
                          </span>
                        ))}
                      </div>
                      {activeThread.scope && (
                        <SourceResponse
                          scope={activeThread.scope}
                          prompt={message.text}
                          onOpenRecord={openRecord}
                        />
                      )}
                    </Fragment>
                  ))}
                  {!activeThread.scope && (
                    <div className="conversation-empty">
                      <Cable />
                      <h2>Bring your workspace into the conversation.</h2>
                      <p>
                        Connect a data source and an AI provider to continue.
                        Your draft stays here for this session.
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => setDialog("sources")}
                      >
                        Explore data sources
                      </Button>
                    </div>
                  )}
                </div>
                <WorkspaceComposer
                  key={activeThread.id}
                  compact
                  onSend={sendMessage}
                  onSources={() => setDialog("sources")}
                  scope={activeThread.scope}
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
        <DialogContent className="workspace-dialog sm:max-w-md">
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
                  ? "A starting point for your connected workspace."
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
            <div className="workspace-settings">
              <div>
                <Settings2 />
                <span>Appearance</span>
                <span className="ml-auto text-muted-foreground">Light</span>
              </div>
              <div>
                <Folder />
                <span>Project</span>
                <span className="ml-auto max-w-48 truncate text-muted-foreground">
                  {project ?? "No project"}
                </span>
              </div>
              <Button variant="outline" onClick={() => setDialog("sources")}>
                <Cable />
                Manage data sources
              </Button>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Inspired by T3 Code. Conversations and preferences are held
                locally for this session.
              </p>
            </div>
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
  );
}
