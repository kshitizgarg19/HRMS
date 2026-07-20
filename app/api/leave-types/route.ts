import { NextRequest, NextResponse } from "next/server";
import { all, tx } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";
import { parseScope, scopeToJson } from "@/lib/leave";

export async function GET(req: NextRequest) {
  const me = await requireAuth(req);
  if (isErr(me)) return me;
  const rows = await all(
    `SELECT lt.*, (SELECT COUNT(*) FROM leave_requests lr WHERE lr.leave_type_id = lt.id) AS request_count
     FROM leave_types lt ORDER BY lt.id`
  );
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const me = await requireAuth(req, ["ADMIN"]);
  if (isErr(me)) return me;
  const { name, annual_quota, paid, carry_forward, carry_cap, encashable, scope } = await req.json().catch(() => ({}));
  const clean = String(name || "").trim();
  const quota = Number(annual_quota);
  if (!clean) return bad("Leave type name is required");
  if (isNaN(quota) || quota < 0) return bad("Annual quota must be 0 or more");
  const scopeJson = scopeToJson(scope);
  const list = parseScope(scopeJson);

  try {
    const typeId = await tx(async (q) => {
      const info = await q.run(
        "INSERT INTO leave_types (name, annual_quota, paid, carry_forward, carry_cap, encashable, scope) VALUES (?, ?, ?, ?, ?, ?, ?)",
        clean, quota, paid ? 1 : 0, carry_forward ? 1 : 0, Number(carry_cap) || 0, encashable ? 1 : 0, scopeJson
      );
      const id = Number(info.lastInsertRowid);
      // allocate the quota to applicable employees only (per-department scope)
      if (list) {
        await q.run(
          `INSERT OR IGNORE INTO leave_balances (employee_id, leave_type_id, allocated, used)
           SELECT id, ?, ?, 0 FROM employees WHERE department IN (${list.map(() => "?").join(",")})`,
          id, quota, ...list
        );
      } else {
        await q.run("INSERT OR IGNORE INTO leave_balances (employee_id, leave_type_id, allocated, used) SELECT id, ?, ?, 0 FROM employees", id, quota);
      }
      return id;
    });
    return NextResponse.json({ ok: true, id: typeId });
  } catch {
    return bad("A leave type with that name already exists");
  }
}
