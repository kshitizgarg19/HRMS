import { NextRequest, NextResponse } from "next/server";
import { all, run } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const rows = await all(
    `SELECT e.*, p.name AS vendor_name FROM books_expenses e
     LEFT JOIN books_parties p ON p.id = e.vendor_id
     ORDER BY e.expense_date DESC, e.id DESC LIMIT 300`
  );
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const b = await req.json().catch(() => ({}));
  const category = String(b.category || "").trim();
  if (!category) return bad("Category is required");
  if (!b.expense_date) return bad("Date is required");
  const amount = Math.round((Number(b.amount) || 0) * 100) / 100;
  if (amount <= 0) return bad("Amount must be positive");
  const tax = Math.max(0, Math.round((Number(b.tax) || 0) * 100) / 100);
  const total = Math.round((amount + tax) * 100) / 100;
  const info = await run(
    "INSERT INTO books_expenses (expense_date, category, vendor_id, amount, tax, total, payment_mode, reference, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    b.expense_date, category, b.vendor_id ? Number(b.vendor_id) : null, amount, tax, total, b.payment_mode || null, b.reference || null, b.notes || null, me.id
  );
  return NextResponse.json({ ok: true, id: info.lastInsertRowid });
}
