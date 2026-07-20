import { NextRequest, NextResponse } from "next/server";
import { get, all, run } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

async function guard(meRole: string, empId: number) {
  const target = await get<{ id: number; role: string }>("SELECT id, role FROM employees WHERE id = ?", empId);
  if (!target) return bad("Employee not found", 404);
  if (meRole === "HR" && target.role === "ADMIN") return bad("Admin accounts can only be managed by an Admin", 403);
  return null;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const rows = await all(
    "SELECT id, name, type, amount, active FROM salary_components WHERE employee_id = ? ORDER BY type DESC, id",
    Number(id)
  );
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const empId = Number(id);
  const err = await guard(me.role, empId);
  if (err) return err;

  const { name, type, amount } = await req.json().catch(() => ({}));
  const clean = String(name || "").trim();
  const amt = Number(amount);
  if (!clean) return bad("Component name is required");
  if (type !== "earning" && type !== "deduction") return bad("Type must be earning or deduction");
  if (isNaN(amt) || amt <= 0) return bad("Amount must be a positive number");

  const info = await run(
    "INSERT INTO salary_components (employee_id, name, type, amount, active) VALUES (?, ?, ?, ?, 1)",
    empId, clean, type, amt
  );
  return NextResponse.json({ ok: true, id: info.lastInsertRowid });
}
