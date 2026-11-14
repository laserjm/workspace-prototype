"use client";

import { useSyncExternalStore } from "react";
import {
  applyThemePreference,
  parseThemePreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "./theme";

// Used when browser storage is unavailable; null means nothing was stored.
let memorySnapshot: string | null = null;
let memoryOnly = false;
const listeners = new Set<() => void>();

function getSnapshot() {
  if (memoryOnly) return memorySnapshot;
  try {
    return localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return memorySnapshot;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab changed the theme: follow it here too.
  function onStorage(event: StorageEvent) {
    if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
    applyThemePreference(parseThemePreference(getSnapshot()));
    listener();
  }
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The theme this browser uses; saved in localStorage, applied to <html>. */
export function useThemePreference() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => null);
  const preference = parseThemePreference(snapshot);

  function setPreference(next: ThemePreference) {
    memorySnapshot = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Keep the choice for this session when browser storage is unavailable.
      memoryOnly = true;
    }
    applyThemePreference(next);
    for (const listener of listeners) listener();
  }

  return { preference, setPreference };
}
