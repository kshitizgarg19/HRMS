import { NextRequest, NextResponse } from "next/server";
import { get, run } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const a = await get<{ system: number }>("SELECT system FROM books_coa WHERE id = ?", Number(id));
  if (!a) return bad("Account not found", 404);
  if (a.system) return bad("System accounts can't be deleted");
  const used = (await get<{ c: number }>("SELECT COUNT(*) c FROM books_journal_lines WHERE account_id = ?", Number(id)))!;
  if (used.c > 0) return bad("This account is used in journal entries");
  await run("DELETE FROM books_coa WHERE id = ?", Number(id));
  return NextResponse.json({ ok: true });
}
