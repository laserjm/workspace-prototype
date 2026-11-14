"use server";
import "server-only";
// The workspace's server actions: parse → module → map errors. The modules bind the current
// user (Rule 1); refusals.ts holds the copy each refusal answers with. Anything else thrown is a
// bug the browser reports as one (docs/adr/0004).
import * as integrations from "@/modules/integrations";
import {
  connectInput,
  connectionInput,
  type ConnectionListItem,
} from "@/modules/integrations/contracts";
import * as projects from "@/modules/projects";
import { createProjectInput, type ProjectListItem } from "@/modules/projects/contracts";
import * as threads from "@/modules/threads";
import {
  forkThreadInput,
  placeThreadInput,
  startThreadInput,
  type ThreadListItem,
} from "@/modules/threads/contracts";
import { connectionRefusal, signedIn, threadRefusal, type Refusal } from "./refusals";

/** Adds a project; a name the user already uses answers with that project. */
export async function createProjectAction(
  input: unknown,
): Promise<ProjectListItem | Refusal> {
  const parsed = createProjectInput.safeParse(input);
  if (!parsed.success) return { error: "Give the project a name, up to 80 characters." };
  return signedIn(() => projects.createProject(parsed.data));
}

/**
 * Connects to a provider: it checks the credential and names the account before anything is
 * stored. Connecting the same account again updates it.
 */
export async function connectAction(input: unknown): Promise<ConnectionListItem | Refusal> {
  const parsed = connectInput.safeParse(input);
  if (!parsed.success) {
    const url = parsed.error.issues.find((issue) => issue.path[0] === "baseUrl");
    return url
      ? { error: "Enter an address that starts with https://.", field: "baseUrl" }
      : { error: "Check what you entered and try again." };
  }
  return signedIn(() =>
    integrations
      .connect(parsed.data)
      .catch((error: unknown) => connectionRefusal(error, parsed.data.credential.kind)),
  );
}

/** Asks the provider again whether the stored credential works, and records the answer. */
export async function testConnectionAction(
  input: unknown,
): Promise<ConnectionListItem | Refusal> {
  const parsed = connectionInput.safeParse(input);
  if (!parsed.success) return { error: "This connection no longer exists.", gone: true };
  return signedIn(() =>
    integrations
      .testConnection(parsed.data.connectionId)
      .catch((error: unknown) => connectionRefusal(error)),
  );
}

/** Removes a connection and its credential. */
export async function disconnectAction(input: unknown): Promise<{ id: string } | Refusal> {
  const parsed = connectionInput.safeParse(input);
  if (!parsed.success) return { error: "This connection no longer exists.", gone: true };
  return signedIn(() =>
    integrations
      .disconnect(parsed.data.connectionId)
      .catch((error: unknown) => connectionRefusal(error)),
  );
}

/**
 * Stores the new thread the user's first message starts, in one of their projects or in none.
 * The browser sends the message once this answers.
 */
export async function startThreadAction(input: unknown): Promise<ThreadListItem | Refusal> {
  const parsed = startThreadInput.safeParse(input);
  if (!parsed.success) return { error: "That message can't start a thread." };
  return signedIn(() => threads.startThread(parsed.data).catch(threadRefusal));
}

/** Stores a fork of one of the user's threads through one of its responses. */
export async function forkThreadAction(input: unknown): Promise<ThreadListItem | Refusal> {
  const parsed = forkThreadInput.safeParse(input);
  if (!parsed.success) return { error: "That response can't be forked." };
  return signedIn(() => threads.forkThread(parsed.data).catch(threadRefusal));
}

/** Settles, snoozes, restores or wakes one of the user's threads, or undoes that. */
export async function placeThreadAction(input: unknown): Promise<ThreadListItem | Refusal> {
  const parsed = placeThreadInput.safeParse(input);
  if (!parsed.success) return { error: "That change can't be made to a thread." };
  return signedIn(() => threads.placeThread(parsed.data).catch(threadRefusal));
}
