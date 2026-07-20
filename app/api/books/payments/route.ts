import { NextRequest, NextResponse } from "next/server";
import { all } from "@/lib/db";
import { requireAuth, isErr } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const txnType = req.nextUrl.searchParams.get("direction") === "out" ? "bill" : "invoice";
  const rows = await all<{ amount: number }>(
    `SELECT pm.*, t.number AS txn_number, t.type AS txn_type, p.name AS party_name
     FROM books_payments pm
     JOIN books_txns t ON t.id = pm.txn_id
     LEFT JOIN books_parties p ON p.id = t.party_id
     WHERE t.type = ?
     ORDER BY pm.pay_date DESC, pm.id DESC LIMIT 300`,
    txnType
  );
  return NextResponse.json({ rows, total: rows.reduce((s, r) => s + r.amount, 0) });
}
