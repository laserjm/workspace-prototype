// Every page needs a signed-in user. This is the optimistic check (cookie present); the real one
// is `getRequester()` next to the data, which also covers a cookie whose session has ended.
import { NextResponse, type NextRequest } from "next/server";
import { hasSessionCookie } from "@/lib/auth/session-cookie";

export function proxy(request: NextRequest) {
  if (hasSessionCookie(request)) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  if (pathname.startsWith("/api/"))
    return NextResponse.json(
      { error: "Sign in to continue." },
      { status: 401 },
    );
  const signIn = new URL("/sign-in", request.url);
  signIn.searchParams.set("returnTo", pathname + search);
  return NextResponse.redirect(signIn);
}

export const config = {
  // Not the sign-in routes themselves, Better Auth's endpoints or static files.
  matcher: [
    "/((?!api/auth|sign-in|sign-out|_next/static|_next/image|favicon.ico).*)",
  ],
};
