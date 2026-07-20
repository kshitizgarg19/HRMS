import { NextRequest, NextResponse  } from "next/server";
import { get, all } from "@/lib/db";
import { requireAuth, isErr } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const me = await requireAuth(req);
  if (isErr(me)) return me;
  const items: { id: string; kind: string; text: string; sub?: string; time: string; href: string }[] = [];

  if (me.role !== "EMPLOYEE") {
    const p = {
      leaves: (await get<{ c: number }>("SELECT COUNT(*) c FROM leave_requests WHERE status = 'Pending'"))!.c,
      timesheets: (await get<{ c: number }>("SELECT COUNT(*) c FROM timesheets WHERE status = 'Pending'"))!.c,
      reimb: (await get<{ c: number }>("SELECT COUNT(*) c FROM reimbursements WHERE status = 'Pending'"))!.c,
      duty: (await get<{ c: number }>("SELECT COUNT(*) c FROM duty_requests WHERE status = 'Pending'"))!.c,
    };
    if (p.leaves) items.push({ id: "p-l", kind: "approval", text: `${p.leaves} leave request${p.leaves > 1 ? "s" : ""} awaiting review`, time: "", href: "/admin/approvals" });
    if (p.duty) items.push({ id: "p-d", kind: "approval", text: `${p.duty} on-duty request${p.duty > 1 ? "s" : ""} awaiting review`, time: "", href: "/admin/approvals?tab=duty" });
    if (p.timesheets) items.push({ id: "p-t", kind: "approval", text: `${p.timesheets} timesheet${p.timesheets > 1 ? "s" : ""} awaiting review`, time: "", href: "/admin/approvals?tab=timesheets" });
    if (p.reimb) items.push({ id: "p-r", kind: "approval", text: `${p.reimb} reimbursement claim${p.reimb > 1 ? "s" : ""} awaiting review`, time: "", href: "/admin/approvals?tab=reimbursements" });
  }

  // my recently reviewed items
  const reviewed = await all<{ kind: string; detail: string; status: string; reviewed_at: string }>(
    `SELECT * FROM (
      SELECT 'leave' kind, lt.name detail, lr.status, lr.reviewed_at FROM leave_requests lr
        JOIN leave_types lt ON lt.id = lr.leave_type_id
        WHERE lr.employee_id = ? AND lr.reviewed_at IS NOT NULL
      UNION ALL
      SELECT 'claim' kind, r.category || ' claim' detail, r.status, r.reviewed_at FROM reimbursements r
        WHERE r.employee_id = ? AND r.reviewed_at IS NOT NULL
      UNION ALL
      SELECT 'timesheet' kind, 'Timesheet (' || t.date || ')' detail, t.status, t.reviewed_at FROM timesheets t
        WHERE t.employee_id = ? AND t.reviewed_at IS NOT NULL
      UNION ALL
      SELECT 'duty' kind, 'On-duty (' || d.location || ')' detail, d.status, d.reviewed_at FROM duty_requests d
        WHERE d.employee_id = ? AND d.reviewed_at IS NOT NULL
    ) ORDER BY reviewed_at DESC LIMIT 5`,
    me.id, me.id, me.id, me.id
  );

  reviewed.forEach((r, i) =>
    items.push({
      id: `r-${i}`,
      kind: r.status === "Approved" ? "ok" : "no",
      text: `Your ${r.detail} was ${r.status.toLowerCase()}`,
      time: r.reviewed_at,
      href: r.kind === "leave" ? "/leave" : r.kind === "claim" ? "/reimbursement" : r.kind === "duty" ? "/duty" : "/timesheet",
    })
  );

  const ann = await all<{ id: number; title: string; created_at: string }>(
    "SELECT id, title, created_at FROM announcements ORDER BY created_at DESC LIMIT 3"
  );
  ann.forEach((a) => items.push({ id: `a-${a.id}`, kind: "announce", text: a.title, time: a.created_at, href: "/announcements" }));

  return NextResponse.json({ items: items.slice(0, 10) });
}
