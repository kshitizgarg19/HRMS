import { NextRequest, NextResponse } from "next/server";
import { all, tx } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const rows = await all(`
    SELECT j.*,
      COALESCE((SELECT SUM(debit) FROM books_journal_lines l WHERE l.journal_id = j.id), 0) AS amount,
      (SELECT COUNT(*) FROM books_journal_lines l WHERE l.journal_id = j.id) AS line_count
    FROM books_journals j
    ORDER BY j.journal_date DESC, j.id DESC
    LIMIT 300`);
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const b = await req.json().catch(() => ({}));
  if (!b.journal_date) return bad("Journal date is required");

  const raw = Array.isArray(b.lines) ? b.lines : [];
  const lines: { account_id: number; debit: number; credit: number; description: string | null }[] = [];
  let totalDebit = 0, totalCredit = 0;
  for (const l of raw) {
    const account_id = Number(l.account_id);
    if (!account_id) continue;
    const debit = Math.max(0, Math.round((Number(l.debit) || 0) * 100) / 100);
    const credit = Math.max(0, Math.round((Number(l.credit) || 0) * 100) / 100);
    if (debit === 0 && credit === 0) continue;
    totalDebit += debit;
    totalCredit += credit;
    lines.push({ account_id, debit, credit, description: l.description || null });
  }
  if (lines.length < 2) return bad("A journal needs at least two lines");
  if (Math.abs(totalDebit - totalCredit) > 0.01)
    return bad(`Debits (${totalDebit.toFixed(2)}) must equal credits (${totalCredit.toFixed(2)})`);

  let id = 0;
  await tx(async (q) => {
    const info = await q.run(
      "INSERT INTO books_journals (journal_date, reference, narration, created_by) VALUES (?, ?, ?, ?)",
      b.journal_date, b.reference || null, b.narration || null, me.id);
    id = Number(info.lastInsertRowid);
    for (const l of lines) {
      await q.run(
        "INSERT INTO books_journal_lines (journal_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)",
        id, l.account_id, l.debit, l.credit, l.description);
    }
  });
  return NextResponse.json({ ok: true, id });
}
