import "server-only";

import html_render from "./html_render";

/** Every tool the workspace agent can call. Keys are the names the model sees. */
export const tools = {
  html_render,
};

export type AgentTools = typeof tools;
