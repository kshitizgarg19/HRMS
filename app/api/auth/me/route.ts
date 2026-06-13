import { NextResponse } from "next/server";
import { getSession, unauthorized } from "@/lib/auth";

export async function GET() {
  const me = await getSession();
  if (!me) return unauthorized();
  return NextResponse.json({ user: me });
}
