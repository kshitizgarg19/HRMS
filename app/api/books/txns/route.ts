import { NextRequest, NextResponse } from "next/server";
import { all, run, tx } from "@/lib/db";
import { requireAuth, isErr, bad, forbidden } from "@/lib/auth";
import { TXN_META, computeTotals, nextNumber, isTxnType, type TxnType } from "@/lib/books";
import { autoSyncAfterCreate } from "@/lib/zoho";

export async function GET(req: NextRequest) {
  const me = await requireAuth(req);
  if (isErr(me)) return me;
  const type = req.nextUrl.searchParams.get("type");
  const status = req.nextUrl.searchParams.get("status");
  const where: string[] = [];
  const params: unknown[] = [];
  // Employees only ever see customer-side sales documents — never vendor bills / POs / vendor credits.
  const EMP_TYPES = ["quote", "sales_order", "invoice"];
  if (me.role === "EMPLOYEE") {
    if (type && EMP_TYPES.includes(type)) { where.push("t.type = ?"); params.push(type); }
    else { where.push(`t.type IN (${EMP_TYPES.map(() => "?").join(",")})`); params.push(...EMP_TYPES); }
  } else if (type) { where.push("t.type = ?"); params.push(type); }
  if (status) { where.push("t.status = ?"); params.push(status); }
  const rows = await all(
    `SELECT t.*, p.name AS party_name, p.company AS party_company
     FROM books_txns t LEFT JOIN books_parties p ON p.id = t.party_id
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY t.created_at DESC, t.id DESC LIMIT 300`,
    ...params
  );
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const me = await requireAuth(req);
  if (isErr(me)) return me;
  const b = await req.json().catch(() => ({}));
  const type = b.type as TxnType;
  if (!isTxnType(type)) return bad("Invalid document type");
  // Employees handle the customer-side sales flow; vendor docs (PO/bill/vendor-credit) stay HR/Admin.
  const EMP_DOCS = ["quote", "sales_order", "invoice"];
  if (me.role === "EMPLOYEE" && !EMP_DOCS.includes(type)) return forbidden();
  if (!b.party_id) return bad(`Select a ${TXN_META[type].party}`);
  if (!b.txn_date) return bad("Date is required");

  const { lines, subtotal, tax, total } = computeTotals(b.lines || []);
  if (!lines.length) return bad("Add at least one line item");

  const status = b.status || TXN_META[type].defaultStatus;

  let id = 0, number = "";
  await tx(async (q) => {
    number = await nextNumber(q, type);
    const info = await q.run(
      "INSERT INTO books_txns (type, number, party_id, txn_date, due_date, status, subtotal, tax, total, paid, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)",
      type, number, Number(b.party_id), b.txn_date, b.due_date || null, status, subtotal, tax, total, b.notes || null, me.id
    );
    id = Number(info.lastInsertRowid);
    for (const l of lines) {
      await q.run(
        "INSERT INTO books_txn_lines (txn_id, item_id, name, qty, rate, tax_rate, amount) VALUES (?, ?, ?, ?, ?, ?, ?)",
        id, l.item_id, l.name, l.qty, l.rate, l.tax_rate, l.amount
      );
      // Inventory movement: an invoice sells stock (−), a bill restocks (+). Quotes don't move stock.
      if (l.item_id && (type === "invoice" || type === "bill")) {
        await q.run("UPDATE books_items SET stock = stock + ? WHERE id = ? AND type = 'goods'", type === "invoice" ? -l.qty : l.qty, l.item_id);
      }
    }
  });
  await autoSyncAfterCreate(type); // auto-push the new document to Zoho (quote→estimate, SO, invoice, CN, PO, bill, VC)
  return NextResponse.json({ ok: true, id, number });
}
