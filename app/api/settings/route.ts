import { NextRequest, NextResponse } from "next/server";
import { all, run } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";

const APPROVER_KEYS = ["approver_timesheets", "approver_leaves", "approver_claims"];
const POLICIES = ["HR_ADMIN", "HOD", "ADMIN"];

export async function GET() {
  const me = await requireAuth(["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const rows = await all<{ key: string; value: string }>("SELECT key, value FROM settings");
  const settings: Record<string, string> = {};
  rows.forEach((r) => (settings[r.key] = r.value));
  return NextResponse.json({ settings });
}

export async function PUT(req: NextRequest) {
  const me = await requireAuth(["ADMIN"]);
  if (isErr(me)) return me;
  const { key, value } = await req.json().catch(() => ({}));
  if (!APPROVER_KEYS.includes(key)) return bad("Unknown setting");
  if (!POLICIES.includes(value)) return bad("Invalid policy value");
  await run("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value", key, value);
  return NextResponse.json({ ok: true });
}
