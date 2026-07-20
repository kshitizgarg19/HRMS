import { NextRequest, NextResponse } from "next/server";
import { get, all, run, tx } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";
import { computePayslip, grossOf } from "@/lib/payroll";
import { workingDays } from "@/lib/format";

export async function GET(req: NextRequest) {
  const me = await requireAuth(req);
  if (isErr(me)) return me;
  const sp = req.nextUrl.searchParams;

  if (me.role === "EMPLOYEE" || sp.get("mine") === "1") {
    // Employees only ever see PUBLISHED payslips — drafts under reconciliation stay hidden.
    const [slips, emp, ytd] = await Promise.all([
      all("SELECT * FROM payslips WHERE employee_id = ? AND status != 'Draft' ORDER BY year DESC, month DESC LIMIT 24", me.id),
      get<{ basic: number; hra: number; special_allowance: number; conveyance: number }>("SELECT basic, hra, special_allowance, conveyance FROM employees WHERE id = ?", me.id),
      get<{ net: number; ded: number }>("SELECT COALESCE(SUM(net),0) net, COALESCE(SUM(total_deductions),0) ded FROM payslips WHERE employee_id = ? AND year = ? AND status != 'Draft'", me.id, new Date().getFullYear()),
    ]);
    const e = emp!;
    return NextResponse.json({ slips, structure: { ...e, gross: grossOf(e) }, ytd: ytd! });
  }

  // HR / ADMIN month view
  const now = new Date();
  const month = Number(sp.get("month")) || now.getMonth() + 1;
  const year = Number(sp.get("year")) || now.getFullYear();
  const [slips, actives, history] = await Promise.all([
    all<{ gross: number; net: number; total_deductions: number; status: string }>(
      `SELECT p.*, e.name AS employee_name, e.emp_code, e.department, e.designation, e.avatar_color
       FROM payslips p JOIN employees e ON e.id = p.employee_id
       WHERE p.month = ? AND p.year = ? ORDER BY e.name`, month, year),
    all<{ basic: number; hra: number; special_allowance: number; conveyance: number }>("SELECT basic, hra, special_allowance, conveyance FROM employees WHERE status = 'Active'"),
    all("SELECT month, year, SUM(net) total, COUNT(*) count FROM payslips GROUP BY year, month ORDER BY year, month"),
  ]);

  return NextResponse.json({
    month,
    year,
    slips,
    summary: {
      generated: slips.length > 0,
      count: slips.length,
      grossTotal: slips.reduce((s, p) => s + p.gross, 0),
      netTotal: slips.reduce((s, p) => s + p.net, 0),
      deductionTotal: slips.reduce((s, p) => s + p.total_deductions, 0),
      allPaid: slips.length > 0 && slips.every((p) => p.status === "Paid"),
      draftCount: slips.filter((p) => p.status === "Draft").length,
      published: slips.length > 0 && slips.every((p) => p.status !== "Draft"),
      activeCount: actives.length,
      estimated: actives.reduce((s, e) => s + grossOf(e), 0),
    },
    history,
  });
}

/**
 * Run payroll for a month (HR/ADMIN). Generates a DRAFT payslip for every active employee that doesn't have one.
 * With `rerun: true`, the month's existing DRAFT payslips are discarded first and regenerated from the CURRENT
 * salaries / pay components / LOP — Published & Paid payslips are never touched.
 */
export async function POST(req: NextRequest) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const { month, year, rerun } = await req.json().catch(() => ({}));
  const m = Number(month), y = Number(year);
  if (!m || !y || m < 1 || m > 12) return bad("Pick a valid month and year");

  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const monthEnd = `${y}-${String(m).padStart(2, "0")}-${new Date(y, m, 0).getDate()}`;

  const [holidayRows, employees, lwpType, compRows] = await Promise.all([
    all<{ date: string }>("SELECT date FROM holidays"),
    all<{ id: number; basic: number; hra: number; special_allowance: number; conveyance: number }>(
      "SELECT id, basic, hra, special_allowance, conveyance FROM employees WHERE status = 'Active'"),
    get<{ id: number }>("SELECT id FROM leave_types WHERE paid = 0 LIMIT 1"),
    all<{ employee_id: number; name: string; type: "earning" | "deduction"; amount: number }>(
      "SELECT employee_id, name, type, amount FROM salary_components WHERE active = 1"),
  ]);
  const holidays = holidayRows.map((h) => h.date);

  // group custom pay components by employee
  const compMap = new Map<number, { name: string; type: "earning" | "deduction"; amount: number }[]>();
  for (const c of compRows) {
    if (!compMap.has(c.employee_id)) compMap.set(c.employee_id, []);
    compMap.get(c.employee_id)!.push({ name: c.name, type: c.type, amount: c.amount });
  }

  const INS = `
    INSERT INTO payslips (employee_id, month, year, basic, hra, special_allowance, conveyance, gross, pf, prof_tax, tds,
      lop_days, lop_amount, total_deductions, net, paid_days, status, components)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Draft', ?)`;

  let created = 0;
  await tx(async (q) => {
    // Re-run: wipe this month's DRAFTS so they regenerate from current data (Published/Paid stay).
    if (rerun) await q.run("DELETE FROM payslips WHERE month = ? AND year = ? AND status = 'Draft'", m, y);
    for (const e of employees) {
      const exists = await q.get("SELECT id FROM payslips WHERE employee_id = ? AND month = ? AND year = ?", e.id, m, y);
      if (exists) continue;

      let lopDays = 0;
      if (lwpType) {
        const lwpLeaves = await q.all<{ from_date: string; to_date: string }>(
          "SELECT from_date, to_date FROM leave_requests WHERE employee_id = ? AND leave_type_id = ? AND status = 'Approved' AND NOT (to_date < ? OR from_date > ?)",
          e.id, lwpType.id, monthStart, monthEnd
        );
        for (const l of lwpLeaves) {
          const from = l.from_date < monthStart ? monthStart : l.from_date;
          const to = l.to_date > monthEnd ? monthEnd : l.to_date;
          lopDays += workingDays(from, to, holidays);
        }
      }

      const comps = compMap.get(e.id) || [];
      const p = computePayslip(e, m, y, lopDays, comps);
      await q.run(INS, e.id, m, y, p.basic, p.hra, p.special_allowance, p.conveyance, p.gross, p.pf, p.prof_tax, p.tds,
        p.lop_days, p.lop_amount, p.total_deductions, p.net, p.paid_days, comps.length ? JSON.stringify(comps) : null);
      created++;
    }
  });
  return NextResponse.json({ ok: true, created });
}

/**
 * Reconciliation gate (HR/ADMIN):
 *  - action 'publish' → Draft → Generated (now visible to employees)
 *  - action 'pay'     → Generated → Paid (only published slips can be paid)
 */
export async function PATCH(req: NextRequest) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const { action, month, year } = await req.json().catch(() => ({}));
  const m = Number(month), y = Number(year);
  if (!m || !y || m < 1 || m > 12) return bad("Pick a valid month and year");

  if (action === "publish") {
    const info = await run("UPDATE payslips SET status = 'Generated' WHERE month = ? AND year = ? AND status = 'Draft'", m, y);
    return NextResponse.json({ ok: true, published: info.changes });
  }
  if (action === "pay") {
    const info = await run("UPDATE payslips SET status = 'Paid' WHERE month = ? AND year = ? AND status = 'Generated'", m, y);
    return NextResponse.json({ ok: true, updated: info.changes });
  }
  return bad("Unknown action");
}
