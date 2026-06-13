import { NextRequest, NextResponse } from "next/server";
import { all, run } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";

export async function GET() {
  const me = await requireAuth();
  if (isErr(me)) return me;
  const rows = await all("SELECT * FROM holidays ORDER BY date");
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const me = await requireAuth(["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const { name, date, type, description } = await req.json().catch(() => ({}));
  if (!name || !date) return bad("Name and date are required");
  try {
    const info = await run(
      "INSERT INTO holidays (name, date, type, description) VALUES (?, ?, ?, ?)",
      String(name).trim(), date, type === "Optional" ? "Optional" : "Public", description || null
    );
    return NextResponse.json({ ok: true, id: info.lastInsertRowid });
  } catch {
    return bad("A holiday already exists on that date");
  }
}
