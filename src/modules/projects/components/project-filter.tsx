"use client";

import { useMemo, useRef, useState, type RefObject } from "react";
import { Combobox } from "@base-ui/react/combobox";
import { Check, Folder, ListFilter, Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { iconButtonClassName } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";
import { projectInitials, type Project } from "../domain/project";

// `project` is the project's id; null: "All projects".
type ProjectItem = { value: string; label: string; project: string | null };

function ProjectBadge({ name }: { name: string }) {
  return (
    <span
      className="inline-flex size-4 shrink-0 items-center justify-center rounded-sm bg-emerald-100 text-4xs leading-none font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
      aria-hidden="true"
    >
      {projectInitials(name)}
    </span>
  );
}

export function ProjectFilter({
  projects,
  selected,
  onChange,
  anchor,
}: {
  projects: Project[];
  /** Project ids. */
  selected: string[];
  onChange: (projectIds: string[]) => void;
  anchor: RefObject<HTMLDivElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const highlighted = useRef<ProjectItem | undefined>(undefined);
  const items = useMemo<ProjectItem[]>(
    () => [
      { value: "all", label: "All projects", project: null },
      ...projects.map(({ id, name }) => ({
        value: `project:${id}`,
        label: name,
        project: id,
      })),
    ],
    [projects],
  );
  const filteredItems = query.trim()
    ? items.filter(
        (item) =>
          item.project !== null &&
          item.label.toLowerCase().includes(query.trim().toLowerCase()),
      )
    : items;
  const selectedItem =
    items.find((item) => item.project === selected[0]) ?? items[0];
  const selectedNames = selected.map(
    (id) => projects.find((project) => project.id === id)?.name ?? id,
  );
  const label = selected.length
    ? `Filter threads by project: ${selectedNames.join(", ")}`
    : "Filter threads by project";

  function toggleProject(id: string) {
    onChange(
      selected.includes(id)
        ? selected.filter((project) => project !== id)
        : [...selected, id],
    );
  }

  return (
    <Combobox.Root
      items={items}
      filteredItems={filteredItems}
      autoHighlight
      value={selectedItem}
      isItemEqualToValue={(a, b) => a.value === b.value}
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        setQuery("");
      }}
      onItemHighlighted={(item) => {
        highlighted.current = item;
      }}
      onValueChange={(item, details) => {
        if (!item) return;
        if (item.project === null) {
          onChange([]);
        } else if ("shiftKey" in details.event && details.event.shiftKey) {
          details.cancel();
          toggleProject(item.project);
        } else {
          onChange([item.project]);
        }
      }}
    >
      <Combobox.Trigger
        aria-label={label}
        title={label}
        className={cn(
          buttonVariants({ variant: "ghost", size: "icon-sm" }),
          iconButtonClassName,
          selected.length > 0 && "bg-accent text-accent-foreground",
          "data-popup-open:bg-accent data-popup-open:text-accent-foreground",
        )}
      >
        {selected.length ? (
          // Overlapping badges, each cut out of the sidebar behind it.
          <span className="flex *:not-first:-ml-1.5 *:not-first:ring-2 *:not-first:ring-sidebar">
            {selectedNames.slice(0, 2).map((name) => (
              <ProjectBadge key={name} name={name} />
            ))}
          </span>
        ) : (
          <ListFilter aria-hidden="true" />
        )}
      </Combobox.Trigger>
      <Combobox.Portal>
        <Combobox.Positioner
          anchor={anchor}
          align="start"
          sideOffset={0}
          className="z-60 outline-none"
        >
          <Combobox.Popup className="flex max-h-[min(var(--available-height),25rem)] w-72 max-w-[min(var(--available-width),calc(100vw-1.5rem))] flex-col overflow-hidden rounded-lg border border-border bg-popover text-sm leading-normal text-secondary-foreground shadow-popover outline-none">
            <div className="mx-3 mt-1 flex shrink-0 items-center gap-2 border-b border-border text-muted-foreground/70 focus-within:border-ring">
              <Search aria-hidden="true" className="size-4 shrink-0" />
              <Combobox.Input
                aria-label="Search projects"
                placeholder="Search projects..."
                className="w-full min-w-0 border-0 bg-transparent py-2 text-secondary-foreground outline-none placeholder:text-muted-foreground/70"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    !event.nativeEvent.isComposing &&
                    event.shiftKey &&
                    event.key === "Enter" &&
                    highlighted.current?.project
                  ) {
                    event.preventDefault();
                    toggleProject(highlighted.current.project);
                  }
                }}
              />
            </div>
            <Combobox.Empty className="not-empty:px-3 not-empty:py-4.5 not-empty:text-center not-empty:text-secondary-label">
              No matching projects.
            </Combobox.Empty>
            <Combobox.List
              className="min-h-0 overflow-y-auto p-1 empty:p-0"
              aria-label="Projects"
              aria-multiselectable="true"
            >
              {(item: ProjectItem) => {
                const isSelected = item.project
                  ? selected.includes(item.project)
                  : selected.length === 0;
                return (
                  <Combobox.Item
                    key={item.value}
                    value={item}
                    aria-selected={isSelected}
                    className="flex min-h-8.5 cursor-pointer items-center gap-2.5 rounded-sm px-2.5 py-1.5 outline-none data-highlighted:bg-accent"
                  >
                    <span className="relative flex shrink-0">
                      {item.project ? (
                        <ProjectBadge name={item.label} />
                      ) : (
                        <Folder
                          aria-hidden="true"
                          className="size-4 text-icon-muted"
                          strokeWidth={1.65}
                        />
                      )}
                      {isSelected && (
                        <span className="absolute -right-1 -bottom-1 grid size-3 place-items-center rounded-full bg-secondary-foreground text-background ring-2 ring-popover">
                          <Check
                            aria-hidden="true"
                            className="size-2"
                            strokeWidth={3}
                          />
                        </span>
                      )}
                    </span>
                    <span className="min-w-0 truncate">{item.label}</span>
                  </Combobox.Item>
                );
              }}
            </Combobox.List>
            <p className="m-0 shrink-0 border-t border-border/60 px-3 py-2 text-2xs text-secondary-label">
              Shift-select to include multiple projects
            </p>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
