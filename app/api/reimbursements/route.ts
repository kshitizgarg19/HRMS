import { NextRequest, NextResponse } from "next/server";
import { all as sqlAll, run } from "@/lib/db";
import { requireAuth, isErr, bad, forbidden } from "@/lib/auth";
import { approvalPolicy, hodDepartments } from "@/lib/policy";

// Every reimbursement column EXCEPT the heavy receipt_data blob (served on demand instead),
// plus a lightweight has_receipt flag so the UI knows whether to show a "View" link.
const LIST_COLS =
  "r.id, r.employee_id, r.category, r.amount, r.expense_date, r.description, r.receipt, r.receipt_type, r.status, r.reviewed_by, r.reviewed_at, r.review_note, r.created_at, (r.receipt_data IS NOT NULL) AS has_receipt";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "application/pdf"];
const MAX_BYTES = 4 * 1024 * 1024; // 4 MB decoded — keeps the request under the serverless body limit

export async function GET(req: NextRequest) {
  const me = await requireAuth(req);
  if (isErr(me)) return me;
  const sp = req.nextUrl.searchParams;
  const all = sp.get("all") === "1";
  if (all && me.role === "EMPLOYEE") {
    const scope = (await approvalPolicy("claims")) === "HOD" ? await hodDepartments(me.id) : [];
    if (!scope.length) return forbidden();
    const where0 = `e.department IN (${scope.map(() => "?").join(",")})`;
    const rows = await sqlAll(
      `SELECT ${LIST_COLS}, e.name AS employee_name, e.emp_code, e.department, e.avatar_color, rev.name AS reviewer_name
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
    `SELECT ${LIST_COLS}, e.name AS employee_name, e.emp_code, e.department, e.avatar_color, rev.name AS reviewer_name
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
  const me = await requireAuth(req);
  if (isErr(me)) return me;
  const { category, amount, expense_date, description, receipt, receipt_data } = await req.json().catch(() => ({}));
  if (!category || !amount || !expense_date || !description) return bad("Category, amount, date and description are required");
  const amt = Number(amount);
  if (isNaN(amt) || amt <= 0) return bad("Amount must be a positive number");
  if (amt > 500000) return bad("Claims above ₹5,00,000 need a manual process — contact finance");

  // Optional uploaded bill — a data URL: "data:<mime>;base64,<payload>"
  let dataB64: string | null = null;
  let mime: string | null = null;
  let fileName: string | null = receipt ? String(receipt).slice(0, 200) : null;
  if (receipt_data) {
    const m = /^data:([^;,]+);base64,([\s\S]+)$/.exec(String(receipt_data));
    if (!m) return bad("Couldn't read the uploaded file — please re-attach it");
    mime = m[1].toLowerCase();
    dataB64 = m[2];
    if (!ALLOWED_TYPES.includes(mime)) return bad("Only images (JPG/PNG/WebP) or PDF files are allowed");
    const bytes = Math.floor(dataB64.length * 0.75);
    if (bytes > MAX_BYTES) return bad("File is too large — please upload a bill under 4 MB");
    if (!fileName) fileName = mime === "application/pdf" ? "receipt.pdf" : "receipt.jpg";
  }

  const info = await run(
    "INSERT INTO reimbursements (employee_id, category, amount, expense_date, description, receipt, receipt_data, receipt_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    me.id, category, amt, expense_date, String(description).trim(), fileName, dataB64, mime
  );
  return NextResponse.json({ ok: true, id: info.lastInsertRowid });
}
