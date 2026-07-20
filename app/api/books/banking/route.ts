import { NextRequest, NextResponse } from "next/server";
import { all, run } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const accounts = await all(
    `SELECT a.*, a.opening_balance
       + COALESCE((SELECT SUM(CASE WHEN kind='in' THEN amount ELSE -amount END) FROM books_bank_txns t WHERE t.account_id = a.id), 0) AS balance
     FROM books_accounts a ORDER BY a.id`
  );
  const txns = await all(
    `SELECT t.*, a.name AS account_name FROM books_bank_txns t
     JOIN books_accounts a ON a.id = t.account_id
     ORDER BY t.txn_date DESC, t.id DESC LIMIT 100`
  );
  return NextResponse.json({ accounts, txns });
}

export async function POST(req: NextRequest) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const b = await req.json().catch(() => ({}));

  if (b.action === "account") {
    const name = String(b.name || "").trim();
    if (!name) return bad("Account name is required");
    const info = await run("INSERT INTO books_accounts (name, type, account_no, opening_balance) VALUES (?, ?, ?, ?)",
      name, b.type || "bank", b.account_no || null, Number(b.opening_balance) || 0);
    return NextResponse.json({ ok: true, id: info.lastInsertRowid });
  }

  if (b.action === "txn") {
    if (!b.account_id) return bad("Pick an account");
    if (!b.txn_date) return bad("Date is required");
    const amount = Math.round((Number(b.amount) || 0) * 100) / 100;
    if (amount <= 0) return bad("Enter a positive amount");
    const kind = b.kind === "out" ? "out" : "in";
    const info = await run("INSERT INTO books_bank_txns (account_id, txn_date, kind, amount, description, category) VALUES (?, ?, ?, ?, ?, ?)",
      Number(b.account_id), b.txn_date, kind, amount, b.description || null, b.category || null);
    return NextResponse.json({ ok: true, id: info.lastInsertRowid });
  }

  return bad("Unknown action");
}
