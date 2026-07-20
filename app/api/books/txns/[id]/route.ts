import { NextRequest, NextResponse } from "next/server";
import { get, all, run, tx } from "@/lib/db";
import { requireAuth, isErr, bad, forbidden } from "@/lib/auth";
import { nextNumber, payStatus, TXN_META, type TxnType } from "@/lib/books";
import { todayStr } from "@/lib/format";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(req);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const txn = await get(
    `SELECT t.*, p.name AS party_name, p.company AS party_company, p.email AS party_email,
            p.phone AS party_phone, p.gstin AS party_gstin, p.billing_address AS party_address
     FROM books_txns t LEFT JOIN books_parties p ON p.id = t.party_id WHERE t.id = ?`,
    Number(id)
  );
  if (!txn) return bad("Document not found", 404);
  // Employees can only open customer-side sales documents (not vendor bills / POs / credits).
  if (me.role === "EMPLOYEE" && !["quote", "sales_order", "invoice"].includes((txn as { type: string }).type)) return forbidden();
  const lines = await all("SELECT * FROM books_txn_lines WHERE txn_id = ? ORDER BY id", Number(id));
  const payments = await all("SELECT * FROM books_payments WHERE txn_id = ? ORDER BY pay_date DESC, id DESC", Number(id));
  return NextResponse.json({ txn: { ...txn, lines, payments } });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const row = await get<{ id: number; type: string; party_id: number; txn_date: string; status: string; subtotal: number; tax: number; total: number; paid: number; notes: string | null; converted_to: number | null }>(
    "SELECT * FROM books_txns WHERE id = ?", Number(id));
  if (!row) return bad("Document not found", 404);

  /* ---- Convert a quote/sales-order → invoice, or a purchase-order → bill (copies lines, moves stock, links) ---- */
  if (body.action === "convert") {
    const target = TXN_META[row.type as TxnType]?.convertsTo;
    if (!target) return bad("This document can't be converted");
    if (row.converted_to) return bad("This document was already converted");
    const sells = target === "invoice"; // invoice sells stock (−), bill restocks (+)
    const newStatus = target === "invoice" ? "Sent" : "Open";
    const doneStatus = target === "invoice" ? "Invoiced" : "Billed";
    const lines = await all<{ item_id: number | null; name: string; qty: number; rate: number; tax_rate: number; amount: number }>(
      "SELECT item_id, name, qty, rate, tax_rate, amount FROM books_txn_lines WHERE txn_id = ?", row.id);
    let newId = 0, number = "";
    await tx(async (q) => {
      number = await nextNumber(q, target);
      const info = await q.run(
        "INSERT INTO books_txns (type, number, party_id, txn_date, due_date, status, subtotal, tax, total, paid, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
        target, number, row.party_id, body.txn_date || todayStr(), body.due_date || null, newStatus, row.subtotal, row.tax, row.total, row.notes, me.id);
      newId = Number(info.lastInsertRowid);
      for (const l of lines) {
        await q.run("INSERT INTO books_txn_lines (txn_id, item_id, name, qty, rate, tax_rate, amount) VALUES (?, ?, ?, ?, ?, ?, ?)",
          newId, l.item_id, l.name, l.qty, l.rate, l.tax_rate, l.amount);
        if (l.item_id) await q.run("UPDATE books_items SET stock = stock + ? WHERE id = ? AND type = 'goods'", sells ? -l.qty : l.qty, l.item_id);
      }
      await q.run("UPDATE books_txns SET status = ?, converted_to = ?, updated_at = datetime('now') WHERE id = ?", doneStatus, newId, row.id);
    });
    return NextResponse.json({ ok: true, id: newId, number, target });
  }

  /* ---- Record a payment against an invoice / bill ---- */
  if (body.action === "payment") {
    const amount = Math.round((Number(body.amount) || 0) * 100) / 100;
    if (amount <= 0) return bad("Enter a positive amount");
    const outstanding = row.total - row.paid;
    if (amount > outstanding + 0.01) return bad(`Amount exceeds the outstanding balance of ${outstanding.toFixed(2)}`);
    const base = row.type === "bill" ? "Open" : "Sent";
    await tx(async (q) => {
      await q.run("INSERT INTO books_payments (txn_id, amount, pay_date, mode, reference) VALUES (?, ?, ?, ?, ?)",
        row.id, amount, body.pay_date || todayStr(), body.mode || null, body.reference || null);
      const paid = row.paid + amount;
      await q.run("UPDATE books_txns SET paid = ?, status = ?, updated_at = datetime('now') WHERE id = ?", paid, payStatus(row.total, paid, base), row.id);
    });
    return NextResponse.json({ ok: true });
  }

  /* ---- Set status (Sent / Accepted / Declined …) ---- */
  if (body.action === "status" && body.status) {
    await run("UPDATE books_txns SET status = ?, updated_at = datetime('now') WHERE id = ?", String(body.status), row.id);
    return NextResponse.json({ ok: true });
  }

  return bad("Unknown action");
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const row = await get<{ type: string }>("SELECT type FROM books_txns WHERE id = ?", Number(id));
  if (!row) return bad("Document not found", 404);
  const lines = await all<{ item_id: number | null; qty: number }>("SELECT item_id, qty FROM books_txn_lines WHERE txn_id = ?", Number(id));
  await tx(async (q) => {
    for (const l of lines) {
      if (l.item_id && (row.type === "invoice" || row.type === "bill")) {
        await q.run("UPDATE books_items SET stock = stock + ? WHERE id = ? AND type = 'goods'", row.type === "invoice" ? l.qty : -l.qty, l.item_id);
      }
    }
    await q.run("DELETE FROM books_payments WHERE txn_id = ?", Number(id));
    await q.run("DELETE FROM books_txn_lines WHERE txn_id = ?", Number(id));
    await q.run("UPDATE books_txns SET converted_to = NULL WHERE converted_to = ?", Number(id));
    await q.run("DELETE FROM books_txns WHERE id = ?", Number(id));
  });
  return NextResponse.json({ ok: true });
}
