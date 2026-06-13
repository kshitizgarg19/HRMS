import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { get } from "@/lib/db";
import { signToken, COOKIE_NAME, bad } from "@/lib/auth";
import type { Role } from "@/lib/types";

export async function POST(req: NextRequest) {
  const { identifier, password } = await req.json().catch(() => ({}));
  if (!identifier || !password) return bad("Enter your email / employee ID and password");

  const row = await get<{ id: number; emp_code: string; name: string; email: string; role: Role; status: string; password_hash: string }>(
    "SELECT id, emp_code, name, email, role, status, password_hash FROM employees WHERE lower(email) = lower(?) OR lower(emp_code) = lower(?)",
    String(identifier).trim(), String(identifier).trim()
  );

  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return bad("Invalid credentials. Check your email/ID and password.", 401);
  }
  if (row.status === "Exited") return bad("This account has been deactivated. Contact HR.", 403);

  const user = { id: row.id, name: row.name, role: row.role, emp_code: row.emp_code, email: row.email };
  const token = await signToken(user);
  const res = NextResponse.json({ user });
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
  return res;
}
