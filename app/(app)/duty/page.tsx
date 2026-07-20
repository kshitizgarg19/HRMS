"use client";

import { useMemo, useState } from "react";
import { Plane, Send, RotateCcw, ListChecks, XCircle, MapPin, Info } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/swr";
import { fmtDate, todayStr, workingDays, isWeekend } from "@/lib/format";
import { Badge, Button, Card, ConfirmModal, DataTable, Field, Input, PageHeader, PageLoader, Select, Textarea, useToast, cn } from "@/components/ui";
import type { DutyRequest } from "@/lib/types";

const EMPTY = { from_date: todayStr(), to_date: todayStr(), slot: "full", location: "", purpose: "" };

export default function DutyPage() {
  const { data, reload } = useData<{ requests: DutyRequest[] }>("/api/duty");
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<DutyRequest | null>(null);
  const toast = useToast();

  const estDays = useMemo(() => {
    if (!form.from_date || !form.to_date || form.to_date < form.from_date) return 0;
    if (form.slot !== "full") return form.from_date === form.to_date && !isWeekend(form.from_date) ? 0.5 : 0;
    return workingDays(form.from_date, form.to_date);
  }, [form.from_date, form.to_date, form.slot]);

  if (!data) return <PageLoader />;

  const submit = async () => {
    if (!form.location.trim()) return toast.push("error", "Where are you going? Add a location/client");
    if (!form.purpose.trim()) return toast.push("error", "Add the purpose of the visit");
    setBusy(true);
    try {
      const res = await api<{ days: number }>("/api/duty", { method: "POST", body: JSON.stringify(form) });
      toast.push("success", `On-duty request submitted for ${res.days} day(s) — pending approval`);
      setForm(EMPTY);
      await reload();
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
      await api(`/api/duty/${cancelTarget.id}`, { method: "PATCH", body: JSON.stringify({ action: "cancel" }) });
      toast.push("success", "Request cancelled");
      setCancelTarget(null);
      await reload();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Failed to cancel");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fade-up">
      <PageHeader title="On Duty" subtitle="Apply for official duty — client visits, meetings, conferences" icon={<Plane size={20} />} />

      <div className="mb-6 flex items-start gap-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3.5 dark:border-indigo-500/20 dark:bg-indigo-500/10">
        <Info size={18} className="mt-0.5 shrink-0 text-indigo-500 dark:text-indigo-300" />
        <p className="text-[13px] font-medium leading-relaxed text-indigo-900/80 dark:text-indigo-200">
          Use <span className="font-bold">On Duty</span> when you&apos;re working but away from the office. Once approved, those days are marked
          <span className="mx-1 inline-flex"><Badge tone="On Duty">On Duty</Badge></span>on your attendance and count as <span className="font-bold">present</span> — no leave is deducted.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Apply form */}
        <Card title="New On-Duty Request" icon={<Send size={16} />} className="xl:col-span-5">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="From" required><Input type="date" value={form.from_date} onChange={(e) => setForm({ ...form, from_date: e.target.value, to_date: e.target.value > form.to_date ? e.target.value : form.to_date })} /></Field>
              <Field label="To" required><Input type="date" min={form.from_date} value={form.to_date} onChange={(e) => setForm({ ...form, to_date: e.target.value })} /></Field>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3">
              <div className="flex gap-4">
                {[["full", "Full day(s)"], ["first", "1st Half"], ["second", "2nd Half"]].map(([val, label]) => (
                  <label key={val} className="flex cursor-pointer items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300">
                    <input type="radio" name="slot" checked={form.slot === val} onChange={() => setForm({ ...form, slot: val })} className="accent-indigo-600" />
                    {label}
                  </label>
                ))}
              </div>
              <span className={cn("rounded-full px-3 py-1 text-xs font-extrabold", estDays > 0 ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300" : "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400")}>
                {estDays} day{estDays === 1 ? "" : "s"}
              </span>
            </div>
            <Field label="Location / Client" required>
              <Input placeholder="e.g. Acme Corp, BKC Mumbai" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
            </Field>
            <Field label="Purpose" required>
              <Textarea placeholder="e.g. Quarterly business review with the client team…" value={form.purpose} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
            </Field>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setForm(EMPTY)}><RotateCcw size={14} /> Reset</Button>
              <Button onClick={submit} loading={busy}><Send size={14} /> Submit Request</Button>
            </div>
          </div>
        </Card>

        {/* My requests */}
        <Card title="My On-Duty Requests" icon={<ListChecks size={16} />} className="xl:col-span-7"
          action={<span className="text-xs font-semibold text-slate-400 dark:text-slate-500">{data.requests.length} records</span>}>
          <DataTable
            rows={data.requests}
            keyFor={(r) => r.id}
            empty={<p className="text-center text-sm text-slate-400 dark:text-slate-500">No on-duty requests yet.</p>}
            columns={[
              {
                key: "where", header: "Where & why",
                render: (r) => (
                  <span>
                    <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100"><MapPin size={13} className="text-indigo-500" /> {r.location}</span>
                    <span className="mt-0.5 line-clamp-1 block text-xs text-slate-400 dark:text-slate-500">{r.purpose}</span>
                  </span>
                ),
              },
              {
                key: "dates", header: "Dates",
                render: (r) => (
                  <span className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">
                    {fmtDate(r.from_date)}{r.from_date !== r.to_date && <> → {fmtDate(r.to_date)}</>}
                    <span className="mt-0.5 block text-xs text-slate-400 dark:text-slate-500">{r.days} day{r.days === 1 ? "" : "s"}{r.slot !== "full" && ` (${r.slot} half)`}</span>
                  </span>
                ),
              },
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
        title="Cancel on-duty request?"
        message={`Withdraw your on-duty request for ${cancelTarget ? fmtDate(cancelTarget.from_date) : ""}?`}
        confirmLabel="Yes, cancel it"
      />
    </div>
  );
}
