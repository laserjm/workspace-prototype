"use client";

import { useState } from "react";
import { Cable, Folder, Settings2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SkillSettingsPanel } from "@/modules/skills";

export type SettingsSection = "general" | "skills";

const navButton =
  "flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground aria-pressed:bg-muted aria-pressed:text-foreground max-md:flex-1 [&_svg]:size-3.5";

/** A section title in the settings dialog. */
export const settingsHeadingClassName =
  "text-base font-medium text-foreground";

/** Small print under a settings section. */
export const settingsNoteClassName =
  "text-2xs leading-relaxed text-muted-foreground";

export function WorkspaceSettings({
  section,
  onSection,
  enabledSkills,
  onToggleSkill,
  project,
  onSources,
}: {
  section: SettingsSection;
  onSection: (section: SettingsSection) => void;
  enabledSkills: string[];
  onToggleSkill: (id: string) => void;
  project: string | null;
  onSources: () => void;
}) {
  const [skillQuery, setSkillQuery] = useState("");
  return (
    <div className="grid grid-cols-[8.5rem_minmax(0,1fr)] gap-7 border-t border-border pt-5 max-md:grid-cols-1 max-md:gap-5">
      <nav
        className="flex flex-col gap-1 self-start max-md:flex-row"
        aria-label="Settings sections"
      >
        <button
          type="button"
          className={navButton}
          aria-pressed={section === "general"}
          onClick={() => onSection("general")}
        >
          <Settings2 />
          General
        </button>
        <button
          type="button"
          className={navButton}
          aria-pressed={section === "skills"}
          onClick={() => onSection("skills")}
        >
          <Wrench />
          Skills
          <span className="ml-auto text-3xs text-muted-foreground/70">
            {enabledSkills.length}
          </span>
        </button>
      </nav>
      {section === "general" ? (
        <section
          className="flex flex-col gap-4.5 [&>div]:flex [&>div]:items-center [&>div]:gap-2.5 [&>div]:text-sm [&>div>svg]:size-4 [&>div>svg]:text-icon-muted"
          aria-label="General settings"
        >
          <h2 className={settingsHeadingClassName}>General</h2>
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
          <Button
            variant="outline"
            onClick={onSources}
            className="[&_svg]:text-icon-muted"
          >
            <Cable />
            Manage data sources
          </Button>
          <p className={settingsNoteClassName}>
            Conversations stay in this session. Skill activation and the source
            panel width are remembered in this browser.
          </p>
        </section>
      ) : (
        <SkillSettingsPanel
          enabledSkills={enabledSkills}
          onToggleSkill={onToggleSkill}
          query={skillQuery}
          onQueryChange={setSkillQuery}
        />
      )}
    </div>
  );
}
