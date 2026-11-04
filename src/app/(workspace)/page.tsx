import { listProjects } from "@/modules/projects/server";
import { SkillsProvider } from "@/modules/skills";
import { listSkills } from "@/modules/skills/server";
import { SourcesProvider } from "@/modules/sources";
import { listSources } from "@/modules/sources/server";
import { listModelChoices, listThreads } from "@/modules/threads/server";
import { WorkspaceShell } from "./_components/workspace-shell";

export default async function WorkspacePage() {
  const [sources, skills, threads, projects, models] = await Promise.all([
    listSources(),
    listSkills(),
    listThreads(),
    listProjects(),
    listModelChoices(),
  ]);
  return (
    <SourcesProvider sources={sources}>
      <SkillsProvider skills={skills}>
        <WorkspaceShell
          initialThreads={threads}
          initialProjects={projects}
          models={models}
        />
      </SkillsProvider>
    </SourcesProvider>
  );
}
