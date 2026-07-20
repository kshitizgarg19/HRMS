import { NextRequest, NextResponse } from "next/server";
import { all } from "@/lib/db";
import { requireAuth, isErr } from "@/lib/auth";

type Account = { id: number; name: string; type: string; code: string | null; opening_balance: number };
type Posting = { account_id: number; d: number; c: number };

const debitNatural = (t: string) => t === "asset" || t === "expense";

export async function GET(req: NextRequest) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;

  const accounts = await all<Account>("SELECT id, name, type, code, opening_balance FROM books_coa ORDER BY type, code, name");
  const postings = await all<Posting>(
    "SELECT account_id, COALESCE(SUM(debit),0) d, COALESCE(SUM(credit),0) c FROM books_journal_lines GROUP BY account_id");
  const pmap = new Map(postings.map((p) => [p.account_id, p]));

  const rows = accounts.map((a) => {
    const p = pmap.get(a.id);
    const openingDebitPositive = debitNatural(a.type) ? a.opening_balance : -a.opening_balance;
    const net = openingDebitPositive + ((p?.d || 0) - (p?.c || 0)); // debit-positive net
    return {
      id: a.id,
      name: a.name,
      type: a.type,
      code: a.code,
      debit: net > 0.001 ? Math.round(net * 100) / 100 : 0,
      credit: net < -0.001 ? Math.round(-net * 100) / 100 : 0,
    };
  });

  const totalDebit = Math.round(rows.reduce((s, r) => s + r.debit, 0) * 100) / 100;
  const totalCredit = Math.round(rows.reduce((s, r) => s + r.credit, 0) * 100) / 100;
  return NextResponse.json({ rows, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 0.01 });
}
