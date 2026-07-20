import { NextRequest, NextResponse } from "next/server";
import { all, run } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";
import { computeTotals } from "@/lib/books";

export async function GET(req: NextRequest) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const rows = await all(
    `SELECT r.*, p.name AS party_name FROM books_recurring r
     LEFT JOIN books_parties p ON p.id = r.party_id
     ORDER BY r.active DESC, r.next_date`
  );
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const b = await req.json().catch(() => ({}));
  if (!b.party_id) return bad("Select a customer");
  if (!b.next_date) return bad("Pick the next invoice date");
  const { lines, total } = computeTotals(b.lines || []);
  if (!lines.length) return bad("Add at least one line item");
  const freq = ["weekly", "monthly", "quarterly"].includes(b.frequency) ? b.frequency : "monthly";
  const info = await run(
    "INSERT INTO books_recurring (party_id, frequency, next_date, lines, total, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)",
    Number(b.party_id), freq, b.next_date, JSON.stringify(lines), total, b.notes || null, me.id
  );
  return NextResponse.json({ ok: true, id: info.lastInsertRowid });
}
