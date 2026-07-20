import { NextRequest, NextResponse } from "next/server";
import { get, all, run } from "@/lib/db";
import { requireAuth, isErr, bad, forbidden } from "@/lib/auth";
import { workingDays } from "@/lib/format";
import { approvalPolicy, hodDepartments } from "@/lib/policy";

/**
 * On-Duty (Official Duty) requests — when an employee works away from the office
 * (client meeting, site visit, conference). On approval the days are written into
 * attendance as "On Duty" and count as present (no leave deducted).
 * Reviewed by whoever the org's *leave* approver policy designates.
 */
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
    where.push("d.employee_id = ?");
    params.push(me.id);
  }
  if (hodScope?.length) {
    where.push(`e.department IN (${hodScope.map(() => "?").join(",")})`);
    params.push(...hodScope);
  }
  if (sp.get("status")) {
    where.push("d.status = ?");
    params.push(sp.get("status"));
  }

  const requests = await all(
    `SELECT d.*, e.name AS employee_name, e.emp_code, e.department, e.avatar_color, rev.name AS reviewer_name
     FROM duty_requests d
     JOIN employees e ON e.id = d.employee_id
     LEFT JOIN employees rev ON rev.id = d.reviewed_by
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY d.created_at DESC LIMIT 200`,
    ...params
  );

  return NextResponse.json({ requests });
}

export async function POST(req: NextRequest) {
  const me = await requireAuth(req);
  if (isErr(me)) return me;
  const { from_date, to_date, slot, location, purpose } = await req.json().catch(() => ({}));
  if (!from_date || !to_date || !location || !purpose) return bad("Dates, location and purpose are required");
  if (to_date < from_date) return bad("'To' date can't be before 'From' date");

  const holidays = (await all<{ date: string }>("SELECT date FROM holidays")).map((h) => h.date);
  let days = workingDays(from_date, to_date, holidays);
  const isHalf = slot === "first" || slot === "second";
  if (isHalf) {
    if (from_date !== to_date) return bad("Half-day on-duty applies only to a single day");
    if (days === 0) return bad("Selected day is a weekend/holiday");
    days = 0.5;
  }
  if (days <= 0) return bad("Selected range has no working days");

  // Can't be on duty over an existing duty or leave request for the same dates.
  const dutyOverlap = (await get<{ c: number }>(
    "SELECT COUNT(*) c FROM duty_requests WHERE employee_id = ? AND status IN ('Pending','Approved') AND NOT (to_date < ? OR from_date > ?)",
    me.id, from_date, to_date
  ))!;
  if (dutyOverlap.c > 0) return bad("You already have an on-duty request overlapping these dates");
  const leaveOverlap = (await get<{ c: number }>(
    "SELECT COUNT(*) c FROM leave_requests WHERE employee_id = ? AND status IN ('Pending','Approved') AND NOT (to_date < ? OR from_date > ?)",
    me.id, from_date, to_date
  ))!;
  if (leaveOverlap.c > 0) return bad("You have a leave request overlapping these dates");

  const info = await run(
    "INSERT INTO duty_requests (employee_id, from_date, to_date, days, slot, location, purpose) VALUES (?, ?, ?, ?, ?, ?, ?)",
    me.id, from_date, to_date, days, isHalf ? slot : "full", String(location).trim(), String(purpose).trim()
  );
  return NextResponse.json({ ok: true, id: info.lastInsertRowid, days });
}
