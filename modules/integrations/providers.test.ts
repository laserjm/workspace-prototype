// The provider contract, checked for every provider in the registry: what a new provider folder
// must declare before it ships (docs/adr/0002, "The pattern a provider author follows"). The
// declarations only; each provider's behaviour is tested on recorded answers in its own folder.
import { describe, expect, it } from "vitest";
import { RECORD_TONES } from "./contracts";
import { providers } from "./providers";
import { providerViews } from "@/app/(workspace)/_components/record-views";

describe("providers", () => {
  it("have unique ids", () => {
    const ids = providers.map((provider) => provider.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("offer at least one way to connect", () => {
    for (const provider of providers)
      expect(provider.auth.length, provider.id).toBeGreaterThan(0);
  });

  it("say where their API lives and verify a credential", () => {
    for (const provider of providers) {
      expect(provider.baseUrl, provider.id).toBeDefined();
      expect(provider.verify, provider.id).toBeTypeOf("function");
      if (provider.baseUrl?.default)
        expect(provider.baseUrl.default, provider.id).toMatch(/^https:\/\/[^/]+.*[^/]$/);
    }
  });

  it("declare record types with labels and states, each state in a tone from the set", () => {
    for (const provider of providers) {
      if (!provider.records) continue;
      const types = Object.entries(provider.records.types);
      expect(types.length, provider.id).toBeGreaterThan(0);
      for (const [type, declared] of types) {
        expect(declared.singular, `${provider.id} ${type}`).not.toBe("");
        expect(declared.plural, `${provider.id} ${type}`).not.toBe("");
        expect(Object.keys(declared.states).length, `${provider.id} ${type}`).toBeGreaterThan(0);
        for (const [state, { tone }] of Object.entries(declared.states))
          expect(RECORD_TONES, `${provider.id} ${type} ${state}`).toContain(tone);
      }
    }
  });

  it("read, trim, show and mark each declared record type, and show no type they do not declare", () => {
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
        expect(provider.records.types[type]?.read, `${provider.id} ${type}`).toBeTypeOf("function");
        expect(provider.records.types[type]?.trim, `${provider.id} ${type}`).toBeTypeOf("function");
        expect(views?.types[type]?.view, `${provider.id} ${type}`).toBeDefined();
        expect(views?.types[type]?.icon, `${provider.id} ${type}`).toBeDefined();
      }
    }
    for (const id of Object.keys(providerViews))
      expect(providers.map((provider) => provider.id)).toContain(id);
  });
});

// A guide is in the system prompt of every answer that may use one of the provider's connections.
const GUIDE_MAX_LENGTH = 4000;

describe("provider guides", () => {
  it("stay short, and say something", () => {
    for (const provider of providers) {
      if (provider.guide === undefined) continue;
      expect(provider.guide.trim(), provider.id).not.toBe("");
      expect(provider.guide.length, provider.id).toBeLessThanOrEqual(GUIDE_MAX_LENGTH);
    }
  });
});
