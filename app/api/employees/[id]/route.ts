import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { get, all, run, tx } from "@/lib/db";
import { requireAuth, isErr, bad, forbidden } from "@/lib/auth";
import { todayStr, workingDays } from "@/lib/format";

type Ctx = { params: Promise<{ id: string }> };

const ADMIN_EDITABLE = [
  "name", "email", "role", "designation", "department", "manager_id",
  "join_date", "dob", "gender", "blood_group", "marital_status",
  "phone", "alt_phone", "address", "city", "state", "pincode",
  "emergency_name", "emergency_phone", "emergency_relation",
  "work_location", "employment_type", "status",
  "bank_name", "account_no", "ifsc", "pan", "uan",
  "basic", "hra", "special_allowance", "conveyance",
] as const;

export async function GET(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth();
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const empId = Number(id);
  if (me.role === "EMPLOYEE" && me.id !== empId) return forbidden();

  const row = await get<Record<string, unknown>>(
    `SELECT e.*, m.name AS manager_name FROM employees e
     LEFT JOIN employees m ON m.id = e.manager_id WHERE e.id = ?`,
    empId
  );
  if (!row) return bad("Employee not found", 404);
  delete row.password_hash;

  const balances = await all(
    `SELECT lb.leave_type_id, lt.name AS leave_type, lt.paid, lb.allocated, lb.used, lb.allocated - lb.used AS balance
     FROM leave_balances lb JOIN leave_types lt ON lt.id = lb.leave_type_id WHERE lb.employee_id = ?`,
    empId
  );

  const today = todayStr();
  const monthStart = today.slice(0, 8) + "01";
  const holidays = (await all<{ date: string }>("SELECT date FROM holidays")).map((h) => h.date);
  const att = (await get<{ present: number | null }>(
    "SELECT SUM(CASE WHEN status IN ('Present','Half Day') THEN 1 ELSE 0 END) present FROM attendance WHERE employee_id = ? AND date >= ? AND date <= ?",
    empId, monthStart, today
  ))!;
  const working = workingDays(monthStart, today, holidays);

  const stats = {
    attendancePct: working ? Math.round(((att.present || 0) / working) * 100) : 0,
    pendingLeaves: (await get<{ c: number }>("SELECT COUNT(*) c FROM leave_requests WHERE employee_id = ? AND status = 'Pending'", empId))!.c,
    openTasks: (await get<{ c: number }>("SELECT COUNT(*) c FROM tasks WHERE assigned_to = ? AND status != 'Done'", empId))!.c,
    payslips: (await get<{ c: number }>("SELECT COUNT(*) c FROM payslips WHERE employee_id = ?", empId))!.c,
  };

  const managers = await all("SELECT id, name FROM employees WHERE status = 'Active' AND id != ? ORDER BY name", empId);
  const departments = (await all<{ name: string }>("SELECT name FROM departments ORDER BY name")).map((d) => d.name);

  return NextResponse.json({ employee: row, balances, stats, managers, departments });
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const empId = Number(id);
  const body = await req.json().catch(() => ({}));

  const target = await get<{ id: number; role: string }>("SELECT id, role FROM employees WHERE id = ?", empId);
  if (!target) return bad("Employee not found", 404);

  // HR can edit everyone except Admin accounts; role changes and password resets stay Admin-only
  if (me.role === "HR" && target.role === "ADMIN") return bad("Admin accounts can only be edited by an Admin", 403);

  if (body.action === "reset_password") {
    if (me.role !== "ADMIN") return bad("Only an Admin can reset passwords", 403);
    const pwd = String(body.password || "");
    if (pwd.length < 6) return bad("Password must be at least 6 characters");
    await run("UPDATE employees SET password_hash = ? WHERE id = ?", bcrypt.hashSync(pwd, 10), empId);
    return NextResponse.json({ ok: true });
  }

  if (me.role === "HR" && "role" in body && body.role !== target.role) {
    return bad("Only an Admin can change platform roles", 403);
  }
  if (body.role && empId === me.id && body.role !== "ADMIN" && me.role === "ADMIN") {
    return bad("You can't remove your own admin access");
  }
  if (body.email) {
    const dupe = await get("SELECT id FROM employees WHERE lower(email) = lower(?) AND id != ?", String(body.email).trim(), empId);
    if (dupe) return bad("That email is already in use");
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  for (const key of ADMIN_EDITABLE) {
    if (key in body) {
      updates.push(`${key} = ?`);
      const v = body[key];
      values.push(v === "" ? null : ["basic", "hra", "special_allowance", "conveyance"].includes(key) ? Number(v) || 0 : v);
    }
  }
  if (!updates.length) return bad("Nothing to update");
  values.push(empId);
  await run(`UPDATE employees SET ${updates.join(", ")} WHERE id = ?`, ...values);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(["ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const empId = Number(id);
  if (empId === me.id) return bad("You can't delete your own account");

  const target = await get("SELECT id FROM employees WHERE id = ?", empId);
  if (!target) return bad("Employee not found", 404);

  await tx(async (q) => {
    for (const table of ["attendance", "timesheets", "leave_requests", "leave_balances", "reimbursements", "payslips"]) {
      await q.run(`DELETE FROM ${table} WHERE employee_id = ?`, empId);
    }
    await q.run("DELETE FROM tasks WHERE assigned_to = ?", empId);
    await q.run("UPDATE tasks SET assigned_by = 1 WHERE assigned_by = ?", empId);
    await q.run("UPDATE employees SET manager_id = NULL WHERE manager_id = ?", empId);
    await q.run("UPDATE announcements SET created_by = 1 WHERE created_by = ?", empId);
    await q.run("DELETE FROM employees WHERE id = ?", empId);
  });
  return NextResponse.json({ ok: true });
}
