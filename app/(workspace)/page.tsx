import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import * as agent from "@/modules/agent";
import * as integrations from "@/modules/integrations";
import * as projects from "@/modules/projects";
import * as skills from "@/modules/skills";
import * as threads from "@/modules/threads";
import { IntegrationsProvider } from "./_components/integrations-provider";
import { SkillsProvider } from "./_components/skills-provider";
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
  const [skillList, threadList, projectList, models, providers, connections] =
    await Promise.all([
      skills.getSkills(),
      threads.getThreads(),
      projects.getProjects(),
      agent.getModelChoices(),
      integrations.getProviderChoices(),
      integrations.getConnections(),
    ]);
  return (
    <IntegrationsProvider providers={providers} connections={connections}>
      <SkillsProvider skills={skillList}>
        <WorkspaceShell
          initialThreads={threadList}
          initialProjects={projectList}
          models={models}
          // Name and email only: the id stays on the server.
          user={{ name: user.name, email: user.email }}
        />
      </SkillsProvider>
    </IntegrationsProvider>
  );
}
