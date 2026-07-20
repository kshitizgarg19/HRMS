import { NextRequest } from "next/server";
import { get } from "@/lib/db";
import { requireAuth, isErr } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

/** Serve a claim's uploaded bill (image/PDF) inline. Owner or any reviewer (HR/ADMIN) can view it. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(req);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const row = await get<{ employee_id: number; receipt: string | null; receipt_data: string | null; receipt_type: string | null }>(
    "SELECT employee_id, receipt, receipt_data, receipt_type FROM reimbursements WHERE id = ?",
    Number(id)
  );
  if (!row) return new Response("Not found", { status: 404 });
  if (me.role === "EMPLOYEE" && me.id !== row.employee_id) return new Response("Forbidden", { status: 403 });
  if (!row.receipt_data) return new Response("No receipt attached", { status: 404 });

  const bytes = Buffer.from(row.receipt_data, "base64");
  const safeName = (row.receipt || "receipt").replace(/[^\w.\-]+/g, "_");
  return new Response(bytes, {
    headers: {
      "Content-Type": row.receipt_type || "application/octet-stream",
      "Content-Disposition": `inline; filename="${safeName}"`,
      "Content-Length": String(bytes.length),
      "Cache-Control": "private, max-age=300",
    },
  });
}
