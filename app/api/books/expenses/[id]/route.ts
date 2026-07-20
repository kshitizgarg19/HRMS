import { NextRequest, NextResponse } from "next/server";
import { run } from "@/lib/db";
import { requireAuth, isErr } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  await run("DELETE FROM books_expenses WHERE id = ?", Number(id));
  return NextResponse.json({ ok: true });
}
