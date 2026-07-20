import { NextRequest, NextResponse } from "next/server";
import { all, run } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";
import { LEAD_STAGES } from "@/lib/books";

export async function GET(req: NextRequest) {
  const me = await requireAuth(req);
  if (isErr(me)) return me;
  const rows = await all(
    `SELECT l.*, e.name AS owner_name
     FROM books_leads l LEFT JOIN employees e ON e.id = l.owner_id
     ORDER BY l.created_at DESC, l.id DESC`);
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const me = await requireAuth(req);
  if (isErr(me)) return me;
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || "").trim();
  if (!name) return bad("Lead name is required");
  const stage = LEAD_STAGES.includes(b.stage) ? b.stage : "New";
  const info = await run(
    "INSERT INTO books_leads (name, company, email, phone, source, stage, value, notes, owner_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    name, b.company || null, b.email || null, b.phone || null, b.source || null, stage, Number(b.value) || 0, b.notes || null, me.id, me.id);
  return NextResponse.json({ ok: true, id: info.lastInsertRowid });
}
