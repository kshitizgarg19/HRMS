import { NextRequest, NextResponse } from "next/server";
import { get, all, run, tx } from "@/lib/db";
import { requireAuth, isErr, bad, forbidden } from "@/lib/auth";
import { addDays, isWeekend, todayStr, workingDays } from "@/lib/format";

type Ctx = { params: Promise<{ id: string }> };

async function guardTarget(meRole: string, empId: number) {
  const target = await get<{ id: number; role: string; name: string }>("SELECT id, role, name FROM employees WHERE id = ?", empId);
  if (!target) return { err: bad("Employee not found", 404) };
  if (meRole === "HR" && target.role === "ADMIN") return { err: bad("Admin accounts can only be managed by an Admin", 403) };
  return { target };
}

/** Per-employee datasets for the 360° management console (HR / ADMIN). */
export async function GET(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const empId = Number(id);
  const type = req.nextUrl.searchParams.get("type");

  if (type === "leaves") {
    const requests = await all(
      `SELECT lr.*, lt.name AS leave_type, rev.name AS reviewer_name, resp.name AS responsible_name
       FROM leave_requests lr
       JOIN leave_types lt ON lt.id = lr.leave_type_id
       LEFT JOIN employees rev ON rev.id = lr.reviewed_by
       LEFT JOIN employees resp ON resp.id = lr.responsible_id
       WHERE lr.employee_id = ? ORDER BY lr.from_date DESC LIMIT 100`,
      empId
    );
    return NextResponse.json({ requests });
  }

  if (type === "attendance") {
    const month = req.nextUrl.searchParams.get("month") || todayStr().slice(0, 7);
    const rows = await all("SELECT * FROM attendance WHERE employee_id = ? AND date >= ? AND date <= ? ORDER BY date DESC", empId, `${month}-01`, `${month}-31`);
    const holidays = await all("SELECT name, date FROM holidays WHERE date >= ? AND date <= ?", `${month}-01`, `${month}-31`);
    return NextResponse.json({ month, rows, holidays });
  }

  if (type === "payslips") {
    const slips = await all("SELECT * FROM payslips WHERE employee_id = ? ORDER BY year DESC, month DESC LIMIT 36", empId);
    return NextResponse.json({ slips });
  }

  if (type === "work") {
    const timesheets = await all(
      `SELECT t.*, r.name AS reviewer_name FROM timesheets t
       LEFT JOIN employees r ON r.id = t.reviewed_by
       WHERE t.employee_id = ? ORDER BY t.date DESC LIMIT 60`,
      empId
    );
    const claims = await all(
      `SELECT c.*, r.name AS reviewer_name FROM reimbursements c
       LEFT JOIN employees r ON r.id = c.reviewed_by
       WHERE c.employee_id = ? ORDER BY c.created_at DESC LIMIT 60`,
      empId
    );
    return NextResponse.json({ timesheets, claims });
  }

  return bad("Unknown dataset type");
}

