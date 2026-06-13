import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(process.env.NEXUS_JWT_SECRET || "nexus-hrms-dev-secret-change-in-prod");
const COOKIE_NAME = "nexus_token";

async function roleFromCookie(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return (payload.role as string) || null;
  } catch {
    return null;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const role = await roleFromCookie(req);

  if (pathname === "/login") {
    if (role) return NextResponse.redirect(new URL("/dashboard", req.url));
    return NextResponse.next();
  }

  if (!role) {
    const url = new URL("/login", req.url);
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith("/admin/settings") && role !== "ADMIN") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }
  // Approvals stays reachable for employees who are HODs (the APIs scope what they can see/act on)
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/approvals") && role === "EMPLOYEE") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  // Protect all pages; API routes enforce auth themselves.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|.*\\.png$).*)"],
};
