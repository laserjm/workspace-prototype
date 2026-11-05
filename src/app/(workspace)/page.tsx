import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getRequester, getSignedInUser } from "@/lib/auth/requester";
import { listProjects } from "@/modules/projects/server";
import { SkillsProvider } from "@/modules/skills";
import { listSkills } from "@/modules/skills/server";
import { SourcesProvider } from "@/modules/sources";
import { listSources } from "@/modules/sources/server";
import { listModelChoices, listThreads } from "@/modules/threads/server";
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
  const [requester, user] = await Promise.all([
    getRequester(),
    getSignedInUser(),
  ]);
  if (!requester || !user) redirect("/sign-in");
  const [sources, skills, threads, projects, models] = await Promise.all([
    listSources(),
    listSkills(),
    listThreads(requester),
    listProjects(requester),
    listModelChoices(),
  ]);
  return (
    <SourcesProvider sources={sources}>
      <SkillsProvider skills={skills}>
        <WorkspaceShell
          initialThreads={threads}
          initialProjects={projects}
          models={models}
          user={user}
        />
      </SkillsProvider>
    </SourcesProvider>
  );
}
