import { NextRequest, NextResponse } from "next/server";
import { get, run } from "@/lib/db";
import { requireAuth, isErr, bad, forbidden } from "@/lib/auth";
import { canReview, deptOf } from "@/lib/policy";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth();
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const { action, note } = await req.json().catch(() => ({}));
  const row = await get<{ id: number; employee_id: number; status: string }>("SELECT * FROM reimbursements WHERE id = ?", Number(id));
  if (!row) return bad("Claim not found", 404);

  if (action !== "approve" && action !== "reject") return bad("Unknown action");
  if (!(await canReview(me, "claims", await deptOf(row.employee_id)))) return forbidden();
  if (row.employee_id === me.id) return bad("You can't review your own claim");
  if (row.status !== "Pending") return bad("Only pending claims can be reviewed");

  await run(
    "UPDATE reimbursements SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), review_note = ?, updated_at = datetime('now') WHERE id = ?",
    action === "approve" ? "Approved" : "Rejected", me.id, note || null, row.id
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth();
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const row = await get<{ id: number; employee_id: number; status: string }>("SELECT * FROM reimbursements WHERE id = ?", Number(id));
  if (!row) return bad("Claim not found", 404);
  const canDelete = me.role === "ADMIN" || (row.employee_id === me.id && row.status === "Pending");
  if (!canDelete) return forbidden();
  await run("DELETE FROM reimbursements WHERE id = ?", row.id);
  return NextResponse.json({ ok: true });
}
