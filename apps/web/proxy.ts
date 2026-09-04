import { NextRequest, NextResponse } from "next/server";
import { FEATURES } from "./lib/features";

export function proxy(request: NextRequest) {
  if (!FEATURES.categoriesAndPaths && request.nextUrl.pathname.startsWith("/paths")) {
    return NextResponse.redirect(new URL("/browse", request.url));
  }
  if (!FEATURES.categoriesAndPaths && request.nextUrl.pathname.startsWith("/admin/organization")) {
    return NextResponse.redirect(new URL("/admin/courses", request.url));
  }
  if (!request.cookies.get("academy_session")) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/account/:path*",
    "/onboarding/:path*",
    "/watch/:path*",
    "/browse/:path*",
    "/library/:path*",
    "/catalog/:path*",
    "/paths/:path*",
    "/course/:path*",
    "/history/:path*",
    "/notifications/:path*",
    "/certificate/:path*",
  ],
};
