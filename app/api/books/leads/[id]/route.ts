import { NextRequest, NextResponse } from "next/server";
import { get, run } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";
import { autoSyncAfterCreate } from "@/lib/zoho";
import { LEAD_STAGES } from "@/lib/books";

type Ctx = { params: Promise<{ id: string }> };
type Lead = { id: number; name: string; company: string | null; email: string | null; phone: string | null; stage: string; converted_party_id: number | null };

const EDITABLE = ["name", "company", "email", "phone", "source", "stage", "value", "notes"];

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(req);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const lead = await get<Lead>("SELECT * FROM books_leads WHERE id = ?", Number(id));
  if (!lead) return bad("Lead not found", 404);
  const b = await req.json().catch(() => ({}));

  // Convert a won lead into a customer (and push that customer to Zoho if auto-sync is on).
  if (b.action === "convert") {
    if (lead.converted_party_id) return bad("This lead is already a customer");
    const info = await run(
      "INSERT INTO books_parties (type, name, company, email, phone) VALUES ('customer', ?, ?, ?, ?)",
      lead.name, lead.company || null, lead.email || null, lead.phone || null);
    await run("UPDATE books_leads SET converted_party_id = ?, stage = 'Won' WHERE id = ?", Number(info.lastInsertRowid), lead.id);
    await autoSyncAfterCreate("contact");
    return NextResponse.json({ ok: true, partyId: info.lastInsertRowid });
  }

  // Stage-only move (drag-and-drop) or a full edit.
  if (b.stage && !LEAD_STAGES.includes(b.stage)) return bad("Invalid stage");
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const k of EDITABLE) {
    if (k in b) { updates.push(`${k} = ?`); values.push(k === "value" ? Number(b[k]) || 0 : b[k] === "" ? null : b[k]); }
  }
  if (!updates.length) return bad("Nothing to update");
  values.push(Number(id));
  await run(`UPDATE books_leads SET ${updates.join(", ")} WHERE id = ?`, ...values);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(req);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  await run("DELETE FROM books_leads WHERE id = ?", Number(id));
  return NextResponse.json({ ok: true });
}
