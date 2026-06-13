import { NextRequest, NextResponse } from "next/server";
import { all, tx } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";

export async function GET() {
  const me = await requireAuth();
  if (isErr(me)) return me;
  const rows = await all(
    `SELECT lt.*, (SELECT COUNT(*) FROM leave_requests lr WHERE lr.leave_type_id = lt.id) AS request_count
     FROM leave_types lt ORDER BY lt.id`
  );
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const me = await requireAuth(["ADMIN"]);
  if (isErr(me)) return me;
  const { name, annual_quota, paid } = await req.json().catch(() => ({}));
  const clean = String(name || "").trim();
  const quota = Number(annual_quota);
  if (!clean) return bad("Leave type name is required");
  if (isNaN(quota) || quota < 0) return bad("Annual quota must be 0 or more");

  try {
    const typeId = await tx(async (q) => {
      const info = await q.run("INSERT INTO leave_types (name, annual_quota, paid) VALUES (?, ?, ?)", clean, quota, paid ? 1 : 0);
      const id = Number(info.lastInsertRowid);
      // allocate the quota to every existing employee
      await q.run("INSERT OR IGNORE INTO leave_balances (employee_id, leave_type_id, allocated, used) SELECT id, ?, ?, 0 FROM employees", id, quota);
      return id;
    });
    return NextResponse.json({ ok: true, id: typeId });
  } catch {
    return bad("A leave type with that name already exists");
  }
}
