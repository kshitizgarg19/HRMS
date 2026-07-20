import { NextRequest, NextResponse  } from "next/server";
import { get, all } from "@/lib/db";
import { requireAuth, isErr } from "@/lib/auth";
import { todayStr, addDays, isWeekend, workingDays } from "@/lib/format";
import { grossOf } from "@/lib/payroll";

/** Days until the next occurrence of a month-day (dob/join_date), 0..window or null. */
function daysUntil(md: string | null, today: string, window: number): number | null {
  if (!md || md.length < 10) return null;
  const [, m, d] = md.split("-");
  const year = Number(today.slice(0, 4));
  for (const y of [year, year + 1]) {
    const candidate = `${y}-${m}-${d}`;
    if (candidate >= today) {
      const diff = Math.round((new Date(candidate + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime()) / 86400000);
      return diff <= window ? diff : null;
    }
  }
  return null;
}

export async function GET(req: NextRequest) {
  const me = await requireAuth(req);
  if (isErr(me)) return me;
  const today = todayStr();
  const monthStart = today.slice(0, 8) + "01";
  const year = Number(today.slice(0, 4));

  // Holidays first — a few later calculations depend on the list.
  const holidayDates = (await all<{ date: string }>("SELECT date FROM holidays")).map((h) => h.date);
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(today, -(6 - i))); // last 7 days, oldest→newest

  // Everyone's widgets + personal stats — one parallel batch, and the per-day "week" loop
  // collapsed into a single grouped query (7 round-trips → 1).
  const [
    announcements, upcomingHolidays, people, onLeaveToday, checkin, myAtt, balances,
    pending, latestSlip, openTasksRow, weekRows,
  ] = await Promise.all([
    all(`SELECT a.id, a.title, a.body, a.pinned, a.created_at, e.name AS author_name
         FROM announcements a JOIN employees e ON e.id = a.created_by
         ORDER BY a.pinned DESC, a.created_at DESC LIMIT 3`),
    all("SELECT id, name, date, type FROM holidays WHERE date >= ? ORDER BY date LIMIT 3", today),
    all<{ id: number; name: string; dob: string | null; join_date: string | null; department: string | null; designation: string | null; avatar_color: string | null }>(
      "SELECT id, name, dob, join_date, department, designation, avatar_color FROM employees WHERE status != 'Exited'"),
    all(`SELECT e.id, e.name, e.department, e.avatar_color, lt.name AS leave_type, lr.from_date, lr.to_date
         FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id JOIN leave_types lt ON lt.id = lr.leave_type_id
         WHERE lr.status = 'Approved' AND lr.from_date <= ? AND lr.to_date >= ?`, today, today),
    get<{ check_in: string | null; check_out: string | null; hours: number | null; status: string; mode: string | null }>(
      "SELECT check_in, check_out, hours, status, mode FROM attendance WHERE employee_id = ? AND date = ?", me.id, today),
    get<{ present: number | null; leave: number | null; avg_hours: number | null }>(
      `SELECT SUM(CASE WHEN status IN ('Present','Half Day','On Duty') THEN 1 ELSE 0 END) AS present,
              SUM(CASE WHEN status = 'Leave' THEN 1 ELSE 0 END) AS leave,
              AVG(CASE WHEN hours IS NOT NULL THEN hours END) AS avg_hours
       FROM attendance WHERE employee_id = ? AND date >= ? AND date <= ?`, me.id, monthStart, today),
    all<{ balance: number; paid: number }>(
      `SELECT lb.allocated - lb.used AS balance, lt.paid FROM leave_balances lb
       JOIN leave_types lt ON lt.id = lb.leave_type_id WHERE lb.employee_id = ?`, me.id),
    get<{ l: number; r: number; t: number; d: number }>(
      `SELECT (SELECT COUNT(*) FROM leave_requests WHERE employee_id=? AND status='Pending') l,
              (SELECT COUNT(*) FROM reimbursements WHERE employee_id=? AND status='Pending') r,
              (SELECT COUNT(*) FROM timesheets WHERE employee_id=? AND status='Pending') t,
              (SELECT COUNT(*) FROM duty_requests WHERE employee_id=? AND status='Pending') d`, me.id, me.id, me.id, me.id),
    get("SELECT id, month, year, net FROM payslips WHERE employee_id = ? ORDER BY year DESC, month DESC LIMIT 1", me.id),
    get<{ c: number }>("SELECT COUNT(*) c FROM tasks WHERE assigned_to = ? AND status != 'Done'", me.id),
    all<{ date: string; hours: number | null }>("SELECT date, hours FROM attendance WHERE employee_id = ? AND date >= ? AND date <= ?", me.id, weekDates[0], today),
  ]);

  const workingSoFar = workingDays(monthStart, today, holidayDates);
  const leaveBalance = balances.filter((b) => b.paid).reduce((s, b) => s + b.balance, 0);
  const myPending = (pending?.l ?? 0) + (pending?.r ?? 0) + (pending?.t ?? 0) + (pending?.d ?? 0);
  const weekMap = new Map(weekRows.map((w) => [w.date, w.hours || 0]));
  const weekHours = weekDates.map((d) => ({ date: d, hours: weekMap.get(d) || 0 }));

  const birthdays = people
    .map((p) => ({ ...p, in_days: daysUntil(p.dob, today, 35), date: p.dob }))
    .filter((p) => p.in_days !== null).sort((a, b) => a.in_days! - b.in_days!).slice(0, 5);
  const anniversaries = people
    .map((p) => ({ ...p, in_days: daysUntil(p.join_date, today, 35), years: p.join_date ? year - Number(p.join_date.slice(0, 4)) : 0, date: p.join_date }))
    .filter((p) => p.in_days !== null && p.years > 0).sort((a, b) => a.in_days! - b.in_days!).slice(0, 5);

  const mine = {
    attendancePct: workingSoFar ? Math.round(((myAtt?.present || 0) / workingSoFar) * 100) : 0,
    presentDays: myAtt?.present || 0,
    workingSoFar,
    avgHours: myAtt?.avg_hours ? Math.round(myAtt.avg_hours * 10) / 10 : 0,
    leaveBalance, myPending, latestSlip,
    openTasks: openTasksRow?.c ?? 0,
    weekHours,
  };

  /* ---------- org stats (HR / ADMIN) ---------- */
  let org = null;
  if (me.role === "HR" || me.role === "ADMIN") {
    const curMonth = Number(today.slice(5, 7));
    // last 10 working days (computed in JS, then queried in parallel)
    const trendDates: string[] = [];
    let cursor = today;
    while (trendDates.length < 10) {
      if (!isWeekend(cursor) && !holidayDates.includes(cursor)) trendDates.unshift(cursor);
      cursor = addDays(cursor, -1);
    }

    const [counts, slipAgg, actives, deptHeadcount, leaveDist, payoutHistory, recentActivity, newJoiners, trendRows] = await Promise.all([
      get<{ hc: number; pl: number; pt: number; pr: number; pd: number }>(
        `SELECT (SELECT COUNT(*) FROM employees WHERE status != 'Exited') hc,
                (SELECT COUNT(*) FROM leave_requests WHERE status='Pending') pl,
                (SELECT COUNT(*) FROM timesheets WHERE status='Pending') pt,
                (SELECT COUNT(*) FROM reimbursements WHERE status='Pending') pr,
                (SELECT COUNT(*) FROM duty_requests WHERE status='Pending') pd`),
      get<{ c: number; net: number }>("SELECT COUNT(*) c, COALESCE(SUM(net),0) net FROM payslips WHERE month = ? AND year = ?", curMonth, year),
      all<{ basic: number; hra: number; special_allowance: number; conveyance: number }>("SELECT basic, hra, special_allowance, conveyance FROM employees WHERE status = 'Active'"),
      all("SELECT COALESCE(department,'Other') label, COUNT(*) value FROM employees WHERE status != 'Exited' GROUP BY department ORDER BY value DESC"),
      all(`SELECT lt.name label, COALESCE(SUM(lr.days),0) value FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id
           WHERE lr.status = 'Approved' AND lr.from_date >= ? GROUP BY lt.name HAVING value > 0`, `${year}-01-01`),
      all("SELECT month, year, SUM(net) total FROM payslips GROUP BY year, month ORDER BY year DESC, month DESC LIMIT 4"),
      all(`SELECT * FROM (
             SELECT 'leave' kind, lr.id, e.name, e.avatar_color, lt.name detail, lr.status, lr.created_at
             FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id JOIN leave_types lt ON lt.id = lr.leave_type_id
             UNION ALL
             SELECT 'reimbursement' kind, r.id, e.name, e.avatar_color, r.category || ' · ₹' || CAST(CAST(r.amount AS INTEGER) AS TEXT) detail, r.status, r.created_at
             FROM reimbursements r JOIN employees e ON e.id = r.employee_id
             UNION ALL
             SELECT 'timesheet' kind, t.id, e.name, e.avatar_color, 'a ' || CAST(t.hours AS TEXT) || 'h timesheet' detail, t.status, t.created_at
             FROM timesheets t JOIN employees e ON e.id = t.employee_id
           ) ORDER BY created_at DESC LIMIT 8`),
      all("SELECT id, name, designation, department, join_date, avatar_color FROM employees WHERE status != 'Exited' AND join_date >= ? ORDER BY join_date DESC LIMIT 4", addDays(today, -90)),
      all<{ date: string; c: number }>("SELECT date, COUNT(*) c FROM attendance WHERE date >= ? AND date <= ? AND status IN ('Present','Half Day','On Duty') GROUP BY date", trendDates[0], today),
    ]);

    const hc = counts?.hc ?? 0;
    const trendMap = new Map(trendRows.map((r) => [r.date, r.c]));
    const trend = trendDates.map((d) => ({ date: d, pct: hc ? Math.round(((trendMap.get(d) ?? 0) / hc) * 100) : 0 }));
    const estimatedPayout = actives.reduce((s, e) => s + grossOf(e), 0);

    org = {
      headcount: hc,
      onLeaveCount: (onLeaveToday as unknown[]).length,
      pending: { leaves: counts?.pl ?? 0, timesheets: counts?.pt ?? 0, reimbursements: counts?.pr ?? 0, duty: counts?.pd ?? 0, total: (counts?.pl ?? 0) + (counts?.pt ?? 0) + (counts?.pr ?? 0) + (counts?.pd ?? 0) },
      payroll: { generated: (slipAgg?.c ?? 0) > 0, count: slipAgg?.c ?? 0, netTotal: slipAgg?.net ?? 0, estimated: estimatedPayout, month: curMonth, year },
      trend, deptHeadcount, leaveDist, payoutHistory, recentActivity, newJoiners,
    };
  }

  return NextResponse.json({
    today, me, checkin: checkin || null, announcements, upcomingHolidays,
    birthdays, anniversaries, onLeaveToday, mine, org,
  });
}
