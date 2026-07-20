import { NextRequest, NextResponse } from "next/server";
import { run } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";
import { pushUpdateItem } from "@/lib/zoho";

type Ctx = { params: Promise<{ id: string }> };
const EDITABLE = ["name", "sku", "type", "rate", "purchase_rate", "tax_rate", "stock", "low_stock", "unit", "hsn"];
const NUMERIC = ["rate", "purchase_rate", "tax_rate", "stock", "low_stock"];

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
      values.push(NUMERIC.includes(k) ? Number(b[k]) || 0 : b[k] === "" ? null : b[k]);
    }
  }
  if (!updates.length) return bad("Nothing to update");
  values.push(Number(id));
  await run(`UPDATE books_items SET ${updates.join(", ")} WHERE id = ?`, ...values);
  await pushUpdateItem(Number(id)); // mirror the edit to Zoho when auto-sync is on (best-effort)
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  await run("UPDATE books_items SET active = 0 WHERE id = ?", Number(id)); // soft-delete keeps it on past documents
  return NextResponse.json({ ok: true });
}
