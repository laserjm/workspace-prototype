import "server-only";
// The one place where server actions meet the session. Every `actions.ts` imports `action`
// from here, so the sign-in check is one hop from each action (ACTION-02).
import { getUser } from "@/lib/auth/session";
import { createActions } from "./define";

export const { action, publicAction } = createActions({ getUser });
