import { NextRequest, NextResponse } from "next/server";
import { all, run } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";

export async function GET() {
  const me = await requireAuth();
  if (isErr(me)) return me;
  const rows = await all(
    `SELECT a.*, e.name AS author_name, e.avatar_color AS author_color, e.designation AS author_designation
     FROM announcements a JOIN employees e ON e.id = a.created_by
     ORDER BY a.pinned DESC, a.created_at DESC LIMIT 100`
  );
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const me = await requireAuth(["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const { title, body, pinned } = await req.json().catch(() => ({}));
  if (!title || !body) return bad("Title and message are required");
  const info = await run(
    "INSERT INTO announcements (title, body, pinned, created_by) VALUES (?, ?, ?, ?)",
    String(title).trim(), String(body).trim(), pinned ? 1 : 0, me.id
  );
  return NextResponse.json({ ok: true, id: info.lastInsertRowid });
}
