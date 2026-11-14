import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth/session";
import { listModelChoices } from "@/modules/agent/server";
import { IntegrationsProvider } from "./_components/integrations-provider";
import {
  listConnections,
  listProviderChoices,
} from "@/modules/integrations/server";
import * as projects from "@/modules/projects";
import { SkillsProvider } from "./_components/skills-provider";
import { listSkills } from "@/modules/skills/server";
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
  const [skills, threads, projectList, models, providers, connections] =
    await Promise.all([
      listSkills(),
      listThreads(user),
      projects.getProjects(),
      listModelChoices(),
      listProviderChoices(),
      listConnections(user),
    ]);
  return (
    <IntegrationsProvider providers={providers} connections={connections}>
      <SkillsProvider skills={skills}>
        <WorkspaceShell
          initialThreads={threads}
          initialProjects={projectList}
          models={models}
          // Name and email only: the id stays on the server.
          user={{ name: user.name, email: user.email }}
        />
      </SkillsProvider>
    </IntegrationsProvider>
  );
}
