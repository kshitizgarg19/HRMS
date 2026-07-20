import { NextRequest, NextResponse } from "next/server";
import { all, run } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";

const TYPES = ["asset", "liability", "equity", "income", "expense"];

export async function GET(req: NextRequest) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const rows = await all("SELECT * FROM books_coa ORDER BY type, code, name");
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || "").trim();
  if (!name) return bad("Account name is required");
  if (!TYPES.includes(b.type)) return bad("Pick a valid account type");
  const info = await run("INSERT INTO books_coa (name, type, code, opening_balance) VALUES (?, ?, ?, ?)",
    name, b.type, b.code || null, Number(b.opening_balance) || 0);
  return NextResponse.json({ ok: true, id: info.lastInsertRowid });
}
