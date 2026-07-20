import { NextRequest, NextResponse } from "next/server";
import { get, run } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";

const SELF_EDITABLE = [
  "phone", "alt_phone", "address", "city", "state", "pincode",
  "emergency_name", "emergency_phone", "emergency_relation",
  "dob", "gender", "blood_group", "marital_status",
  "bank_name", "account_no", "ifsc", "pan", "uan",
] as const;

export async function GET(req: NextRequest) {
  const me = await requireAuth(req);
  if (isErr(me)) return me;
  const row = (await get<Record<string, unknown>>(
    `SELECT e.*, m.name AS manager_name FROM employees e
     LEFT JOIN employees m ON m.id = e.manager_id WHERE e.id = ?`,
    me.id
  ))!;
  delete row.password_hash;
  return NextResponse.json({ profile: row });
}

export async function PUT(req: NextRequest) {
  const me = await requireAuth(req);
  if (isErr(me)) return me;
  const body = await req.json().catch(() => ({}));

  const updates: string[] = [];
  const values: unknown[] = [];
  for (const key of SELF_EDITABLE) {
    if (key in body) {
      updates.push(`${key} = ?`);
      values.push(body[key] === "" ? null : body[key]);
    }
  }
  if (!updates.length) return bad("Nothing to update");
  values.push(me.id);
  await run(`UPDATE employees SET ${updates.join(", ")} WHERE id = ?`, ...values);
  return NextResponse.json({ ok: true });
}