/** Management actions: adjust_balance, grant_leave, set_attendance, clear_attendance. */
export async function POST(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const empId = Number(id);
  const body = await req.json().catch(() => ({}));

  const { err, target } = await guardTarget(me.role, empId);
  if (err) return err;

  /* ---- Adjust leave balance ---- */
  if (body.action === "adjust_balance") {
    const typeId = Number(body.leave_type_id);
    const allocated = Number(body.allocated);
    const used = Number(body.used);
    if (!typeId || isNaN(allocated) || isNaN(used) || allocated < 0 || used < 0) {
      return bad("Allocated and used must be non-negative numbers");
    }
    const type = await get("SELECT id FROM leave_types WHERE id = ?", typeId);
    if (!type) return bad("Unknown leave type");
    await run(
      `INSERT INTO leave_balances (employee_id, leave_type_id, allocated, used) VALUES (?, ?, ?, ?)
       ON CONFLICT(employee_id, leave_type_id) DO UPDATE SET allocated = excluded.allocated, used = excluded.used`,
      empId, typeId, allocated, used
    );
    return NextResponse.json({ ok: true });
  }

  /* ---- Grant leave on the employee's behalf (auto-approved) ---- */
  if (body.action === "grant_leave") {
    const { leave_type_id, from_date, to_date, reason } = body;
    if (!leave_type_id || !from_date || !to_date || !reason) return bad("Leave type, dates and reason are required");
    if (to_date < from_date) return bad("'To' date can't be before 'From' date");
    const type = await get<{ id: number; name: string; paid: number }>("SELECT * FROM leave_types WHERE id = ?", Number(leave_type_id));
    if (!type) return bad("Unknown leave type");

    const holidays = (await all<{ date: string }>("SELECT date FROM holidays")).map((h) => h.date);
    const days = workingDays(from_date, to_date, holidays);
    if (days <= 0) return bad("Selected range has no working days");

    const overlap = (await get<{ c: number }>(
      "SELECT COUNT(*) c FROM leave_requests WHERE employee_id = ? AND status IN ('Pending','Approved') AND NOT (to_date < ? OR from_date > ?)",
      empId, from_date, to_date
    ))!;
    if (overlap.c > 0) return bad("An existing leave request overlaps these dates");

    if (type.paid) {
      const bal = await get<{ balance: number }>("SELECT allocated - used AS balance FROM leave_balances WHERE employee_id = ? AND leave_type_id = ?", empId, type.id);
      if (!bal || bal.balance < days) return bad(`Insufficient ${type.name} balance (${bal?.balance ?? 0} left) — adjust the balance first`);
    }

    const holidaySet = new Set(holidays);
    await tx(async (q) => {
      await q.run(
        `INSERT INTO leave_requests (employee_id, leave_type_id, from_date, to_date, days, half, reason, responsible_id,
           status, reviewed_by, reviewed_at, review_note)
         VALUES (?, ?, ?, ?, ?, 'none', ?, NULL, 'Approved', ?, datetime('now'), ?)`,
        empId, type.id, from_date, to_date, days, String(reason).trim(), me.id, `Granted by ${me.name} (${me.role})`
      );
      await q.run("UPDATE leave_balances SET used = used + ? WHERE employee_id = ? AND leave_type_id = ?", days, empId, type.id);
      for (let c = from_date as string; c <= to_date; c = addDays(c, 1)) {
        if (isWeekend(c) || holidaySet.has(c)) continue;
        await q.run("INSERT OR REPLACE INTO attendance (employee_id, date, check_in, check_out, hours, status, mode) VALUES (?, ?, NULL, NULL, NULL, 'Leave', NULL)", empId, c);
      }
    });
    return NextResponse.json({ ok: true, days });
  }

  /* ---- Encash unused leave → creates an earning pay component + reduces the balance ---- */
  if (body.action === "encash_leave") {
    const typeId = Number(body.leave_type_id);
    const days = Number(body.days);
    if (!typeId || isNaN(days) || days <= 0) return bad("Pick a leave type and a positive number of days");
    const type = await get<{ id: number; name: string; encashable: number }>("SELECT id, name, encashable FROM leave_types WHERE id = ?", typeId);
    if (!type) return bad("Unknown leave type");
    if (!type.encashable) return bad(`${type.name} is not marked encashable (enable it in Org Settings)`);
    const bal = await get<{ balance: number }>("SELECT allocated - used AS balance FROM leave_balances WHERE employee_id = ? AND leave_type_id = ?", empId, typeId);
    if (!bal || bal.balance < days) return bad(`Only ${bal?.balance ?? 0} day(s) available to encash`);
    const emp = (await get<{ basic: number; hra: number; special_allowance: number; conveyance: number }>(
      "SELECT basic, hra, special_allowance, conveyance FROM employees WHERE id = ?", empId))!;
    const gross = emp.basic + emp.hra + emp.special_allowance + emp.conveyance;
    const amount = Math.round((gross / 30) * days);
    await tx(async (q) => {
      await q.run("UPDATE leave_balances SET used = used + ? WHERE employee_id = ? AND leave_type_id = ?", days, empId, typeId);
      await q.run(
        "INSERT INTO salary_components (employee_id, name, type, amount, active) VALUES (?, ?, 'earning', ?, 1)",
        empId, `Leave encashment — ${days} day${days === 1 ? "" : "s"} (${type.name})`, amount
      );
    });
    return NextResponse.json({ ok: true, amount });
  }

  /* ---- Override / add an attendance day ---- */
  if (body.action === "set_attendance") {
    const { date, status } = body;
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("A valid date is required");
    if (!["Present", "Half Day", "On Duty", "Absent", "Leave", "Holiday"].includes(status)) return bad("Invalid status");

    const timed = status === "Present" || status === "Half Day";
    const check_in = timed && body.check_in ? String(body.check_in) : null;
    const check_out = timed && body.check_out ? String(body.check_out) : null;
    let hours: number | null = null;
    if (check_in && check_out) {
      const [ih, im] = check_in.split(":").map(Number);
      const [oh, om] = check_out.split(":").map(Number);
      hours = Math.max(0, Math.round(((oh * 60 + om - ih * 60 - im) / 60) * 100) / 100);
    }
    await run(
      `INSERT INTO attendance (employee_id, date, check_in, check_out, hours, status, mode) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(employee_id, date) DO UPDATE SET check_in = excluded.check_in, check_out = excluded.check_out,
         hours = excluded.hours, status = excluded.status, mode = excluded.mode`,
      empId, date, check_in, check_out, hours, status, timed ? (body.mode === "WFH" ? "WFH" : "WFO") : null
    );
    return NextResponse.json({ ok: true });
  }

  /* ---- Remove an attendance record ---- */
  if (body.action === "clear_attendance") {
    if (!body.date) return bad("Date is required");
    await run("DELETE FROM attendance WHERE employee_id = ? AND date = ?", empId, body.date);
    return NextResponse.json({ ok: true });
  }

  void target;
  return forbidden();
}
