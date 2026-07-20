import { NextRequest, NextResponse } from "next/server";
import { get, run } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string; cid: string }> };

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const { id, cid } = await ctx.params;
  const empId = Number(id);

  const target = await get<{ role: string }>("SELECT role FROM employees WHERE id = ?", empId);
  if (!target) return bad("Employee not found", 404);
  if (me.role === "HR" && target.role === "ADMIN") return bad("Admin accounts can only be managed by an Admin", 403);

  const info = await run("DELETE FROM salary_components WHERE id = ? AND employee_id = ?", Number(cid), empId);
  if (!info.changes) return bad("Pay component not found", 404);
  return NextResponse.json({ ok: true });
}
