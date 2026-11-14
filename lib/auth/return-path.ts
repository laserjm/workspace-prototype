import "server-only";
/**
 * Where to send the browser after sign-in: `value` resolved against the app's origin, kept only
 * when it stays on that origin, so `/api/sign-in?returnTo=` cannot become an open redirect
 * (`//evil.example`, `/\evil.example` and absolute URLs all become "/").
 */
export function sameOriginPath(value: string | null, appUrl: string): string {
  if (!value) return "/";
  const origin = new URL(appUrl).origin;
  try {
    const url = new URL(value, origin);
    return url.origin === origin ? url.pathname + url.search + url.hash : "/";
  } catch {
    return "/";
  }
}
