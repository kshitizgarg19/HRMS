import { NextRequest, NextResponse } from "next/server";
import { all as sqlAll, run } from "@/lib/db";
import { requireAuth, isErr, bad, forbidden } from "@/lib/auth";
import { approvalPolicy, hodDepartments } from "@/lib/policy";

export async function GET(req: NextRequest) {
  const me = await requireAuth();
  if (isErr(me)) return me;
  const sp = req.nextUrl.searchParams;
  const all = sp.get("all") === "1";
  if (all && me.role === "EMPLOYEE") {
    const scope = (await approvalPolicy("claims")) === "HOD" ? await hodDepartments(me.id) : [];
    if (!scope.length) return forbidden();
    const where0 = `e.department IN (${scope.map(() => "?").join(",")})`;
    const rows = await sqlAll(
      `SELECT r.*, e.name AS employee_name, e.emp_code, e.department, e.avatar_color, rev.name AS reviewer_name
       FROM reimbursements r
       JOIN employees e ON e.id = r.employee_id
       LEFT JOIN employees rev ON rev.id = r.reviewed_by
       WHERE ${where0} ${sp.get("status") ? "AND r.status = ?" : ""}
       ORDER BY r.created_at DESC LIMIT 200`,
      ...scope, ...(sp.get("status") ? [sp.get("status")] : [])
    );
    return NextResponse.json({ rows });
  }

  const where: string[] = [];
  const params: unknown[] = [];
  if (!all) {
    where.push("r.employee_id = ?");
    params.push(me.id);
  }
  if (sp.get("status")) {
    where.push("r.status = ?");
    params.push(sp.get("status"));
  }

  const rows = await sqlAll(
    `SELECT r.*, e.name AS employee_name, e.emp_code, e.department, e.avatar_color, rev.name AS reviewer_name
     FROM reimbursements r
     JOIN employees e ON e.id = r.employee_id
     LEFT JOIN employees rev ON rev.id = r.reviewed_by
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY r.created_at DESC LIMIT 200`,
    ...params
  );
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const me = await requireAuth();
  if (isErr(me)) return me;
  const { category, amount, expense_date, description, receipt } = await req.json().catch(() => ({}));
  if (!category || !amount || !expense_date || !description) return bad("Category, amount, date and description are required");
  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) return bad("Amount must be a positive number");
  if (amt > 500000) return bad("Claims above ₹5,00,000 need a manual process — contact finance");

  const info = await run(
    "INSERT INTO reimbursements (employee_id, category, amount, expense_date, description, receipt) VALUES (?, ?, ?, ?, ?, ?)",
    me.id, category, amt, expense_date, String(description).trim(), receipt || null
  );
  return NextResponse.json({ ok: true, id: info.lastInsertRowid });
}
