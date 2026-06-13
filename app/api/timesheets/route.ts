import { NextRequest, NextResponse } from "next/server";
import { all as sqlAll, run } from "@/lib/db";
import { requireAuth, isErr, bad, forbidden } from "@/lib/auth";
import { approvalPolicy, hodDepartments } from "@/lib/policy";

export async function GET(req: NextRequest) {
  const me = await requireAuth();
  if (isErr(me)) return me;
  const sp = req.nextUrl.searchParams;
  const all = sp.get("all") === "1";

  const where: string[] = [];
  const params: unknown[] = [];
  if (all && me.role === "EMPLOYEE") {
    // HODs may review their own department's timesheets when the policy allows it
    const scope = (await approvalPolicy("timesheets")) === "HOD" ? await hodDepartments(me.id) : [];
    if (!scope.length) return forbidden();
    where.push(`e.department IN (${scope.map(() => "?").join(",")})`);
    params.push(...scope);
  }
  if (!all) {
    where.push("t.employee_id = ?");
    params.push(me.id);
  }
  if (sp.get("status")) {
    where.push("t.status = ?");
    params.push(sp.get("status"));
  }

  const rows = await sqlAll(
    `SELECT t.*, e.name AS employee_name, e.emp_code, e.avatar_color, e.department, r.name AS reviewer_name
     FROM timesheets t
     JOIN employees e ON e.id = t.employee_id
     LEFT JOIN employees r ON r.id = t.reviewed_by
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY t.date DESC, t.id DESC LIMIT 200`,
    ...params
  );
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const me = await requireAuth();
  if (isErr(me)) return me;
  const { date, location, tasks, hours } = await req.json().catch(() => ({}));
  if (!date || !tasks || !hours) return bad("Date, task description and hours are required");
  const h = Number(hours);
  if (isNaN(h) || h <= 0 || h > 24) return bad("Hours must be between 0.5 and 24");

  const info = await run(
    "INSERT INTO timesheets (employee_id, date, location, tasks, hours) VALUES (?, ?, ?, ?, ?)",
    me.id, date, location || "Work From Office", String(tasks).trim(), h
  );
  return NextResponse.json({ ok: true, id: info.lastInsertRowid });
}
