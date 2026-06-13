"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ClipboardCheck, Check, X, Palmtree, Clock4, Receipt, Paperclip } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, fmtINR } from "@/lib/format";
import { Badge, Button, Card, DataTable, Field, Modal, PageHeader, PageLoader, PersonCell, Tabs, Textarea, useToast } from "@/components/ui";
import type { LeaveRequest, Reimbursement, Timesheet } from "@/lib/types";

type LeaveRow = LeaveRequest & { avatar_color?: string | null };
type TsRow = Timesheet & { avatar_color?: string | null; department?: string | null };
type ReRow = Reimbursement & { avatar_color?: string | null; department?: string | null };

type Review = { kind: "leave" | "timesheet" | "reimbursement"; id: number; action: "approve" | "reject"; label: string };

function ApprovalsInner() {
  const sp = useSearchParams();
  const initial = ["leaves", "timesheets", "reimbursements"].includes(sp.get("tab") || "") ? (sp.get("tab") as string) : "leaves";
  const [tab, setTab] = useState(initial);
  const [leaves, setLeaves] = useState<LeaveRow[] | null>(null);
  const [timesheets, setTimesheets] = useState<TsRow[] | null>(null);
  const [claims, setClaims] = useState<ReRow[] | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    // A dataset can 403 when the approval policy doesn't include this user (e.g. an HOD with timesheet-only rights) — treat it as empty.
    api<{ requests: LeaveRow[] }>("/api/leaves?all=1&status=Pending").then((d) => setLeaves(d.requests)).catch(() => setLeaves([]));
    api<{ rows: TsRow[] }>("/api/timesheets?all=1&status=Pending").then((d) => setTimesheets(d.rows)).catch(() => setTimesheets([]));
    api<{ rows: ReRow[] }>("/api/reimbursements?all=1&status=Pending").then((d) => setClaims(d.rows)).catch(() => setClaims([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!leaves || !timesheets || !claims) return <PageLoader />;

  const act = async (r: Review, withNote: string) => {
    setBusy(true);
    try {
      const url = r.kind === "leave" ? `/api/leaves/${r.id}` : r.kind === "timesheet" ? `/api/timesheets/${r.id}` : `/api/reimbursements/${r.id}`;
      const method = r.kind === "timesheet" ? "PUT" : "PATCH";
      await api(url, { method, body: JSON.stringify({ action: r.action, note: withNote || null }) });
      toast.push("success", `${r.label} ${r.action === "approve" ? "approved ✓" : "rejected"}`);
      setReview(null);
      setNote("");
      load();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const quickActions = (kind: Review["kind"], id: number, label: string) => (
    <span className="flex justify-end gap-1.5">
      <button
        onClick={() => act({ kind, id, action: "approve", label }, "")}
        className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200 transition hover:bg-emerald-100 cursor-pointer"
      >
        <Check size={13} /> Approve
      </button>
      <button
        onClick={() => setReview({ kind, id, action: "reject", label })}
        className="inline-flex items-center gap-1 rounded-lg bg-rose-50 dark:bg-rose-500/15 px-3 py-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 ring-1 ring-rose-200 transition hover:bg-rose-100 cursor-pointer"
      >
        <X size={13} /> Reject
      </button>
    </span>
  );

  return (
    <div className="fade-up">
      <PageHeader
        title="Approvals Center"
        subtitle="Review leave requests, timesheets and expense claims in one inbox"
        icon={<ClipboardCheck size={20} />}
        actions={
          <Tabs
            tabs={[
              { key: "leaves", label: <span className="flex items-center gap-1.5"><Palmtree size={13} /> Leaves ({leaves.length})</span> },
              { key: "timesheets", label: <span className="flex items-center gap-1.5"><Clock4 size={13} /> Timesheets ({timesheets.length})</span> },
              { key: "reimbursements", label: <span className="flex items-center gap-1.5"><Receipt size={13} /> Claims ({claims.length})</span> },
            ]}
            active={tab}
            onChange={setTab}
          />
        }
      />

      {tab === "leaves" && (
        <Card title="Pending Leave Requests" icon={<Palmtree size={16} />}>
          <DataTable
            rows={leaves}
            keyFor={(r) => r.id}
            empty={<p className="text-center text-sm text-slate-400 dark:text-slate-500">No pending leave requests 🎉</p>}
            columns={[
              { key: "emp", header: "Employee", render: (r) => <PersonCell name={r.employee_name || ""} sub={`${r.emp_code} · ${r.department || "—"}`} color={r.avatar_color} /> },
              { key: "type", header: "Type", render: (r) => <Badge tone="EMPLOYEE">{r.leave_type}</Badge> },
              {
                key: "dates", header: "Dates",
                render: (r) => (
                  <span>
                    <span className="block text-[13px] font-bold text-slate-700 dark:text-slate-200">{fmtDate(r.from_date)}{r.from_date !== r.to_date && ` → ${fmtDate(r.to_date)}`}</span>
                    <span className="text-xs text-slate-400 dark:text-slate-500">{r.days} day{r.days === 1 ? "" : "s"}{r.half !== "none" && ` · ${r.half} half`}</span>
                  </span>
                ),
              },
              { key: "reason", header: "Reason", className: "max-w-[240px]", render: (r) => <span className="line-clamp-2 text-[13px] text-slate-500 dark:text-slate-400">{r.reason}</span> },
              { key: "resp", header: "Backup", render: (r) => <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{r.responsible_name || "—"}</span> },
              { key: "act", header: "Actions", className: "text-right", render: (r) => quickActions("leave", r.id, `${r.employee_name}'s ${r.leave_type}`) },
            ]}
          />
        </Card>
      )}

      {tab === "timesheets" && (
        <Card title="Pending Timesheets" icon={<Clock4 size={16} />}>
          <DataTable
            rows={timesheets}
            keyFor={(r) => r.id}
            empty={<p className="text-center text-sm text-slate-400 dark:text-slate-500">No pending timesheets 🎉</p>}
            columns={[
              { key: "emp", header: "Employee", render: (r) => <PersonCell name={r.employee_name || ""} sub={`${r.emp_code} · ${r.department || "—"}`} color={r.avatar_color} /> },
              { key: "date", header: "Date", render: (r) => <span className="text-[13px] font-bold">{fmtDate(r.date)}</span> },
              { key: "loc", header: "Location", render: (r) => <Badge tone={r.location.includes("Home") ? "WFH" : "WFO"}>{r.location}</Badge> },
              { key: "tasks", header: "Tasks", className: "max-w-[300px]", render: (r) => <span className="line-clamp-2 text-[13px] text-slate-500 dark:text-slate-400">{r.tasks}</span> },
              { key: "hours", header: "Hours", render: (r) => <span className="font-extrabold">{r.hours}h</span> },
              { key: "act", header: "Actions", className: "text-right", render: (r) => quickActions("timesheet", r.id, `${r.employee_name}'s timesheet`) },
            ]}
          />
        </Card>
      )}

      {tab === "reimbursements" && (
        <Card title="Pending Expense Claims" icon={<Receipt size={16} />}>
          <DataTable
            rows={claims}
            keyFor={(r) => r.id}
            empty={<p className="text-center text-sm text-slate-400 dark:text-slate-500">No pending claims 🎉</p>}
            columns={[
              { key: "emp", header: "Employee", render: (r) => <PersonCell name={r.employee_name || ""} sub={`${r.emp_code} · ${r.department || "—"}`} color={r.avatar_color} /> },
              { key: "cat", header: "Category", render: (r) => <Badge tone="EMPLOYEE">{r.category}</Badge> },
              {
                key: "desc", header: "Description", className: "max-w-[280px]",
                render: (r) => (
                  <span>
                    <span className="line-clamp-2 text-[13px] text-slate-500 dark:text-slate-400">{r.description}</span>
                    {r.receipt && <span className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-indigo-500"><Paperclip size={11} /> {r.receipt}</span>}
                  </span>
                ),
              },
              { key: "date", header: "Date", render: (r) => <span className="text-[13px] font-semibold">{fmtDate(r.expense_date)}</span> },
              { key: "amt", header: "Amount", render: (r) => <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100">{fmtINR(r.amount)}</span> },
              { key: "act", header: "Actions", className: "text-right", render: (r) => quickActions("reimbursement", r.id, `${r.employee_name}'s ${r.category} claim`) },
            ]}
          />
        </Card>
      )}

      <Modal open={!!review} onClose={() => setReview(null)} title={`Reject ${review?.label}?`} subtitle="Add a short note so the employee knows why">
        <div className="space-y-4">
          <Field label="Reason for rejection">
            <Textarea placeholder="e.g. Release week — please reschedule" value={note} onChange={(e) => setNote(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setReview(null)}>Cancel</Button>
            <Button variant="danger" loading={busy} onClick={() => review && act(review, note)}><X size={14} /> Reject Request</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

export default function ApprovalsPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <ApprovalsInner />
    </Suspense>
  );
}
