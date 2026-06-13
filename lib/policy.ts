import { get, all } from "./db";
import type { SessionUser } from "./types";

export type ApprovalModule = "timesheets" | "leaves" | "claims";
export type ApproverPolicy = "HR_ADMIN" | "HOD" | "ADMIN";

export const POLICY_LABELS: Record<ApproverPolicy, string> = {
  HR_ADMIN: "HR & Admin",
  HOD: "Dept HOD + HR & Admin",
  ADMIN: "Admin only",
};

export async function approvalPolicy(module: ApprovalModule): Promise<ApproverPolicy> {
  const row = await get<{ value: string }>("SELECT value FROM settings WHERE key = ?", `approver_${module}`);
  return (["HR_ADMIN", "HOD", "ADMIN"].includes(row?.value || "") ? row!.value : "HR_ADMIN") as ApproverPolicy;
}

/** Department names this user heads. */
export async function hodDepartments(userId: number): Promise<string[]> {
  const rows = await all<{ name: string }>("SELECT name FROM departments WHERE hod_id = ?", userId);
  return rows.map((d) => d.name);
}

/** Can `me` review (approve/reject) an item raised by someone in `requesterDept`? */
export async function canReview(me: SessionUser, module: ApprovalModule, requesterDept: string | null): Promise<boolean> {
  if (me.role === "ADMIN") return true;
  const policy = await approvalPolicy(module);
  if (policy === "ADMIN") return false;
  if (me.role === "HR") return true; // HR retains rights in both HR_ADMIN and HOD modes
  // plain employee: only as HOD of the requester's department, and only in HOD mode
  if (policy === "HOD" && requesterDept) return (await hodDepartments(me.id)).includes(requesterDept);
  return false;
}

export async function deptOf(employeeId: number): Promise<string | null> {
  const row = await get<{ department: string | null }>("SELECT department FROM employees WHERE id = ?", employeeId);
  return row?.department ?? null;
}
