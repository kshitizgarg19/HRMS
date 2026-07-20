import { NextRequest, NextResponse } from "next/server";
import { get, all, run } from "@/lib/db";
import { requireAuth, isErr, bad, forbidden } from "@/lib/auth";
import { workingDays } from "@/lib/format";
import { approvalPolicy, hodDepartments } from "@/lib/policy";

export async function GET(req: NextRequest) {
  const me = await requireAuth(req);
  if (isErr(me)) return me;
  const sp = req.nextUrl.searchParams;
  const showAll = sp.get("all") === "1";
  let hodScope: string[] | null = null;
  if (showAll && me.role === "EMPLOYEE") {
    hodScope = (await approvalPolicy("leaves")) === "HOD" ? await hodDepartments(me.id) : [];
    if (!hodScope.length) return forbidden();
  }

  const where: string[] = [];
  const params: unknown[] = [];
  if (!showAll) {
    where.push("lr.employee_id = ?");
    params.push(me.id);
  }
  if (hodScope?.length) {
    where.push(`e.department IN (${hodScope.map(() => "?").join(",")})`);
    params.push(...hodScope);
  }
  if (sp.get("status")) {
    where.push("lr.status = ?");
    params.push(sp.get("status"));
  }

  // types, balances, requests, colleagues are independent — fetch in parallel.
  const [types, balances, requests, colleagues] = await Promise.all([
    all("SELECT * FROM leave_types ORDER BY id"),
    all(`SELECT lb.leave_type_id, lt.name AS leave_type, lt.paid, lb.allocated, lb.used, lb.allocated - lb.used AS balance
         FROM leave_balances lb JOIN leave_types lt ON lt.id = lb.leave_type_id
         WHERE lb.employee_id = ? ORDER BY lb.leave_type_id`, me.id),
    all(`SELECT lr.*, lt.name AS leave_type, e.name AS employee_name, e.emp_code, e.department, e.avatar_color,
            resp.name AS responsible_name, rev.name AS reviewer_name
         FROM leave_requests lr
         JOIN leave_types lt ON lt.id = lr.leave_type_id
         JOIN employees e ON e.id = lr.employee_id
         LEFT JOIN employees resp ON resp.id = lr.responsible_id
         LEFT JOIN employees rev ON rev.id = lr.reviewed_by
         ${where.length ? "WHERE " + where.join(" AND ") : ""}
         ORDER BY lr.created_at DESC LIMIT 200`, ...params),
    all("SELECT id, name FROM employees WHERE status = 'Active' AND id != ? ORDER BY name", me.id),
  ]);

  return NextResponse.json({ types, balances, requests, colleagues });
}

export async function POST(req: NextRequest) {
  const me = await requireAuth(req);
  if (isErr(me)) return me;
  const { leave_type_id, from_date, to_date, half, reason, responsible_id } = await req.json().catch(() => ({}));
  if (!leave_type_id || !from_date || !to_date || !reason) return bad("Leave type, dates and reason are required");
  if (to_date < from_date) return bad("'To' date can't be before 'From' date");

  const type = await get<{ id: number; name: string; paid: number }>("SELECT * FROM leave_types WHERE id = ?", Number(leave_type_id));
  if (!type) return bad("Unknown leave type");

  const holidays = (await all<{ date: string }>("SELECT date FROM holidays")).map((h) => h.date);
  let days = workingDays(from_date, to_date, holidays);
  const isHalf = half === "first" || half === "second";
  if (isHalf) {
    if (from_date !== to_date) return bad("Half-day applies only to single-day leave");
    if (days === 0) return bad("Selected day is a weekend/holiday");
    days = 0.5;
  }
  if (days <= 0) return bad("Selected range has no working days");

  const overlap = (await get<{ c: number }>(
    `SELECT COUNT(*) c FROM leave_requests
     WHERE employee_id = ? AND status IN ('Pending','Approved') AND NOT (to_date < ? OR from_date > ?)`,
    me.id, from_date, to_date
  ))!;
  if (overlap.c > 0) return bad("You already have a leave request overlapping these dates");

  if (type.paid) {
    const bal = await get<{ balance: number }>("SELECT allocated - used AS balance FROM leave_balances WHERE employee_id = ? AND leave_type_id = ?", me.id, type.id);
    if (!bal || bal.balance < days) return bad(`Insufficient ${type.name} balance (${bal?.balance ?? 0} day(s) left)`);
  }

  const info = await run(
    `INSERT INTO leave_requests (employee_id, leave_type_id, from_date, to_date, days, half, reason, responsible_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    me.id, type.id, from_date, to_date, days, isHalf ? half : "none", String(reason).trim(), responsible_id || null
  );
  return NextResponse.json({ ok: true, id: info.lastInsertRowid, days });
}
