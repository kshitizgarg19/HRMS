import { NextRequest, NextResponse } from "next/server";
import { get, run, tx } from "@/lib/db";
import { requireAuth, isErr, bad } from "@/lib/auth";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(["ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));

  const dept = await get<{ id: number; name: string; hod_id: number | null }>("SELECT * FROM departments WHERE id = ?", Number(id));
  if (!dept) return bad("Department not found", 404);

  try {
    await tx(async (q) => {
      if ("name" in body) {
        const clean = String(body.name || "").trim();
        if (!clean) throw new Error("Department name can't be empty");
        const dupe = await q.get("SELECT id FROM departments WHERE lower(name) = lower(?) AND id != ?", clean, dept.id);
        if (dupe) throw new Error("A department with that name already exists");
        await q.run("UPDATE departments SET name = ? WHERE id = ?", clean, dept.id);
        // keep every employee record in sync with the rename
        await q.run("UPDATE employees SET department = ? WHERE department = ?", clean, dept.name);
      }
      if ("hod_id" in body) {
        const hod = body.hod_id ? Number(body.hod_id) : null;
        if (hod) {
          const exists = await q.get("SELECT id FROM employees WHERE id = ? AND status != 'Exited'", hod);
          if (!exists) throw new Error("Selected HOD employee not found");
        }
        await q.run("UPDATE departments SET hod_id = ? WHERE id = ?", hod, dept.id);
      }
    });
  } catch (e) {
    return bad(e instanceof Error ? e.message : "Update failed");
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const me = await requireAuth(["ADMIN"]);
  if (isErr(me)) return me;
  const { id } = await ctx.params;
  const dept = await get<{ id: number; name: string }>("SELECT * FROM departments WHERE id = ?", Number(id));
  if (!dept) return bad("Department not found", 404);

  const headcount = (await get<{ c: number }>("SELECT COUNT(*) c FROM employees WHERE department = ? AND status != 'Exited'", dept.name))!;
  if (headcount.c > 0) return bad(`Can't delete — ${headcount.c} employee(s) still in ${dept.name}. Move them to another department first.`);

  await run("DELETE FROM departments WHERE id = ?", dept.id);
  return NextResponse.json({ ok: true });
}
