"use client";

import { useEffect, useMemo, useState } from "react";
import { Palmtree, Send, RotateCcw, ListChecks, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, todayStr, workingDays, isWeekend } from "@/lib/format";
import { Badge, Button, Card, ConfirmModal, DataTable, Field, Input, PageHeader, PageLoader, PersonCell, ProgressBar, Select, Textarea, useToast, cn } from "@/components/ui";
import type { LeaveBalance, LeaveRequest, LeaveType } from "@/lib/types";

interface LeaveData {
  types: LeaveType[];
  balances: LeaveBalance[];
  requests: LeaveRequest[];
  colleagues: { id: number; name: string }[];
}

const TYPE_COLORS: Record<string, string> = {
  "Casual Leave": "bg-indigo-500",
  "Sick Leave": "bg-rose-500",
  "Earned Leave": "bg-emerald-500",
  "Leave Without Pay": "bg-slate-400",
};

const EMPTY = { leave_type_id: "", from_date: todayStr(), to_date: todayStr(), half: "none", reason: "", responsible_id: "" };

export default function LeavePage() {
  const [data, setData] = useState<LeaveData | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<LeaveRequest | null>(null);
  const toast = useToast();

  const load = () => api<LeaveData>("/api/leaves").then(setData).catch(() => {});
  useEffect(() => { load(); }, []);

  const estDays = useMemo(() => {
    if (!form.from_date || !form.to_date || form.to_date < form.from_date) return 0;
    if (form.half !== "none") return form.from_date === form.to_date && !isWeekend(form.from_date) ? 0.5 : 0;
    return workingDays(form.from_date, form.to_date);
  }, [form.from_date, form.to_date, form.half]);

  const selectedBalance = useMemo(() => {
    if (!data || !form.leave_type_id) return null;
    return data.balances.find((b) => b.leave_type_id === Number(form.leave_type_id)) || null;
  }, [data, form.leave_type_id]);

  if (!data) return <PageLoader />;

  const submit = async () => {
    if (!form.leave_type_id) return toast.push("error", "Pick a leave type");
    if (!form.reason.trim()) return toast.push("error", "Add a short reason for your leave");
    setBusy(true);
    try {
      const res = await api<{ days: number }>("/api/leaves", {
        method: "POST",
        body: JSON.stringify({ ...form, leave_type_id: Number(form.leave_type_id), responsible_id: form.responsible_id ? Number(form.responsible_id) : null }),
      });
      toast.push("success", `Leave request submitted for ${res.days} day(s) — pending approval`);
      setForm(EMPTY);
      await load();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setBusy(false);
    }
  };

  const cancelReq = async () => {
    if (!cancelTarget) return;
    setBusy(true);
    try {
      await api(`/api/leaves/${cancelTarget.id}`, { method: "PATCH", body: JSON.stringify({ action: "cancel" }) });
      toast.push("success", "Request cancelled");
      setCancelTarget(null);
      await load();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Failed to cancel");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fade-up">
      <PageHeader title="Apply Leave" subtitle="Submit and track your leave requests" icon={<Palmtree size={20} />} />

      {/* Balance cards */}
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.balances.map((b) => (
          <div key={b.leave_type_id} className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <p className="text-[13px] font-bold text-slate-600 dark:text-slate-300">{b.leave_type}</p>
              {!b.paid && <Badge tone="Cancelled">Unpaid</Badge>}
            </div>
            {b.paid ? (
              <>
                <p className="mt-2 text-[26px] font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
                  {b.balance}
                  <span className="text-sm font-bold text-slate-400 dark:text-slate-500"> / {b.allocated} left</span>
                </p>
                <ProgressBar className="mt-2.5" value={b.balance} max={b.allocated || 1} color={TYPE_COLORS[b.leave_type] || "bg-indigo-500"} />
                <p className="mt-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500">{b.used} used this year</p>
              </>
            ) : (
              <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-400 dark:text-slate-500">Unlimited — salary deducted per day taken</p>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Apply form */}
        <Card title="New Leave Request" icon={<Send size={16} />} className="xl:col-span-5">
          <div className="space-y-4">
            <Field label="Leave Type" required>
              <Select value={form.leave_type_id} onChange={(e) => setForm({ ...form, leave_type_id: e.target.value })}>
                <option value="">Select leave type…</option>
                {data.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="From" required><Input type="date" value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value, to_date: e.target.value > form.to_date ? e.target.value : form.to_date })} /></Field>
              <Field label="To" required><Input type="date" min={form.from_date} value={form.to_date} onChange={(e) => setForm({ ...form, to_date: e.target.value })} /></Field>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3">
              <div className="flex gap-4">
                {[["none", "Full day(s)"], ["first", "1st Half"], ["second", "2nd Half"]].map(([val, label]) => (
                  <label key={val} className="flex cursor-pointer items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                    <input type="radio" name="half" checked={form.half === val} onChange={() => setForm({ ...form, half: val })} className="accent-indigo-600" />
                    {label}
                  </label>
                ))}
              </div>
              <span className={cn("rounded-full px-3 py-1 text-xs font-extrabold", estDays > 0 ? "bg-indigo-100 text-indigo-700 dark:text-indigo-300" : "bg-rose-100 text-rose-600 dark:text-rose-400")}>
                {estDays} day{estDays === 1 ? "" : "s"}
              </span>
            </div>
            <Field label="Responsible During Absence">
              <Select value={form.responsible_id} onChange={(e) => setForm({ ...form, responsible_id: e.target.value })}>
                <option value="">Select colleague (optional)…</option>
                {data.colleagues.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
            </Field>
            <Field label="Reason" required>
              <Textarea placeholder="Briefly describe your reason…" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </Field>
            {selectedBalance && selectedBalance.paid === 1 && (
              <p className={cn("rounded-xl px-4 py-2.5 text-xs font-bold", selectedBalance.balance >= estDays ? "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400")}>
                Available balance: {selectedBalance.balance} day(s){selectedBalance.balance < estDays && " — not enough for this request"}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setForm(EMPTY)}><RotateCcw size={14} /> Reset</Button>
              <Button onClick={submit} loading={busy}><Send size={14} /> Submit Request</Button>
            </div>
          </div>
        </Card>

        {/* Applied leaves */}
        <Card title="Applied Leaves" icon={<ListChecks size={16} />} className="xl:col-span-7"
          action={<span className="text-xs font-semibold text-slate-400 dark:text-slate-500">{data.requests.length} records</span>}>
          <DataTable
            rows={data.requests}
            keyFor={(r) => r.id}
            empty={<p className="text-center text-sm text-slate-400 dark:text-slate-500">No leave requests yet.</p>}
            columns={[
              {
                key: "type", header: "Type",
                render: (r) => (
                  <span>
                    <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">{r.leave_type}</span>
                    <span className="block text-xs text-slate-400 dark:text-slate-500">{r.days} day{r.days === 1 ? "" : "s"}{r.half !== "none" && ` (${r.half} half)`}</span>
                  </span>
                ),
              },
              {
                key: "dates", header: "Dates",
                render: (r) => (
                  <span className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">
                    {fmtDate(r.from_date)}{r.from_date !== r.to_date && <> → {fmtDate(r.to_date)}</>}
                  </span>
                ),
              },
              { key: "reason", header: "Reason", className: "max-w-[200px]", render: (r) => <span className="line-clamp-2 text-[13px] text-slate-500 dark:text-slate-400">{r.reason}</span> },
              {
                key: "status", header: "Status",
                render: (r) => (
                  <span title={r.review_note || undefined}>
                    <Badge tone={r.status}>{r.status}</Badge>
                    {r.reviewer_name && <span className="mt-0.5 block text-[10px] text-slate-400 dark:text-slate-500">by {r.reviewer_name}</span>}
                  </span>
                ),
              },
              {
                key: "act", header: "", className: "text-right",
                render: (r) =>
                  r.status === "Pending" ? (
                    <button onClick={() => setCancelTarget(r)} className="rounded-lg p-2 text-rose-500 dark:text-rose-400 transition hover:bg-rose-50 cursor-pointer" title="Cancel request">
                      <XCircle size={16} />
                    </button>
                  ) : null,
              },
            ]}
          />
        </Card>
      </div>

      <ConfirmModal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={cancelReq}
        loading={busy}
        danger
        title="Cancel leave request?"
        message={`Withdraw your ${cancelTarget?.leave_type} request for ${cancelTarget ? fmtDate(cancelTarget.from_date) : ""}?`}
        confirmLabel="Yes, cancel it"
      />
    </div>
  );
}
