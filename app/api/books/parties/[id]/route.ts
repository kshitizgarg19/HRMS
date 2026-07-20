import { NextRequest, NextResponse } from "next/server";
import { get, run } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";
import { pushUpdateContact } from "@/lib/zoho";

type Ctx = { params: Promise<{ id: string }> };
const EDITABLE = ["name", "company", "email", "phone", "gstin", "billing_address", "notes"];

export async function PUT(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const b = await req.json().catch(() => ({}));
  const updates: string[] = [];
  const values: unknown[] = [];
  for (const k of EDITABLE) {
    if (k in b) {
      updates.push(`${k} = ?`);
      values.push(b[k] === "" ? null : b[k]);
    }
  }
  if (!updates.length) return bad("Nothing to update");
  values.push(Number(id));
  await run(`UPDATE books_parties SET ${updates.join(", ")} WHERE id = ?`, ...values);
  await pushUpdateContact(Number(id)); // mirror the edit to Zoho when auto-sync is on (best-effort)
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const used = (await get<{ c: number }>("SELECT COUNT(*) c FROM books_txns WHERE party_id = ?", Number(id)))!;
  if (used.c > 0) return bad(`Can't delete — ${used.c} document(s) reference this contact.`);
  await run("DELETE FROM books_parties WHERE id = ?", Number(id));
  return NextResponse.json({ ok: true });
}
