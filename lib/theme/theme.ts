/** The appearance a person chose; "system" follows the operating system. */
export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];

export const THEME_STORAGE_KEY = "workspace:theme";

export function parseThemePreference(value: string | null): ThemePreference {
  return THEME_PREFERENCES.find((preference) => preference === value) ?? "system";
}

/**
 * Runs before the first paint (an inline script in the root layout), so the
 * page never flashes the wrong theme. It sets `.dark` on <html> from the stored
 * preference and, while the preference is "system", follows the operating
 * system when it changes. `applyThemePreference` repeats the same decision
 * after a person changes the setting.
 */
export const themeScript = `(function () {
  var key = ${JSON.stringify(THEME_STORAGE_KEY)};
  var media = window.matchMedia("(prefers-color-scheme: dark)");
  function stored() {
    try { return localStorage.getItem(key); } catch (error) { return null; }
  }
  function apply() {
    var preference = stored();
    var dark = preference === "dark" || (preference !== "light" && media.matches);
    document.documentElement.classList.toggle("dark", dark);
  }
  apply();
  media.addEventListener("change", apply);
})();`;

export function applyThemePreference(preference: ThemePreference) {
  const dark =
    preference === "dark" ||
    (preference === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}
