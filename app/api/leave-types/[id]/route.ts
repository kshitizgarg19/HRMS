import { NextRequest, NextResponse } from "next/server";
import { get, tx } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";
import { parseScope, scopeToJson } from "@/lib/leave";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(req, ["ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const { name, annual_quota, paid, carry_forward, carry_cap, encashable, scope, sync } = await req.json().catch(() => ({}));
  const type = await get<{ id: number }>("SELECT * FROM leave_types WHERE id = ?", Number(id));
  if (!type) return bad("Leave type not found", 404);

  const clean = String(name || "").trim();
  const quota = Number(annual_quota);
  if (!clean) return bad("Leave type name is required");
  if (isNaN(quota) || quota < 0) return bad("Annual quota must be 0 or more");

  const dupe = await get("SELECT id FROM leave_types WHERE lower(name) = lower(?) AND id != ?", clean, type.id);
  if (dupe) return bad("A leave type with that name already exists");

  const scopeJson = scopeToJson(scope);
  const list = parseScope(scopeJson);

  await tx(async (q) => {
    await q.run(
      "UPDATE leave_types SET name = ?, annual_quota = ?, paid = ?, carry_forward = ?, carry_cap = ?, encashable = ?, scope = ? WHERE id = ?",
      clean, quota, paid ? 1 : 0, carry_forward ? 1 : 0, Number(carry_cap) || 0, encashable ? 1 : 0, scopeJson, type.id
    );
    if (sync) {
      // re-align allocations to the (possibly new) quota + department scope
      await q.run("UPDATE leave_balances SET allocated = ? WHERE leave_type_id = ?", quota, type.id);
      if (list) {
        await q.run(
          `INSERT OR IGNORE INTO leave_balances (employee_id, leave_type_id, allocated, used)
           SELECT id, ?, ?, 0 FROM employees WHERE department IN (${list.map(() => "?").join(",")})`,
          type.id, quota, ...list
        );
        // drop balances for employees now outside the scope, but only if unused
        await q.run(
          `DELETE FROM leave_balances WHERE leave_type_id = ? AND used = 0
           AND employee_id IN (SELECT id FROM employees WHERE department IS NULL OR department NOT IN (${list.map(() => "?").join(",")}))`,
          type.id, ...list
        );
      } else {
        await q.run("INSERT OR IGNORE INTO leave_balances (employee_id, leave_type_id, allocated, used) SELECT id, ?, ?, 0 FROM employees", type.id, quota);
      }
    }
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(req, ["ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const used = (await get<{ c: number }>("SELECT COUNT(*) c FROM leave_requests WHERE leave_type_id = ?", Number(id)))!;
  if (used.c > 0) return bad(`Can't delete — ${used.c} leave request(s) use this type. Set its quota to 0 instead.`);
  await tx(async (q) => {
    await q.run("DELETE FROM leave_balances WHERE leave_type_id = ?", Number(id));
    await q.run("DELETE FROM leave_types WHERE id = ?", Number(id));
  });
  return NextResponse.json({ ok: true });
}
