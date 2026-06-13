import { NextRequest, NextResponse } from "next/server";
import { run } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const { name, date, type, description } = await req.json().catch(() => ({}));
  if (!name || !date) return bad("Name and date are required");
  const info = await run(
    "UPDATE holidays SET name = ?, date = ?, type = ?, description = ? WHERE id = ?",
    String(name).trim(), date, type === "Optional" ? "Optional" : "Public", description || null, Number(id)
  );
  if (!info.changes) return bad("Holiday not found", 404);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const info = await run("DELETE FROM holidays WHERE id = ?", Number(id));
  if (!info.changes) return bad("Holiday not found", 404);
  return NextResponse.json({ ok: true });
}
