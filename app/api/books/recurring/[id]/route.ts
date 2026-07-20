import { NextRequest, NextResponse } from "next/server";
import { get, run, tx } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";
import { computeTotals, nextNumber } from "@/lib/books";
import { addDays, todayStr } from "@/lib/format";

type Ctx = { params: Promise<{ id: string }> };

function advance(date: string, freq: string): string {
  const d = new Date(date + "T00:00:00");
  if (freq === "weekly") d.setDate(d.getDate() + 7);
  else if (freq === "quarterly") d.setMonth(d.getMonth() + 3);
  else d.setMonth(d.getMonth() + 1);
  return d.toLocaleDateString("en-CA");
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const r = await get<{ id: number; party_id: number; frequency: string; next_date: string; lines: string | null; notes: string | null; active: number }>(
    "SELECT * FROM books_recurring WHERE id = ?", Number(id));
  if (!r) return bad("Profile not found", 404);
  const body = await req.json().catch(() => ({}));

  if (body.action === "toggle") {
    await run("UPDATE books_recurring SET active = ? WHERE id = ?", r.active ? 0 : 1, r.id);
    return NextResponse.json({ ok: true });
  }

  if (body.action === "generate") {
    let raw: unknown[] = [];
    try { raw = JSON.parse(r.lines || "[]"); } catch { raw = []; }
    const { lines, subtotal, tax, total } = computeTotals(raw as never[]);
    if (!lines.length) return bad("This profile has no items");
    let number = "";
    await tx(async (q) => {
      number = await nextNumber(q, "invoice");
      const info = await q.run(
        "INSERT INTO books_txns (type, number, party_id, txn_date, due_date, status, subtotal, tax, total, paid, notes, created_by) VALUES ('invoice', ?, ?, ?, ?, 'Sent', ?, ?, ?, 0, ?, ?)",
        number, r.party_id, todayStr(), addDays(todayStr(), 15), subtotal, tax, total, r.notes, me.id);
      const invId = Number(info.lastInsertRowid);
      for (const l of lines) {
        await q.run("INSERT INTO books_txn_lines (txn_id, item_id, name, qty, rate, tax_rate, amount) VALUES (?, ?, ?, ?, ?, ?, ?)",
          invId, l.item_id, l.name, l.qty, l.rate, l.tax_rate, l.amount);
        if (l.item_id) await q.run("UPDATE books_items SET stock = stock - ? WHERE id = ? AND type='goods'", l.qty, l.item_id);
      }
      await q.run("UPDATE books_recurring SET next_date = ?, last_generated = ? WHERE id = ?", advance(r.next_date, r.frequency), todayStr(), r.id);
    });
    return NextResponse.json({ ok: true, number });
  }

  return bad("Unknown action");
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  await run("DELETE FROM books_recurring WHERE id = ?", Number(id));
  return NextResponse.json({ ok: true });
}
