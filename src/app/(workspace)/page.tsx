import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { listModelChoices } from "@/modules/agent/server";
import { listProjects } from "@/modules/projects/server";
import { SkillsProvider } from "@/modules/skills";
import { listSkills } from "@/modules/skills/server";
import { SourcesProvider } from "@/modules/sources";
import { listSources } from "@/modules/sources/server";
import { listThreads } from "@/modules/threads/server";
import { WorkspaceShell } from "./_components/workspace-shell";

// The whole workspace is per user, so it streams behind one boundary: with Cache Components a
// session read outside <Suspense> cannot be prerendered (Next.js "Authentication with Cache
// Components").
export default function WorkspacePage() {
  return (
    <Suspense fallback={null}>
      <Workspace />
    </Suspense>
  );
}

async function Workspace() {
  // proxy.ts only saw a cookie; an ended or revoked session lands here.
  const user = await getUser();
  if (!user) redirect("/api/sign-in");
  const [sources, skills, threads, projects, models] = await Promise.all([
    listSources(),
    listSkills(),
    listThreads(user),
    listProjects(user),
    listModelChoices(),
  ]);
  return (
    <SourcesProvider sources={sources}>
      <SkillsProvider skills={skills}>
        <WorkspaceShell
          initialThreads={threads}
          initialProjects={projects}
          models={models}
          // Name and email only: the id stays on the server.
          user={{ name: user.name, email: user.email }}
        />
      </SkillsProvider>
    </SourcesProvider>
  );
}
