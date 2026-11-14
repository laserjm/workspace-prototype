// The browser's record views against the provider registry: every record type a provider declares
// opens in a view and has a mark, and no view is drawn for a type or provider that does not exist.
// It lives in test/ because a module may not import app/ (Rule 5).
import { describe, expect, it } from "vitest";
import { providerViews } from "@/app/(workspace)/_components/record-views";
import { providers } from "@/modules/integrations/providers";

describe("providerViews", () => {
  it("show and mark each declared record type, and no type a provider does not declare", () => {
    for (const provider of providers) {
      const declared = Object.keys(provider.records?.types ?? {}).toSorted();
      const views = providerViews[provider.id];
      if (!provider.records) {
        expect(views, provider.id).toBeUndefined();
        continue;
      }
      expect(views?.icon, provider.id).toBeDefined();
      expect(Object.keys(views?.types ?? {}).toSorted(), provider.id).toEqual(declared);
      for (const type of declared) {
        expect(views?.types[type]?.view, `${provider.id} ${type}`).toBeDefined();
        expect(views?.types[type]?.icon, `${provider.id} ${type}`).toBeDefined();
      }
    }
  });

  it("are drawn only for providers in the registry", () => {
    for (const id of Object.keys(providerViews))
      expect(providers.map((provider) => provider.id)).toContain(id);
  });
});
