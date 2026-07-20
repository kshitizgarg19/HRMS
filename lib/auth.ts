import { SignJWT, jwtVerify } from "jose";
import { cookies, headers } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { get } from "./db";
import type { Role, SessionUser } from "./types";

export const COOKIE_NAME = "nexus_token";

/**
 * Resolve the JWT signing key lazily. In production a missing NEXUS_JWT_SECRET is a hard error —
 * we never fall back to a shared/known secret there (that would let anyone forge an ADMIN token).
 * Local dev keeps a fallback so `npm run dev` works without configuring env.
 */
let _secret: Uint8Array | undefined;
function getSecret(): Uint8Array {
  if (_secret) return _secret;
  const s = process.env.NEXUS_JWT_SECRET;
  if (!s && process.env.NODE_ENV === "production") {
    throw new Error("NEXUS_JWT_SECRET is not set — refusing to sign/verify tokens with an insecure fallback in production");
  }
  _secret = new TextEncoder().encode(s || "nexus-hrms-dev-secret-change-in-prod");
  return _secret;
}

export async function signToken(user: SessionUser): Promise<string> {
  return new SignJWT({ name: user.name, role: user.role, code: user.emp_code, email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, getSecret());
  return payload;
}

const cookieRe = new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`);

/** Read the auth token. The actual request object (`req`) is the reliable source — on some Vercel
 *  POST requests the ambient cookies()/headers() come back empty even though the cookie was sent. */
async function readToken(req?: NextRequest): Promise<string | undefined> {
  if (req) {
    try {
      const t = req.cookies.get(COOKIE_NAME)?.value;
      if (t) return t;
    } catch { /* ignore */ }
    try {
      const m = (req.headers.get("cookie") || "").match(cookieRe);
      if (m) return decodeURIComponent(m[1]);
    } catch { /* ignore */ }
  }
  try {
    const t = (await cookies()).get(COOKIE_NAME)?.value;
    if (t) return t;
  } catch { /* ignore */ }
  try {
    const m = ((await headers()).get("cookie") || "").match(cookieRe);
    if (m) return decodeURIComponent(m[1]);
  } catch { /* ignore */ }
  return undefined;
}

/** Resolve the current session from the request cookie, re-checking the DB so role/status changes apply instantly. */
export async function getSession(req?: NextRequest): Promise<SessionUser | null> {
  try {
    const token = await readToken(req);
    if (!token) return null;
    const payload = await verifyToken(token);
    const row = await get<SessionUser & { status: string }>(
      "SELECT id, name, role, emp_code, email, status FROM employees WHERE id = ?",
      Number(payload.sub)
    );
    if (!row || row.status === "Exited") return null;
    const hod = await get<{ c: number }>("SELECT COUNT(*) c FROM departments WHERE hod_id = ?", row.id);
    return { id: row.id, name: row.name, role: row.role as Role, emp_code: row.emp_code, email: row.email, is_hod: (hod?.c ?? 0) > 0 };
  } catch {
    return null;
  }
}

export function unauthorized() {
  return NextResponse.json({ error: "Not signed in" }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: "You don't have permission to do that" }, { status: 403 });
}

export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Returns the session user, or a NextResponse error to return directly.
 *  Backwards-compatible: call as requireAuth(req), requireAuth(req, roles), or requireAuth(roles). */
export async function requireAuth(reqOrRoles?: NextRequest | Role[], maybeRoles?: Role[]): Promise<SessionUser | NextResponse> {
  const req = Array.isArray(reqOrRoles) ? undefined : reqOrRoles;
  const roles = Array.isArray(reqOrRoles) ? reqOrRoles : maybeRoles;
  const me = await getSession(req);
  if (!me) return unauthorized();
  if (roles && !roles.includes(me.role)) return forbidden();
  return me;
}

export function isErr(x: SessionUser | NextResponse): x is NextResponse {
  return x instanceof NextResponse;
}
