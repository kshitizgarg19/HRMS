import { NextRequest, NextResponse } from "next/server";
import { get, all, run } from "@/lib/db";
import { requireAuth, isErr, bad, forbidden } from "@/lib/auth";
import { todayStr, nowTime, workingDays } from "@/lib/format";

export async function GET(req: NextRequest) {
  const me = await requireAuth();
  if (isErr(me)) return me;
  const sp = req.nextUrl.searchParams;
  const view = sp.get("view");
  const today = todayStr();

  if (view === "team") {
    if (me.role === "EMPLOYEE") return forbidden();
    const date = sp.get("date") || today;
    const monthStart = date.slice(0, 8) + "01";
    const holidays = (await all<{ date: string }>("SELECT date FROM holidays")).map((h) => h.date);
    const working = workingDays(monthStart, date <= today ? date : today, holidays);
    const rows = await all(
      `SELECT e.id, e.name, e.emp_code, e.department, e.designation, e.avatar_color,
              a.check_in, a.check_out, a.hours, a.status, a.mode,
              (SELECT COUNT(*) FROM attendance x WHERE x.employee_id = e.id AND x.date >= ? AND x.date <= ? AND x.status IN ('Present','Half Day')) AS present_month
       FROM employees e
       LEFT JOIN attendance a ON a.employee_id = e.id AND a.date = ?
       WHERE e.status != 'Exited'
       ORDER BY e.name`,
      monthStart, date, date
    );
    return NextResponse.json({ date, working, team: rows });
  }

  // own month view
  const month = sp.get("month") || today.slice(0, 7); // YYYY-MM
  const start = `${month}-01`;
  const end = `${month}-31`;
  const rows = await all("SELECT * FROM attendance WHERE employee_id = ? AND date >= ? AND date <= ? ORDER BY date DESC", me.id, start, end);
  const holidays = await all("SELECT name, date FROM holidays WHERE date >= ? AND date <= ?", start, end);
  return NextResponse.json({ month, rows, holidays });
}

export async function POST(req: NextRequest) {
  const me = await requireAuth();
  if (isErr(me)) return me;
  const { action, mode } = await req.json().catch(() => ({}));
  const today = todayStr();
  const existing = await get<{ id: number; check_in: string | null; check_out: string | null; status: string }>(
    "SELECT * FROM attendance WHERE employee_id = ? AND date = ?",
    me.id, today
  );

  if (action === "in") {
    if (existing?.check_in) return bad("You have already checked in today");
    if (existing?.status === "Leave") return bad("You are on approved leave today");
    const t = nowTime();
    if (existing) {
      await run("UPDATE attendance SET check_in = ?, status = 'Present', mode = ? WHERE id = ?", t, mode === "WFH" ? "WFH" : "WFO", existing.id);
    } else {
      await run("INSERT INTO attendance (employee_id, date, check_in, status, mode) VALUES (?, ?, ?, 'Present', ?)", me.id, today, t, mode === "WFH" ? "WFH" : "WFO");
    }
    return NextResponse.json({ ok: true, check_in: t });
  }

  if (action === "out") {
    if (!existing?.check_in) return bad("Check in first before checking out");
    if (existing.check_out) return bad("You have already checked out today");
    const t = nowTime();
    const [ih, im] = existing.check_in.split(":").map(Number);
    const [oh, om] = t.split(":").map(Number);
    const hours = Math.max(0, Math.round(((oh * 60 + om - ih * 60 - im) / 60) * 100) / 100);
    await run("UPDATE attendance SET check_out = ?, hours = ?, status = ? WHERE id = ?", t, hours, hours < 4 ? "Half Day" : "Present", existing.id);
    return NextResponse.json({ ok: true, check_out: t, hours });
  }

  return bad("Unknown action");
}
