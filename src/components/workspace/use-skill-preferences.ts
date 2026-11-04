"use client";

import { useMemo, useSyncExternalStore } from "react";
import { defaultEnabledSkills, isSkillId, type SkillId } from "@/lib/workspace/skill-data";

const storageKey = "workspace:enabled-skills";
const defaultSnapshot = JSON.stringify(defaultEnabledSkills);
let memorySnapshot = defaultSnapshot;
let memoryOnly = false;
const listeners = new Set<() => void>();

function getSnapshot() {
  if (memoryOnly) return memorySnapshot;
  try {
    return localStorage.getItem(storageKey) ?? defaultSnapshot;
  } catch {
    return memorySnapshot;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  function onStorage(event: StorageEvent) {
    if (event.key === storageKey || event.key === null) listener();
  }
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useSkillPreferences() {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => defaultSnapshot,
  );
  const enabledSkills = useMemo(() => {
    try {
      const parsed: unknown = JSON.parse(snapshot);
      return Array.isArray(parsed)
        ? [...new Set(parsed.filter(isSkillId))]
        : defaultEnabledSkills;
    } catch {
      return defaultEnabledSkills;
    }
  }, [snapshot]);

  function toggleSkill(id: SkillId) {
    memorySnapshot = JSON.stringify(
      enabledSkills.includes(id)
        ? enabledSkills.filter((item) => item !== id)
        : [...enabledSkills, id],
    );
    try {
      localStorage.setItem(storageKey, memorySnapshot);
    } catch {
      // Keep activation usable for this session when browser storage is unavailable.
      memoryOnly = true;
    }
    for (const listener of listeners) listener();
  }

  return { enabledSkills, toggleSkill };
}
