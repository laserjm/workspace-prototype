"use client";

import { Cable, Folder, Settings2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SkillSettingsPanel } from "@/modules/skills";

export type SettingsSection = "general" | "skills";

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
  return (
    <div className="settings-layout">
      <nav className="settings-navigation" aria-label="Settings sections">
        <button
          type="button"
          aria-pressed={section === "general"}
          onClick={() => onSection("general")}
        >
          <Settings2 />
          General
        </button>
        <button
          type="button"
          aria-pressed={section === "skills"}
          onClick={() => onSection("skills")}
        >
          <Wrench />
          Skills<span>{enabledSkills.length}</span>
        </button>
      </nav>
      {section === "general" ? (
        <section className="workspace-settings" aria-label="General settings">
          <h2>General</h2>
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
          <Button variant="outline" onClick={onSources}>
            <Cable />
            Manage data sources
          </Button>
          <p className="settings-note">
            Conversations stay in this session. Skill activation and the source
            panel width are remembered in this browser.
          </p>
        </section>
      ) : (
        <SkillSettingsPanel
          enabledSkills={enabledSkills}
          onToggleSkill={onToggleSkill}
        />
      )}
    </div>
  );
}
