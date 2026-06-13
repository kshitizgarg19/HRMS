import { NextRequest, NextResponse } from "next/server";
import { run } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const { title, body, pinned } = await req.json().catch(() => ({}));
  if (!title || !body) return bad("Title and message are required");
  const info = await run(
    "UPDATE announcements SET title = ?, body = ?, pinned = ? WHERE id = ?",
    String(title).trim(), String(body).trim(), pinned ? 1 : 0, Number(id)
  );
  if (!info.changes) return bad("Announcement not found", 404);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const info = await run("DELETE FROM announcements WHERE id = ?", Number(id));
  if (!info.changes) return bad("Announcement not found", 404);
  return NextResponse.json({ ok: true });
}
