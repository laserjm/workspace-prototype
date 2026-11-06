import type { Provider } from "./contracts";
import { sample } from "./providers/sample";

/**
 * Every provider the workspace can connect to. Adding one is a folder in ./providers/ and a
 * line here (docs/adr/0002, "The pattern a provider author follows").
 */
export const providers: readonly Provider[] = [sample];

export function findProvider(id: string): Provider | undefined {
  return providers.find((provider) => provider.id === id);
}
