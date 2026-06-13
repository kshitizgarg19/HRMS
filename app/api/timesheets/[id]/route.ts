import { NextRequest, NextResponse } from "next/server";
import { get, run } from "@/lib/db";
import { requireAuth, isErr, bad, forbidden } from "@/lib/auth";
import { canReview, deptOf } from "@/lib/policy";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth();
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const row = await get<{ id: number; employee_id: number; status: string }>("SELECT * FROM timesheets WHERE id = ?", Number(id));
  if (!row) return bad("Timesheet not found", 404);

  // Review action — allowed reviewers are configurable in Org Settings (HR & Admin / HOD / Admin only)
  if (body.action === "approve" || body.action === "reject") {
    if (!(await canReview(me, "timesheets", await deptOf(row.employee_id)))) return forbidden();
    if (row.employee_id === me.id) return bad("You can't review your own timesheet");
    if (row.status !== "Pending") return bad("Only pending timesheets can be reviewed");
    await run(
      "UPDATE timesheets SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), review_note = ?, updated_at = datetime('now') WHERE id = ?",
      body.action === "approve" ? "Approved" : "Rejected", me.id, body.note || null, row.id
    );
    return NextResponse.json({ ok: true });
  }

  // Self edit while pending
  if (row.employee_id !== me.id) return forbidden();
  if (row.status !== "Pending") return bad("Approved/rejected entries can't be edited");
  const { date, location, tasks, hours } = body;
  if (!date || !tasks || !hours) return bad("Date, tasks and hours are required");
  await run(
    "UPDATE timesheets SET date = ?, location = ?, tasks = ?, hours = ?, updated_at = datetime('now') WHERE id = ?",
    date, location || "Work From Office", String(tasks).trim(), Number(hours), row.id
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth();
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const row = await get<{ id: number; employee_id: number; status: string }>("SELECT * FROM timesheets WHERE id = ?", Number(id));
  if (!row) return bad("Timesheet not found", 404);
  const canDelete = me.role === "ADMIN" || (row.employee_id === me.id && row.status === "Pending");
  if (!canDelete) return forbidden();
  await run("DELETE FROM timesheets WHERE id = ?", row.id);
  return NextResponse.json({ ok: true });
}
