import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { get, all, run } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";
import { colorFor } from "@/lib/format";

const PUBLIC_FIELDS = "e.id, e.emp_code, e.name, e.designation, e.department, e.email, e.phone, e.city, e.work_location, e.join_date, e.status, e.avatar_color";

export async function GET(req: NextRequest) {
  const me = await requireAuth();
  if (isErr(me)) return me;
  const sp = req.nextUrl.searchParams;
  const q = (sp.get("q") || "").trim();
  const dept = sp.get("department") || "";
  const status = sp.get("status") || "";

  const full = me.role !== "EMPLOYEE";
  const where: string[] = [];
  const params: unknown[] = [];
  if (q) {
    where.push("(e.name LIKE ? OR e.email LIKE ? OR e.emp_code LIKE ? OR e.designation LIKE ?)");
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (dept) {
    where.push("e.department = ?");
    params.push(dept);
  }
  if (status) {
    where.push("e.status = ?");
    params.push(status);
  } else if (!full) {
    where.push("e.status != 'Exited'");
  }

  const select = full
    ? `e.id, e.emp_code, e.name, e.email, e.role, e.designation, e.department, e.manager_id, e.join_date, e.dob,
       e.gender, e.phone, e.city, e.state, e.work_location, e.employment_type, e.status, e.avatar_color,
       e.basic, e.hra, e.special_allowance, e.conveyance, m.name AS manager_name`
    : PUBLIC_FIELDS;

  const rows = await all(
    `SELECT ${select} FROM employees e LEFT JOIN employees m ON m.id = e.manager_id
     ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY e.name`,
    ...params
  );

  const departments = (await all<{ name: string }>("SELECT name FROM departments ORDER BY name")).map((d) => d.name);

  return NextResponse.json({ rows, departments });
}

export async function POST(req: NextRequest) {
  const me = await requireAuth(["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const b = await req.json().catch(() => ({}));
  if (!b.name || !b.email) return bad("Name and email are required");

  const dupe = await get("SELECT id FROM employees WHERE lower(email) = lower(?)", String(b.email).trim());
  if (dupe) return bad("An employee with that email already exists");

  // Auto-generate the next employee code unless one was provided
  let code = (b.emp_code || "").trim();
  if (!code) {
    const last = await get<{ emp_code: string }>(
      "SELECT emp_code FROM employees WHERE emp_code LIKE 'EMP%' ORDER BY CAST(SUBSTR(emp_code, 4) AS INTEGER) DESC LIMIT 1"
    );
    const n = last ? parseInt(last.emp_code.slice(3), 10) + 1 : 1;
    code = `EMP${String(n).padStart(3, "0")}`;
  } else if (await get("SELECT id FROM employees WHERE emp_code = ?", code)) {
    return bad("That employee ID is already taken");
  }

  // HR can onboard employees; only Admin can create HR/Admin accounts
  const role = me.role === "ADMIN" && ["EMPLOYEE", "HR", "ADMIN"].includes(b.role) ? b.role : "EMPLOYEE";
  const password = b.password && String(b.password).length >= 6 ? String(b.password) : "Welcome@123";

  const info = await run(
    `INSERT INTO employees (emp_code, name, email, password_hash, role, designation, department, manager_id,
      join_date, dob, gender, blood_group, marital_status, phone, alt_phone, address, city, state, pincode,
      emergency_name, emergency_phone, emergency_relation, work_location, employment_type, status,
      bank_name, account_no, ifsc, pan, uan, basic, hra, special_allowance, conveyance, avatar_color)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    code, String(b.name).trim(), String(b.email).trim().toLowerCase(), bcrypt.hashSync(password, 10), role,
    b.designation || null, b.department || null, b.manager_id || null,
    b.join_date || null, b.dob || null, b.gender || null, b.blood_group || null, b.marital_status || null,
    b.phone || null, b.alt_phone || null, b.address || null, b.city || null, b.state || null, b.pincode || null,
    b.emergency_name || null, b.emergency_phone || null, b.emergency_relation || null,
    b.work_location || null, b.employment_type || "Full-time", b.status || "Active",
    b.bank_name || null, b.account_no || null, b.ifsc || null, b.pan || null, b.uan || null,
    Number(b.basic) || 0, Number(b.hra) || 0, Number(b.special_allowance) || 0, Number(b.conveyance) || 0,
    colorFor(String(b.name))
  );

  const id = Number(info.lastInsertRowid);
  // Allocate standard leave balances
  const types = await all<{ id: number; annual_quota: number }>("SELECT id, annual_quota FROM leave_types");
  for (const t of types) await run("INSERT OR IGNORE INTO leave_balances (employee_id, leave_type_id, allocated, used) VALUES (?, ?, ?, 0)", id, t.id, t.annual_quota);

  return NextResponse.json({ ok: true, id, emp_code: code, password });
}
