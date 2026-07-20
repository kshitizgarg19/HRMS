import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const COOKIE_NAME = "nexus_token";

// Lazy secret: never fall back to a known dev secret in production (would let tokens be forged).
let _secret: Uint8Array | undefined;
function getSecret(): Uint8Array {
  if (_secret) return _secret;
  const s = process.env.NEXUS_JWT_SECRET;
  if (!s && process.env.NODE_ENV === "production") {
    throw new Error("NEXUS_JWT_SECRET is not set in production");
  }
  _secret = new TextEncoder().encode(s || "nexus-hrms-dev-secret-change-in-prod");
  return _secret;
}

async function roleFromCookie(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get(COOKIE_NAME)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return (payload.role as string) || null;
  } catch {
    // Invalid token OR (in prod) a missing secret → treat as unauthenticated. Fails closed.
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
  // CRM sales workspace is open to employees (leads → quote → order → invoice → payment);
  // accounting, banking, purchases and integrations stay HR/Admin only.
  if (pathname.startsWith("/books") && role === "EMPLOYEE") {
    const EMP_OK = ["/books/leads", "/books/customers", "/books/quotes", "/books/sales-orders", "/books/invoices", "/books/payments-received"];
    if (!EMP_OK.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      return NextResponse.redirect(new URL("/books/leads", req.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // Protect all pages; API routes enforce auth themselves.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icon.svg|.*\\.png$).*)"],
};
