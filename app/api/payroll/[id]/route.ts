import { NextRequest, NextResponse } from "next/server";
import { get, all, run } from "@/lib/db";
import { requireAuth, isErr, bad, forbidden } from "@/lib/auth";
import { computePayslip, type PayComponent } from "@/lib/payroll";
import { workingDays } from "@/lib/format";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(req);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const slip = await get<{ employee_id: number; status: string }>(
    `SELECT p.*, e.name AS employee_name, e.emp_code, e.department, e.designation, e.pan, e.uan,
            e.bank_name, e.account_no, e.join_date, e.email
     FROM payslips p JOIN employees e ON e.id = p.employee_id WHERE p.id = ?`,
    Number(id)
  );
  if (!slip) return bad("Payslip not found", 404);
  // Employees can only open their OWN, and never a draft that's still being reconciled.
  if (me.role === "EMPLOYEE" && (slip.employee_id !== me.id || slip.status === "Draft")) return forbidden();
  return NextResponse.json({ slip });
}

/**
 * Fully edit a payslip during reconciliation (HR/ADMIN). EVERY value is editable:
 * basic/hra/special/conveyance, pf/prof_tax/tds, LOP, plus any number of extra
 * earning/deduction lines (incentive, reimbursement, fine…). Gross / total deductions /
 * net are recomputed from those values. Locked once the slip is Paid.
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const slip = await get<{ id: number; employee_id: number; status: string; month: number; year: number }>(
    "SELECT id, employee_id, status, month, year FROM payslips WHERE id = ?",
    Number(id)
  );
  if (!slip) return bad("Payslip not found", 404);
  if (slip.status === "Paid") return bad("This payslip is already paid — adjustments are locked");

  const b = await req.json().catch(() => ({}));

  // Regenerate this slip from the employee's CURRENT salary + active pay components + LOP (keeps its status).
  // Use when an employee's salary changed and you want it reflected in THIS month's payslip.
  if (b.regenerate) {
    const emp = await get<{ basic: number; hra: number; special_allowance: number; conveyance: number }>(
      "SELECT basic, hra, special_allowance, conveyance FROM employees WHERE id = ?", slip.employee_id);
    if (!emp) return bad("Employee not found", 404);
    const comps = (await all<{ name: string; type: "earning" | "deduction"; amount: number }>(
      "SELECT name, type, amount FROM salary_components WHERE employee_id = ? AND active = 1", slip.employee_id)) as PayComponent[];
    const pad = String(slip.month).padStart(2, "0");
    const monthStart = `${slip.year}-${pad}-01`;
    const monthEnd = `${slip.year}-${pad}-${new Date(slip.year, slip.month, 0).getDate()}`;
    let lopDays = 0;
    const lwpType = await get<{ id: number }>("SELECT id FROM leave_types WHERE paid = 0 LIMIT 1");
    if (lwpType) {
      const holidays = (await all<{ date: string }>("SELECT date FROM holidays")).map((h) => h.date);
      const lwp = await all<{ from_date: string; to_date: string }>(
        "SELECT from_date, to_date FROM leave_requests WHERE employee_id = ? AND leave_type_id = ? AND status = 'Approved' AND NOT (to_date < ? OR from_date > ?)",
        slip.employee_id, lwpType.id, monthStart, monthEnd);
      for (const l of lwp) {
        const from = l.from_date < monthStart ? monthStart : l.from_date;
        const to = l.to_date > monthEnd ? monthEnd : l.to_date;
        lopDays += workingDays(from, to, holidays);
      }
    }
    const p = computePayslip(emp, slip.month, slip.year, lopDays, comps);
    await run(
      `UPDATE payslips SET basic = ?, hra = ?, special_allowance = ?, conveyance = ?, gross = ?,
         pf = ?, prof_tax = ?, tds = ?, lop_days = ?, lop_amount = ?, total_deductions = ?, net = ?, paid_days = ?, components = ?
       WHERE id = ?`,
      p.basic, p.hra, p.special_allowance, p.conveyance, p.gross, p.pf, p.prof_tax, p.tds, p.lop_days, p.lop_amount,
      p.total_deductions, p.net, p.paid_days, comps.length ? JSON.stringify(comps) : null, slip.id);
    return NextResponse.json({ ok: true, net: p.net, gross: p.gross });
  }

  const num = (v: unknown) => {
    const n = Math.round(Number(v));
    return isNaN(n) || n < 0 ? 0 : n;
  };
  const basic = num(b.basic), hra = num(b.hra), special_allowance = num(b.special_allowance), conveyance = num(b.conveyance);
  const pf = num(b.pf), prof_tax = num(b.prof_tax), tds = num(b.tds), lop_amount = num(b.lop_amount);
  const lop_days = Math.max(0, Number(b.lop_days) || 0);

  const raw = Array.isArray(b.components) ? b.components : [];
  const comps: PayComponent[] = [];
  for (const c of raw) {
    const name = String(c?.name || "").trim();
    const type: "earning" | "deduction" = c?.type === "deduction" ? "deduction" : "earning";
    const amount = num(c?.amount);
    if (!name) return bad("Every additional line needs a label");
    if (amount <= 0) return bad(`Enter a positive amount for "${name}"`);
    comps.push({ name, type, amount });
  }

  const extraEarn = comps.filter((c) => c.type === "earning").reduce((a, c) => a + c.amount, 0);
  const extraDed = comps.filter((c) => c.type === "deduction").reduce((a, c) => a + c.amount, 0);
  const gross = basic + hra + special_allowance + conveyance + extraEarn;
  const total_deductions = pf + prof_tax + tds + lop_amount + extraDed;
  const net = gross - total_deductions;
  const daysInMonth = new Date(slip.year, slip.month, 0).getDate();
  const paid_days = Math.max(0, daysInMonth - lop_days);

  await run(
    `UPDATE payslips SET basic = ?, hra = ?, special_allowance = ?, conveyance = ?, gross = ?,
       pf = ?, prof_tax = ?, tds = ?, lop_days = ?, lop_amount = ?, total_deductions = ?, net = ?, paid_days = ?, components = ?
     WHERE id = ?`,
    basic, hra, special_allowance, conveyance, gross, pf, prof_tax, tds, lop_days, lop_amount, total_deductions, net, paid_days,
    comps.length ? JSON.stringify(comps) : null, slip.id
  );
  return NextResponse.json({ ok: true, net, gross, total_deductions });
}

/** Delete a payslip (ADMIN) — lets you correct salary and re-run payroll for that employee/month. */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(req, ["ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const info = await run("DELETE FROM payslips WHERE id = ?", Number(id));
  if (!info.changes) return bad("Payslip not found", 404);
  return NextResponse.json({ ok: true });
}
