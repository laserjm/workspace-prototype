import type { Provider } from "./contracts";
import { github } from "./providers/github";

/**
 * Every provider the workspace can connect to. Adding one is a folder in ./providers/ and a
 * line here (docs/adr/0002, "The pattern a provider author follows").
 */
export const providers: readonly Provider[] = [github];

export function findProvider(id: string): Provider | undefined {
  return providers.find((provider) => provider.id === id);
}

/** What the agent's prompt says of a provider: its name and its guide, if it has one. */
export function providerForPrompt(
  id: string,
): Pick<Provider, "name" | "guide"> | undefined {
  const provider = findProvider(id);
  return provider && { name: provider.name, guide: provider.guide?.trim() };
}
