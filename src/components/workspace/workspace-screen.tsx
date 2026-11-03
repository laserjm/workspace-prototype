"use client";

import { useEffect, useRef, useState } from "react";
import {
  Cable,
  Check,
  ChevronDown,
  Database,
  FileText,
  Folder,
  GitBranchPlus,
  FolderGit2,
  Laptop,
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
import { ProjectIcon, VSCodeIcon } from "./workspace-icons";
import { initialProjects, initialThreads, type Thread } from "./workspace-data";

type DialogKind =
  | "project"
  | "settings"
  | "sources"
  | "script"
  | "environment"
  | "activity"
  | null;

export function WorkspaceScreen() {
  const [threads, setThreads] = useState(initialThreads);
  const [projects, setProjects] = useState(initialProjects);
  const [project, setProject] = useState<string | null>("workspace-prototype");
  const [history, setHistory] = useState<(string | null)[]>([null]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [panelOpen, setPanelOpen] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [projectName, setProjectName] = useState("");
  const [scriptName, setScriptName] = useState("");
  const [scriptCommand, setScriptCommand] = useState("");
  const [scripts, setScripts] = useState<{ name: string; command: string }[]>(
    [],
  );
  const [notice, setNotice] = useState("");
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeThread = threads.find(
    (thread) => thread.id === history[historyIndex],
  );
  const currentProject = activeThread?.project ?? project;

  function navigate(threadId: string | null) {
    setHistory((previous) => [
      ...previous.slice(0, historyIndex + 1),
      threadId,
    ]);
    setHistoryIndex((index) => index + 1);
    setMobileSidebarOpen(false);
  }

  function newThread() {
    setProject(currentProject);
    navigate(null);
  }

  function toggleSidebar() {
    if (window.matchMedia("(max-width: 767px)").matches)
      setMobileSidebarOpen((open) => !open);
    else setSidebarOpen((open) => !open);
  }

  function announce(message: string) {
    setNotice(message);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(""), 5000);
  }

  useEffect(
    () => () => {
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    },
    [],
  );

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
                label={
                  detailsOpen ? "Hide project details" : "Show project details"
                }
                className={detailsOpen ? "is-active" : ""}
                aria-pressed={detailsOpen}
                onClick={() => setDetailsOpen((open) => !open)}
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
                label="Data sources"
                onClick={() => setDialog("sources")}
              >
                <PanelRight />
              </IconButton>
            </div>
          </header>

          <main id="workspace-main" className="workspace-main" tabIndex={-1}>
            {detailsOpen && (
              <section className="project-details" aria-label="Project details">
                <div className="project-details-main">
                  <button
                    type="button"
                    className="project-action"
                    onClick={() => setDialog("environment")}
                  >
                    <Laptop />
                    <span className="project-action-label">
                      MacBook Pro von Mich...
                    </span>
                    <Folder />
                    <ChevronDown className="project-action-chevron" />
                  </button>
                  <button
                    type="button"
                    className="project-action"
                    onClick={() => setDialog("environment")}
                  >
                    <VSCodeIcon />
                    <span className="project-action-label">
                      Open in VS Code
                    </span>
                    <ChevronDown className="project-action-chevron" />
                  </button>
                  {scripts.map((script) => (
                    <button
                      type="button"
                      className="project-action"
                      key={script.name}
                      onClick={() =>
                        announce(
                          `${script.name}: ${script.command}. Connect an environment to run scripts.`,
                        )
                      }
                    >
                      <FileText />
                      <span className="project-action-label">
                        {script.name}
                      </span>
                    </button>
                  ))}
                  <button
                    type="button"
                    className="project-action"
                    onClick={() => setDialog("script")}
                  >
                    <Plus />
                    <span className="project-action-label">
                      Add project script
                    </span>
                  </button>
                </div>
                <div className="project-details-footer">
                  <button
                    type="button"
                    className="project-action"
                    onClick={() => setDialog("sources")}
                  >
                    <GitBranchPlus />
                    <span className="project-action-label">Initialize Git</span>
                  </button>
                </div>
              </section>
            )}

            {!activeThread ? (
              <div className="workspace-draft">
                <div className="draft-heading">
                  <h1
                    aria-label={
                      project
                        ? `What should we build in ${project}?`
                        : "What should we work on?"
                    }
                  >
                    {project ? (
                      <>
                        What should we build in{" "}
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
                />
              </div>
            ) : (
              <div className="conversation-view">
                <div className="conversation-messages">
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
                  {activeThread.followUps?.map((message, index) => (
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
                  ))}
                  <div className="conversation-empty">
                    <Cable />
                    <h2>Bring your workspace into the conversation.</h2>
                    <p>
                      Connect a data source and an AI provider to continue. Your
                      draft stays here for this session.
                    </p>
                    <Button
                      variant="outline"
                      onClick={() => setDialog("sources")}
                    >
                      Explore data sources
                    </Button>
                  </div>
                </div>
                <WorkspaceComposer
                  compact
                  onSend={sendMessage}
                  onSources={() => setDialog("sources")}
                />
              </div>
            )}
          </main>

          {panelOpen && (
            <section
              className="workspace-bottom-panel"
              aria-label="Project panel"
            >
              <div className="bottom-panel-header">
                <span>Workspace</span>
                <IconButton
                  label="Close bottom panel"
                  onClick={() => setPanelOpen(false)}
                >
                  <X />
                </IconButton>
              </div>
              <div className="bottom-panel-content">
                <Cable />
                <p>No environment connected.</p>
                <button type="button" onClick={() => setDialog("sources")}>
                  Explore data sources <ChevronDown />
                </button>
              </div>
            </section>
          )}
        </div>

        {notice && (
          <div className="workspace-notice" role="status">
            <Check />
            {notice}
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => setNotice("")}
            >
              <X />
            </button>
          </div>
        )}
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
                    ? "Connect your data"
                    : dialog === "script"
                      ? "Add project script"
                      : dialog === "activity"
                        ? "Workspace activity"
                        : "Workspace environment"}
            </DialogTitle>
            <DialogDescription>
              {dialog === "project"
                ? "Give your next workspace a name."
                : dialog === "settings"
                  ? "A starting point for your connected workspace."
                  : dialog === "sources"
                    ? "Your sources, together in one workspace. Connectors are coming next; local files can already be attached in the composer."
                    : dialog === "script"
                      ? "Save a command for this session. Running scripts requires a connected environment."
                      : dialog === "activity"
                        ? "Recent conversations in this workspace."
                        : "This is a browser prototype. Opening an editor and running Git commands will be available with a connected environment."}
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
            <div className="source-catalog">
              {[
                {
                  name: "GitHub",
                  description: "Repositories, issues, and pull requests",
                  icon: FolderGit2,
                },
                {
                  name: "Google Drive",
                  description: "Documents, spreadsheets, and files",
                  icon: Folder,
                },
                {
                  name: "Notion",
                  description: "Pages, knowledge, and databases",
                  icon: FileText,
                },
                {
                  name: "Database",
                  description: "Tables, queries, and business data",
                  icon: Database,
                },
              ].map((source) => (
                <div key={source.name} className="source-option">
                  <span className="source-option-icon">
                    <source.icon />
                  </span>
                  <span>
                    <strong>{source.name}</strong>
                    <small>{source.description}</small>
                  </span>
                  <span className="source-status">Coming soon</span>
                </div>
              ))}
            </div>
          )}

          {dialog === "script" && (
            <form
              className="workspace-dialog-form"
              onSubmit={(event) => {
                event.preventDefault();
                setScripts((previous) => [
                  ...previous,
                  { name: scriptName.trim(), command: scriptCommand.trim() },
                ]);
                setScriptName("");
                setScriptCommand("");
                setDialog(null);
              }}
            >
              <label htmlFor="script-name">Name</label>
              <input
                id="script-name"
                autoFocus
                placeholder="Start development server"
                value={scriptName}
                onChange={(event) => setScriptName(event.target.value)}
                required
              />
              <label htmlFor="script-command">Command</label>
              <input
                id="script-command"
                className="font-mono"
                placeholder="pnpm dev"
                value={scriptCommand}
                onChange={(event) => setScriptCommand(event.target.value)}
                required
              />
              <Button
                type="submit"
                disabled={!scriptName.trim() || !scriptCommand.trim()}
              >
                Save script
              </Button>
            </form>
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

          {dialog === "environment" && (
            <Button variant="outline" onClick={() => setDialog("sources")}>
              <Cable />
              Explore data sources
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
