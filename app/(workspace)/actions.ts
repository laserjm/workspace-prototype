"use server";
import "server-only";
// The workspace's server actions: parse → module → map errors. The modules bind the current
// user (Rule 1); this file speaks to the browser and owns the copy it shows. A refusal is
// `{ error }`; anything else thrown is a bug the browser reports as one (docs/adr/0004).
import { SignedOut } from "@/lib/auth";
import * as projects from "@/modules/projects";
import { createProjectInput, type ProjectListItem } from "@/modules/projects/contracts";

/** An action's refusal: copy the user can read. `signIn`: the session ended. */
export type Refusal = { error: string; signIn?: true };

const signInAgain: Refusal = {
  error: "Your session has ended. Taking you to sign in…",
  signIn: true,
};

/** Runs a module call; a visitor is told to sign in rather than thrown at. */
async function signedIn<T>(run: () => Promise<T | Refusal>): Promise<T | Refusal> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof SignedOut) return signInAgain;
    throw error;
  }
}

/** Adds a project; a name the user already uses answers with that project. */
export async function createProjectAction(
  input: unknown,
): Promise<ProjectListItem | Refusal> {
  const parsed = createProjectInput.safeParse(input);
  if (!parsed.success) return { error: "Give the project a name, up to 80 characters." };
  return signedIn(() => projects.createProject(parsed.data));
}
