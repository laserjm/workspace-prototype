import "server-only";
import type { Provider } from "./provider";
import { github } from "./providers/github";

/**
 * Every provider the workspace can connect to. Adding one is a folder in ./providers/ and a
 * line here (docs/adr/0002, "The pattern a provider author follows"; docs/adr/0006).
 */
export const providers: readonly Provider[] = [github];

export function findProvider(id: string): Provider | undefined {
  return providers.find((provider) => provider.id === id);
}
