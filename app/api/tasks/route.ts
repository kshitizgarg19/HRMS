import { NextRequest, NextResponse } from "next/server";
import { all as sqlAll, run } from "@/lib/db";
import { requireAuth, isErr, bad, forbidden } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const me = await requireAuth();
  if (isErr(me)) return me;
  const all = req.nextUrl.searchParams.get("all") === "1";
  if (all && me.role === "EMPLOYEE") return forbidden();

  const where = all ? "" : "WHERE t.assigned_to = ?";
  const params = all ? [] : [me.id];
  const rows = await sqlAll(
    `SELECT t.*, a.name AS assignee_name, a.avatar_color AS assignee_color, a.department AS assignee_dept,
            b.name AS assigner_name
     FROM tasks t
     JOIN employees a ON a.id = t.assigned_to
     JOIN employees b ON b.id = t.assigned_by
     ${where}
     ORDER BY CASE t.priority WHEN 'Urgent' THEN 0 WHEN 'High' THEN 1 WHEN 'Medium' THEN 2 ELSE 3 END, t.due_date`,
    ...params
  );

  const assignees = me.role === "EMPLOYEE"
    ? []
    : await sqlAll("SELECT id, name FROM employees WHERE status = 'Active' ORDER BY name");

  return NextResponse.json({ rows, assignees });
}

export async function POST(req: NextRequest) {
  const me = await requireAuth(["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const { title, category, description, assigned_to, priority, duration, due_date } = await req.json().catch(() => ({}));
  if (!title || !assigned_to) return bad("Title and assignee are required");

  const info = await run(
    "INSERT INTO tasks (title, category, description, assigned_to, assigned_by, priority, duration, due_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    String(title).trim(), category || "General", description || null, Number(assigned_to), me.id, priority || "Medium", duration || null, due_date || null
  );
  return NextResponse.json({ ok: true, id: info.lastInsertRowid });
}
