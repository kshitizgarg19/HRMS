import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { get, run } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const me = await requireAuth();
  if (isErr(me)) return me;

  const { current, next } = await req.json().catch(() => ({}));
  if (!current || !next) return bad("Both current and new password are required");
  if (String(next).length < 6) return bad("New password must be at least 6 characters");

  const row = await get<{ password_hash: string }>("SELECT password_hash FROM employees WHERE id = ?", me.id);
  if (!row || !bcrypt.compareSync(current, row.password_hash)) return bad("Current password is incorrect", 401);

  await run("UPDATE employees SET password_hash = ? WHERE id = ?", bcrypt.hashSync(next, 10), me.id);
  return NextResponse.json({ ok: true });
}
