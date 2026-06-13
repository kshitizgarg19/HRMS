import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { get } from "./db";
import type { Role, SessionUser } from "./types";

export const COOKIE_NAME = "nexus_token";
const SECRET = new TextEncoder().encode(process.env.NEXUS_JWT_SECRET || "nexus-hrms-dev-secret-change-in-prod");

export async function signToken(user: SessionUser): Promise<string> {
  return new SignJWT({ name: user.name, role: user.role, code: user.emp_code, email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(String(user.id))
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET);
}

export async function verifyToken(token: string) {
  const { payload } = await jwtVerify(token, SECRET);
  return payload;
}

/** Resolve the current session from the request cookie, re-checking the DB so role/status changes apply instantly. */
export async function getSession(): Promise<SessionUser | null> {
  try {
    const store = await cookies();
    const token = store.get(COOKIE_NAME)?.value;
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

/** Returns the session user, or a NextResponse error to return directly. */
export async function requireAuth(roles?: Role[]): Promise<SessionUser | NextResponse> {
  const me = await getSession();
  if (!me) return unauthorized();
  if (roles && !roles.includes(me.role)) return forbidden();
  return me;
}

export function isErr(x: SessionUser | NextResponse): x is NextResponse {
  return x instanceof NextResponse;
}
