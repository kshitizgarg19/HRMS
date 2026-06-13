import { NextRequest, NextResponse } from "next/server";
import { get, run } from "@/lib/db";
import { requireAuth, isErr, bad, forbidden } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth();
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const slip = await get<{ employee_id: number }>(
    `SELECT p.*, e.name AS employee_name, e.emp_code, e.department, e.designation, e.pan, e.uan,
            e.bank_name, e.account_no, e.join_date, e.email
     FROM payslips p JOIN employees e ON e.id = p.employee_id WHERE p.id = ?`,
    Number(id)
  );
  if (!slip) return bad("Payslip not found", 404);
  if (me.role === "EMPLOYEE" && slip.employee_id !== me.id) return forbidden();
  return NextResponse.json({ slip });
}

/** Delete a payslip (ADMIN) — lets you correct salary and re-run payroll for that employee/month. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(["ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const info = await run("DELETE FROM payslips WHERE id = ?", Number(id));
  if (!info.changes) return bad("Payslip not found", 404);
  return NextResponse.json({ ok: true });
}
