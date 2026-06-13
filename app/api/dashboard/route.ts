import { NextResponse } from "next/server";
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

export async function GET() {
  const me = await requireAuth();
  if (isErr(me)) return me;
  const today = todayStr();
  const monthStart = today.slice(0, 8) + "01";
  const year = Number(today.slice(0, 4));

  const holidayRows = await all<{ date: string }>("SELECT date FROM holidays");
  const holidayDates = holidayRows.map((h) => h.date);

  /* ---------- shared widgets ---------- */
  const announcements = await all(
    `SELECT a.id, a.title, a.body, a.pinned, a.created_at, e.name AS author_name
     FROM announcements a JOIN employees e ON e.id = a.created_by
     ORDER BY a.pinned DESC, a.created_at DESC LIMIT 3`
  );

  const upcomingHolidays = await all("SELECT id, name, date, type FROM holidays WHERE date >= ? ORDER BY date LIMIT 3", today);

  const people = await all<{ id: number; name: string; dob: string | null; join_date: string | null; department: string | null; designation: string | null; avatar_color: string | null }>(
    "SELECT id, name, dob, join_date, department, designation, avatar_color FROM employees WHERE status != 'Exited'"
  );

  const birthdays = people
    .map((p) => ({ ...p, in_days: daysUntil(p.dob, today, 35), date: p.dob }))
    .filter((p) => p.in_days !== null)
    .sort((a, b) => (a.in_days! - b.in_days!))
    .slice(0, 5);

  const anniversaries = people
    .map((p) => {
      const in_days = daysUntil(p.join_date, today, 35);
      const years = p.join_date ? year - Number(p.join_date.slice(0, 4)) : 0;
      return { ...p, in_days, years, date: p.join_date };
    })
    .filter((p) => p.in_days !== null && p.years > 0)
    .sort((a, b) => a.in_days! - b.in_days!)
    .slice(0, 5);

  const onLeaveToday = await all(
    `SELECT e.id, e.name, e.department, e.avatar_color, lt.name AS leave_type, lr.from_date, lr.to_date
     FROM leave_requests lr
     JOIN employees e ON e.id = lr.employee_id
     JOIN leave_types lt ON lt.id = lr.leave_type_id
     WHERE lr.status = 'Approved' AND lr.from_date <= ? AND lr.to_date >= ?`,
    today, today
  );

  const checkin = await get<{ check_in: string | null; check_out: string | null; hours: number | null; status: string; mode: string | null }>(
    "SELECT check_in, check_out, hours, status, mode FROM attendance WHERE employee_id = ? AND date = ?",
    me.id, today
  );

  /* ---------- my stats (everyone) ---------- */
  const workingSoFar = workingDays(monthStart, today, holidayDates);
  const myAtt = (await get<{ present: number | null; leave: number | null; avg_hours: number | null }>(
    `SELECT
       SUM(CASE WHEN status IN ('Present','Half Day') THEN 1 ELSE 0 END) AS present,
       SUM(CASE WHEN status = 'Leave' THEN 1 ELSE 0 END) AS leave,
       AVG(CASE WHEN hours IS NOT NULL THEN hours END) AS avg_hours
     FROM attendance WHERE employee_id = ? AND date >= ? AND date <= ?`,
    me.id, monthStart, today
  ))!;

  const balances = await all<{ balance: number; paid: number }>(
    `SELECT lb.allocated - lb.used AS balance, lt.paid
     FROM leave_balances lb JOIN leave_types lt ON lt.id = lb.leave_type_id
     WHERE lb.employee_id = ?`,
    me.id
  );
  const leaveBalance = balances.filter((b) => b.paid).reduce((s, b) => s + b.balance, 0);

  const myPending =
    (await get<{ c: number }>("SELECT COUNT(*) c FROM leave_requests WHERE employee_id = ? AND status = 'Pending'", me.id))!.c +
    (await get<{ c: number }>("SELECT COUNT(*) c FROM reimbursements WHERE employee_id = ? AND status = 'Pending'", me.id))!.c +
    (await get<{ c: number }>("SELECT COUNT(*) c FROM timesheets WHERE employee_id = ? AND status = 'Pending'", me.id))!.c;

  const latestSlip = await get("SELECT id, month, year, net FROM payslips WHERE employee_id = ? ORDER BY year DESC, month DESC LIMIT 1", me.id);

  const openTasks = (await get<{ c: number }>("SELECT COUNT(*) c FROM tasks WHERE assigned_to = ? AND status != 'Done'", me.id))!.c;

  // hours over the last 7 calendar days (sparkline)
  const weekHours: { date: string; hours: number }[] = [];
  for (let off = 6; off >= 0; off--) {
    const d = addDays(today, -off);
    const row = await get<{ hours: number | null }>("SELECT hours FROM attendance WHERE employee_id = ? AND date = ?", me.id, d);
    weekHours.push({ date: d, hours: row?.hours || 0 });
  }

  const mine = {
    attendancePct: workingSoFar ? Math.round(((myAtt.present || 0) / workingSoFar) * 100) : 0,
    presentDays: myAtt.present || 0,
    workingSoFar,
    avgHours: myAtt.avg_hours ? Math.round(myAtt.avg_hours * 10) / 10 : 0,
    leaveBalance,
    myPending,
    latestSlip,
    openTasks,
    weekHours,
  };

  /* ---------- org stats (HR / ADMIN) ---------- */
  let org = null;
  if (me.role === "HR" || me.role === "ADMIN") {
    const headcount = (await get<{ c: number }>("SELECT COUNT(*) c FROM employees WHERE status != 'Exited'"))!;
    const pendingLeaves = (await get<{ c: number }>("SELECT COUNT(*) c FROM leave_requests WHERE status = 'Pending'"))!.c;
    const pendingTimesheets = (await get<{ c: number }>("SELECT COUNT(*) c FROM timesheets WHERE status = 'Pending'"))!.c;
    const pendingReimb = (await get<{ c: number }>("SELECT COUNT(*) c FROM reimbursements WHERE status = 'Pending'"))!.c;

    const curMonth = Number(today.slice(5, 7));
    const slipAgg = (await get<{ c: number; net: number }>("SELECT COUNT(*) c, COALESCE(SUM(net),0) net FROM payslips WHERE month = ? AND year = ?", curMonth, year))!;
    const actives = await all<{ basic: number; hra: number; special_allowance: number; conveyance: number }>(
      "SELECT basic, hra, special_allowance, conveyance FROM employees WHERE status = 'Active'"
    );
    const estimatedPayout = actives.reduce((s, e) => s + grossOf(e), 0);

    // attendance % over the last 10 working days
    const trend: { date: string; pct: number }[] = [];
    let cursor = today;
    while (trend.length < 10) {
      if (!isWeekend(cursor) && !holidayDates.includes(cursor)) {
        const present = (await get<{ c: number }>("SELECT COUNT(*) c FROM attendance WHERE date = ? AND status IN ('Present','Half Day')", cursor))!;
        trend.unshift({ date: cursor, pct: headcount.c ? Math.round((present.c / headcount.c) * 100) : 0 });
      }
      cursor = addDays(cursor, -1);
    }

    const deptHeadcount = await all(
      "SELECT COALESCE(department,'Other') label, COUNT(*) value FROM employees WHERE status != 'Exited' GROUP BY department ORDER BY value DESC"
    );

    const leaveDist = await all(
      `SELECT lt.name label, COALESCE(SUM(lr.days),0) value
       FROM leave_requests lr JOIN leave_types lt ON lt.id = lr.leave_type_id
       WHERE lr.status = 'Approved' AND lr.from_date >= ? GROUP BY lt.name HAVING value > 0`,
      `${year}-01-01`
    );

    const payoutHistory = await all("SELECT month, year, SUM(net) total FROM payslips GROUP BY year, month ORDER BY year DESC, month DESC LIMIT 4");

    const recentActivity = await all(
      `SELECT * FROM (
         SELECT 'leave' kind, lr.id, e.name, e.avatar_color, lt.name detail, lr.status, lr.created_at
         FROM leave_requests lr JOIN employees e ON e.id = lr.employee_id JOIN leave_types lt ON lt.id = lr.leave_type_id
         UNION ALL
         SELECT 'reimbursement' kind, r.id, e.name, e.avatar_color, r.category || ' · ₹' || CAST(CAST(r.amount AS INTEGER) AS TEXT) detail, r.status, r.created_at
         FROM reimbursements r JOIN employees e ON e.id = r.employee_id
         UNION ALL
         SELECT 'timesheet' kind, t.id, e.name, e.avatar_color, 'a ' || CAST(t.hours AS TEXT) || 'h timesheet' detail, t.status, t.created_at
         FROM timesheets t JOIN employees e ON e.id = t.employee_id
       ) ORDER BY created_at DESC LIMIT 8`
    );

    const newJoiners = await all(
      "SELECT id, name, designation, department, join_date, avatar_color FROM employees WHERE status != 'Exited' AND join_date >= ? ORDER BY join_date DESC LIMIT 4",
      addDays(today, -90)
    );

    org = {
      headcount: headcount.c,
      onLeaveCount: (onLeaveToday as unknown[]).length,
      pending: { leaves: pendingLeaves, timesheets: pendingTimesheets, reimbursements: pendingReimb, total: pendingLeaves + pendingTimesheets + pendingReimb },
      payroll: { generated: slipAgg.c > 0, count: slipAgg.c, netTotal: slipAgg.net, estimated: estimatedPayout, month: curMonth, year },
      trend,
      deptHeadcount,
      leaveDist,
      payoutHistory,
      recentActivity,
      newJoiners,
    };
  }

  return NextResponse.json({
    today,
    me,
    checkin: checkin || null,
    announcements,
    upcomingHolidays,
    birthdays,
    anniversaries,
    onLeaveToday,
    mine,
    org,
  });
}
