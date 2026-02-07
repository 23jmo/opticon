import { auth } from "@/auth";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  const isAuthenticated = !!req.auth;

  // Allow auth pages, auth API, demo mode, and static assets
  const isPublic =
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/session/demo") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/favicon") ||
    pathname === "/api/health";

  if (isPublic) return;

  if (!isAuthenticated) {
    const signInUrl = new URL("/auth/signin", req.url);
    signInUrl.searchParams.set("callbackUrl", pathname);
    return Response.redirect(signInUrl);
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
