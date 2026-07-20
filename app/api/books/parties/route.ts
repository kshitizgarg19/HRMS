import { NextRequest, NextResponse } from "next/server";
import { all, run } from "@/lib/db";
import { requireAuth, isErr, bad, forbidden } from "@/lib/auth";
import { autoSyncAfterCreate } from "@/lib/zoho";

export async function GET(req: NextRequest) {
  const me = await requireAuth(req);
  if (isErr(me)) return me;
  let type = req.nextUrl.searchParams.get("type") === "vendor" ? "vendor" : "customer";
  if (me.role === "EMPLOYEE") type = "customer"; // employees never see the vendor list
  // `receivable` = outstanding balance (money owed to us by a customer, or by us to a vendor)
  const rows = await all(
    `SELECT p.*,
       COALESCE((SELECT SUM(t.total - t.paid) FROM books_txns t
                 WHERE t.party_id = p.id AND t.type IN ('invoice','bill') AND t.status != 'Paid'), 0) AS receivable
     FROM books_parties p
     WHERE p.type = ?
     ORDER BY p.name`,
    type
  );
  return NextResponse.json({ rows });
}

export async function POST(req: NextRequest) {
  const me = await requireAuth(req);
  if (isErr(me)) return me;
  const b = await req.json().catch(() => ({}));
  const name = String(b.name || "").trim();
  if (!name) return bad("Name is required");
  const type = b.type === "vendor" ? "vendor" : "customer";
  // Employees manage customers only; vendors stay HR/Admin.
  if (me.role === "EMPLOYEE" && type === "vendor") return forbidden();
  const info = await run(
    "INSERT INTO books_parties (type, name, company, email, phone, gstin, billing_address, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    type, name, b.company || null, b.email || null, b.phone || null, b.gstin || null, b.billing_address || null, b.notes || null
  );
  await autoSyncAfterCreate("contact"); // best-effort push to Zoho when auto-sync is on (never throws)
  return NextResponse.json({ ok: true, id: info.lastInsertRowid });
}
