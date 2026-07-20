import { NextRequest, NextResponse } from "next/server";
import { get, all, run, tx } from "@/lib/db";
import { requireAuth, isErr, bad, forbidden } from "@/lib/auth";
import { addDays, isWeekend } from "@/lib/format";
import { canReview, deptOf } from "@/lib/policy";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(req);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const { action, note } = await req.json().catch(() => ({}));
  const row = await get<{ id: number; employee_id: number; from_date: string; to_date: string; status: string }>(
    "SELECT * FROM duty_requests WHERE id = ?",
    Number(id)
  );
  if (!row) return bad("On-duty request not found", 404);

  if (action === "cancel") {
    if (row.employee_id !== me.id) return forbidden();
    if (row.status !== "Pending") return bad("Only pending requests can be cancelled");
    await run("UPDATE duty_requests SET status = 'Cancelled', updated_at = datetime('now') WHERE id = ?", row.id);
    return NextResponse.json({ ok: true });
  }

  if (action !== "approve" && action !== "reject") return bad("Unknown action");
  // On-duty rides the org's leave-approval policy.
  if (!(await canReview(me, "leaves", await deptOf(row.employee_id)))) return forbidden();
  if (row.employee_id === me.id) return bad("You can't review your own on-duty request");
  if (row.status !== "Pending") return bad("Only pending requests can be reviewed");

  if (action === "reject") {
    await run(
      "UPDATE duty_requests SET status = 'Rejected', reviewed_by = ?, reviewed_at = datetime('now'), review_note = ?, updated_at = datetime('now') WHERE id = ?",
      me.id, note || null, row.id
    );
    return NextResponse.json({ ok: true });
  }

  // approve → write "On Duty" into attendance for each working day (counts as present, no leave deducted)
  const holidays = new Set((await all<{ date: string }>("SELECT date FROM holidays")).map((h) => h.date));
  await tx(async (q) => {
    await q.run(
      "UPDATE duty_requests SET status = 'Approved', reviewed_by = ?, reviewed_at = datetime('now'), review_note = ?, updated_at = datetime('now') WHERE id = ?",
      me.id, note || null, row.id
    );
    for (let c = row.from_date; c <= row.to_date; c = addDays(c, 1)) {
      if (isWeekend(c) || holidays.has(c)) continue;
      await q.run("INSERT OR REPLACE INTO attendance (employee_id, date, check_in, check_out, hours, status, mode) VALUES (?, ?, NULL, NULL, NULL, 'On Duty', NULL)", row.employee_id, c);
    }
  });
  return NextResponse.json({ ok: true });
}
