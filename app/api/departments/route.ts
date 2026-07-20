import { NextRequest, NextResponse } from "next/server";
import { all, run } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const me = await requireAuth(req);
  if (isErr(me)) return me;
  const rows = await all(
    `SELECT d.id, d.name, d.hod_id, h.name AS hod_name,
            (SELECT COUNT(*) FROM employees e WHERE e.department = d.name AND e.status != 'Exited') AS headcount
     FROM departments d LEFT JOIN employees h ON h.id = d.hod_id
     ORDER BY d.name`
  );
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const me = await requireAuth(req, ["ADMIN"]);
  if (isErr(me)) return me;
  const { name } = await req.json().catch(() => ({}));
  const clean = String(name || "").trim();
  if (!clean) return bad("Department name is required");
  try {
    const info = await run("INSERT INTO departments (name) VALUES (?)", clean);
    return NextResponse.json({ ok: true, id: info.lastInsertRowid });
  } catch {
    return bad("A department with that name already exists");
  }
}
