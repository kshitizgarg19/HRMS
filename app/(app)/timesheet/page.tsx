"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock4, Plus, Pencil, Trash2, CalendarDays, Timer, Hourglass } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/swr";
import { fmtDate, todayStr, weekday } from "@/lib/format";
import { Badge, Button, Card, ConfirmModal, DataTable, Field, Input, Modal, PageHeader, PageLoader, Select, StatCard, Textarea, useToast } from "@/components/ui";
import type { Timesheet } from "@/lib/types";

const EMPTY = { date: todayStr(), location: "Work From Office", tasks: "", hours: "8" };

export default function TimesheetPage() {
  const { data, reload } = useData<{ rows: Timesheet[] }>("/api/timesheets");
  const rows = data?.rows;
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Timesheet | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [confirmDel, setConfirmDel] = useState<Timesheet | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const stats = useMemo(() => {
    if (!rows) return { month: 0, entries: 0, pending: 0, approved: 0 };
    const m = todayStr().slice(0, 7);
    return {
      month: rows.filter((r) => r.date.startsWith(m)).reduce((s, r) => s + r.hours, 0),
      entries: rows.length,
      pending: rows.filter((r) => r.status === "Pending").length,
      approved: rows.filter((r) => r.status === "Approved").length,
    };
  }, [rows]);

  if (!rows) return <PageLoader />;

  const openNew = () => { setEditing(null); setForm(EMPTY); setModal(true); };
  const openEdit = (t: Timesheet) => {
    setEditing(t);
    setForm({ date: t.date, location: t.location, tasks: t.tasks, hours: String(t.hours) });
    setModal(true);
  };

  const submit = async () => {
    if (!form.tasks.trim()) return toast.push("error", "Describe what you worked on");
    setBusy(true);
    try {
      if (editing) {
        await api(`/api/timesheets/${editing.id}`, { method: "PUT", body: JSON.stringify(form) });
        toast.push("success", "Timesheet updated");
      } else {
        await api("/api/timesheets", { method: "POST", body: JSON.stringify(form) });
        toast.push("success", "Timesheet logged");
      }
      setModal(false);
      await reload();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirmDel) return;
    setBusy(true);
    try {
      await api(`/api/timesheets/${confirmDel.id}`, { method: "DELETE" });
      toast.push("success", "Entry deleted");
      setConfirmDel(null);
      await reload();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fade-up">
      <PageHeader
        title="Timesheet"
        subtitle="Log and track your daily work activities"
        icon={<Clock4 size={20} />}
        actions={<Button onClick={openNew}><Plus size={15} /> Add Timesheet</Button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Hours This Month" value={`${Math.round(stats.month * 10) / 10}h`} icon={<Timer size={20} />} accent="indigo" />
        <StatCard label="Total Entries" value={stats.entries} icon={<CalendarDays size={20} />} accent="violet" />
        <StatCard label="Pending Review" value={stats.pending} icon={<Hourglass size={20} />} accent="amber" />
        <StatCard label="Approved" value={stats.approved} icon={<Clock4 size={20} />} accent="emerald" />
      </div>

      <Card title="My Timesheets" icon={<Clock4 size={16} />} action={<span className="text-xs font-semibold text-slate-400 dark:text-slate-500">{rows.length} records</span>}>
        <DataTable
          rows={rows}
          keyFor={(r) => r.id}
          empty={<p className="text-center text-sm text-slate-400 dark:text-slate-500">No timesheets yet — log your first day&apos;s work.</p>}
          columns={[
            {
              key: "date", header: "Date",
              render: (r) => (
                <span className="flex items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-indigo-50 dark:bg-indigo-500/15 text-center">
                    <span>
                      <span className="block text-sm font-extrabold leading-none text-indigo-700 dark:text-indigo-300">{r.date.slice(8)}</span>
                      <span className="block text-[8.5px] font-bold uppercase text-indigo-400">{new Date(r.date + "T00:00:00").toLocaleDateString("en-IN", { month: "short" })}</span>
                    </span>
                  </span>
                  <span>
                    <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">{fmtDate(r.date)}</span>
                    <span className="block text-xs text-slate-400 dark:text-slate-500">{weekday(r.date)}</span>
                  </span>
                </span>
              ),
            },
            { key: "loc", header: "Location", render: (r) => <Badge tone={r.location.includes("Home") ? "WFH" : "WFO"}>{r.location}</Badge> },
            { key: "tasks", header: "Tasks", className: "max-w-[320px]", render: (r) => <span className="line-clamp-2 text-[13px] leading-snug">{r.tasks}</span> },
            { key: "hours", header: "Hours", render: (r) => <span className="font-extrabold text-slate-800 dark:text-slate-100">{r.hours}h</span> },
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
              key: "actions", header: "", className: "text-right",
              render: (r) =>
                r.status === "Pending" ? (
                  <span className="flex justify-end gap-1">
                    <button onClick={() => openEdit(r)} className="rounded-lg p-2 text-indigo-500 transition hover:bg-indigo-50 cursor-pointer"><Pencil size={15} /></button>
                    <button onClick={() => setConfirmDel(r)} className="rounded-lg p-2 text-rose-500 dark:text-rose-400 transition hover:bg-rose-50 cursor-pointer"><Trash2 size={15} /></button>
                  </span>
                ) : null,
            },
          ]}
        />
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? "Edit Timesheet" : "Add Timesheet"} subtitle="What did you work on?">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date" required><Input type="date" max={todayStr()} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Hours" required><Input type="number" min="0.5" max="24" step="0.5" value={form.hours} onChange={(e) => setForm({ ...form, hours: e.target.value })} /></Field>
          </div>
          <Field label="Location" required>
            <Select value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })}>
              <option>Work From Office</option>
              <option>Work From Home</option>
              <option>Client Site</option>
              <option>On Field</option>
            </Select>
          </Field>
          <Field label="Tasks" required hint="Brief summary of the day's work">
            <Textarea rows={4} placeholder="e.g. Deployed payment service, fixed OTR handler bug, reviewed 3 PRs…" value={form.tasks} onChange={(e) => setForm({ ...form, tasks: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={submit} loading={busy}>{editing ? "Save Changes" : "Submit Entry"}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={remove}
        loading={busy}
        danger
        title="Delete timesheet entry?"
        message={`This will permanently remove the entry for ${confirmDel ? fmtDate(confirmDel.date) : ""}. This can't be undone.`}
        confirmLabel="Delete"
      />
    </div>
  );
}
