"use client";

import { useMemo, useSyncExternalStore } from "react";
import { storedSkillIdsSchema } from "../contracts";
import { defaultSkillIds, knownSkillIds, toggleSkill } from "../domain/skill";
import { useSkills } from "./use-skills";

const storageKey = "workspace:enabled-skills";
// Used when browser storage is unavailable; null means nothing was stored.
let memorySnapshot: string | null = null;
let memoryOnly = false;
const listeners = new Set<() => void>();

function getSnapshot() {
  if (memoryOnly) return memorySnapshot;
  try {
    return localStorage.getItem(storageKey);
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

function parseStored(snapshot: string) {
  try {
    const parsed = storedSkillIdsSchema.safeParse(JSON.parse(snapshot));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/** Which skills are active in this browser; saved in localStorage. */
export function useSkillPreferences() {
  const { skills } = useSkills();
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const enabledSkills = useMemo(() => {
    const stored = snapshot === null ? undefined : parseStored(snapshot);
    return stored ? knownSkillIds(skills, stored) : defaultSkillIds(skills);
  }, [snapshot, skills]);

  function toggle(id: string) {
    memorySnapshot = JSON.stringify(toggleSkill(enabledSkills, id));
    try {
      localStorage.setItem(storageKey, memorySnapshot);
    } catch {
      // Keep activation usable for this session when browser storage is unavailable.
      memoryOnly = true;
    }
    for (const listener of listeners) listener();
  }

  return { enabledSkills, toggleSkill: toggle };
}
