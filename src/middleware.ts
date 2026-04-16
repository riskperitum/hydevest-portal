import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

function withPathnameHeader(request: NextRequest) {
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  return new NextRequest(request, { headers: requestHeaders });
}

const PUBLIC_ROUTES = [
  "/auth/login",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/callback",
];

const PARTNER_ALLOWED = [
  "/portal/partner-dashboard",
  "/portal/partner-requestbox",
  "/portal/notifications",
];

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request: withPathnameHeader(request),
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request: withPathnameHeader(request),
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_ROUTES.some(r => pathname.startsWith(r));

  // Not logged in — redirect to login
  if (!user && !isPublic && pathname !== "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/auth/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Logged in — check if partner role
  if (user && pathname.startsWith("/portal")) {
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("roles(name)")
      .eq("user_id", user.id)

    const isPartner = (roleData ?? []).some((r: { roles?: unknown }) => {
      const roles = r.roles as { name?: string } | { name?: string }[] | null
      if (!roles) return false
      const role = Array.isArray(roles) ? roles[0] : roles
      return role?.name === "partner"
    })

    if (isPartner) {
      // Partner trying to access non-partner page — redirect to dashboard
      const isAllowed = PARTNER_ALLOWED.some(p => pathname.startsWith(p))
      if (!isAllowed) {
        const url = request.nextUrl.clone();
        url.pathname = "/portal/partner-dashboard";
        return NextResponse.redirect(url);
      }
    }
  }

  // Logged in on public route — redirect to portal
  if (user && isPublic && !pathname.startsWith("/auth/callback")) {
    const url = request.nextUrl.clone();
    url.pathname = "/portal/overview";
    return NextResponse.redirect(url);
  }

  // Root redirect
  if (pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = user ? "/portal/overview" : "/auth/login";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
