import { NextRequest, NextResponse } from "next/server";
import { all, tx } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";
import { parseScope } from "@/lib/leave";

/**
 * ADMIN leave-policy operations:
 *  - carry_forward: year-end roll-over. For each balance: new allocated = quota + (carry_forward ? min(balance, cap) : 0), used reset to 0.
 *  - apply_policy: reconcile every employee's balances to their department's applicable leave types (add missing, drop unused non-applicable).
 */
export async function POST(req: NextRequest) {
  const me = await requireAuth(req, ["ADMIN"]);
  if (isErr(me)) return me;
  const { action } = await req.json().catch(() => ({}));

  if (action === "carry_forward") {
    await tx(async (q) => {
      await q.run(
        `UPDATE leave_balances
         SET allocated = (
               SELECT lt.annual_quota +
                      CASE WHEN lt.carry_forward = 1
                           THEN min(max(leave_balances.allocated - leave_balances.used, 0), lt.carry_cap)
                           ELSE 0 END
               FROM leave_types lt WHERE lt.id = leave_balances.leave_type_id),
             used = 0`
      );
    });
    return NextResponse.json({ ok: true });
  }

  if (action === "apply_policy") {
    const types = await all<{ id: number; annual_quota: number; scope: string | null }>("SELECT id, annual_quota, scope FROM leave_types");
    let added = 0;
    let removed = 0;
    await tx(async (q) => {
      for (const t of types) {
        const list = parseScope(t.scope);
        if (list) {
          const ins = await q.run(
            `INSERT OR IGNORE INTO leave_balances (employee_id, leave_type_id, allocated, used)
             SELECT id, ?, ?, 0 FROM employees WHERE department IN (${list.map(() => "?").join(",")})`,
            t.id, t.annual_quota, ...list
          );
          added += ins.changes || 0;
          const del = await q.run(
            `DELETE FROM leave_balances WHERE leave_type_id = ? AND used = 0
             AND employee_id IN (SELECT id FROM employees WHERE department IS NULL OR department NOT IN (${list.map(() => "?").join(",")}))`,
            t.id, ...list
          );
          removed += del.changes || 0;
        } else {
          const ins = await q.run(
            "INSERT OR IGNORE INTO leave_balances (employee_id, leave_type_id, allocated, used) SELECT id, ?, ?, 0 FROM employees",
            t.id, t.annual_quota
          );
          added += ins.changes || 0;
        }
      }
    });
    return NextResponse.json({ ok: true, added, removed });
  }

  return bad("Unknown action");
}
