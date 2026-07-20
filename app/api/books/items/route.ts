import { NextRequest, NextResponse } from "next/server";
import { all, run } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";
import { autoSyncAfterCreate } from "@/lib/zoho";

export async function GET(req: NextRequest) {
  const me = await requireAuth(req);
  if (isErr(me)) return me;
  const rows = await all("SELECT * FROM books_items WHERE active = 1 ORDER BY name");
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || "").trim();
  if (!name) return bad("Item name is required");
  const type = b.type === "service" ? "service" : "goods";
  const info = await run(
    "INSERT INTO books_items (name, sku, type, rate, purchase_rate, tax_rate, stock, low_stock, unit, hsn) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    name, b.sku || null, type, Number(b.rate) || 0, Number(b.purchase_rate) || 0, Number(b.tax_rate) || 0,
    type === "goods" ? Number(b.stock) || 0 : 0, type === "goods" ? Number(b.low_stock) || 0 : 0, b.unit || "pcs", b.hsn || null
  );
  await autoSyncAfterCreate("item"); // best-effort push to Zoho when auto-sync is on (never throws)
  return NextResponse.json({ ok: true, id: info.lastInsertRowid });
}
