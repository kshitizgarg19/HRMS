import { NextRequest, NextResponse } from "next/server";
import { get, all, tx } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const journal = await get("SELECT * FROM books_journals WHERE id = ?", Number(id));
  if (!journal) return bad("Journal not found", 404);
  const lines = await all(`
    SELECT l.*, a.name AS account_name, a.type AS account_type, a.code AS account_code
    FROM books_journal_lines l
    JOIN books_coa a ON a.id = l.account_id
    WHERE l.journal_id = ?
    ORDER BY l.id`, Number(id));
  return NextResponse.json({ journal, lines });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const j = await get("SELECT id FROM books_journals WHERE id = ?", Number(id));
  if (!j) return bad("Journal not found", 404);
  await tx(async (q) => {
    await q.run("DELETE FROM books_journal_lines WHERE journal_id = ?", Number(id));
    await q.run("DELETE FROM books_journals WHERE id = ?", Number(id));
  });
  return NextResponse.json({ ok: true });
}
