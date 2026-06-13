import { NextRequest, NextResponse } from "next/server";
import { get, run } from "@/lib/db";
import { requireAuth, isErr, bad, forbidden } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth();
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const { status } = await req.json().catch(() => ({}));
  if (!["To Do", "In Progress", "Done"].includes(status)) return bad("Invalid status");

  const row = await get<{ id: number; assigned_to: number }>("SELECT * FROM tasks WHERE id = ?", Number(id));
  if (!row) return bad("Task not found", 404);
  if (row.assigned_to !== me.id && me.role === "EMPLOYEE") return forbidden();

  await run("UPDATE tasks SET status = ?, updated_at = datetime('now') WHERE id = ?", status, row.id);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const info = await run("DELETE FROM tasks WHERE id = ?", Number(id));
  if (!info.changes) return bad("Task not found", 404);
  return NextResponse.json({ ok: true });
}
