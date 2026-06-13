"use client";

import { useEffect, useMemo, useState } from "react";
import { PartyPopper, Plus, Pencil, Trash2, CalendarDays } from "lucide-react";
import { api } from "@/lib/api";
import { todayStr, MONTHS, fmtDateLong } from "@/lib/format";
import { Badge, Button, Card, ConfirmModal, Field, Input, Modal, PageHeader, PageLoader, Select, useToast, cn } from "@/components/ui";
import { useMe } from "@/components/shell";
import type { Holiday } from "@/lib/types";

const EMPTY = { name: "", date: "", type: "Public", description: "" };

export default function HolidaysPage() {
  const me = useMe();
  const isMgmt = me.role !== "EMPLOYEE";
  const [rows, setRows] = useState<Holiday[] | null>(null);
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<Holiday | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [confirmDel, setConfirmDel] = useState<Holiday | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = () => api<{ rows: Holiday[] }>("/api/holidays").then((d) => setRows(d.rows)).catch(() => {});
  useEffect(() => { load(); }, []);

  const { upcoming, past } = useMemo(() => {
    const t = todayStr();
    return {
      upcoming: (rows || []).filter((h) => h.date >= t),
      past: (rows || []).filter((h) => h.date < t).reverse(),
    };
  }, [rows]);

  if (!rows) return <PageLoader />;

  const openNew = () => { setEditing(null); setForm(EMPTY); setModal(true); };
  const openEdit = (h: Holiday) => { setEditing(h); setForm({ name: h.name, date: h.date, type: h.type, description: h.description || "" }); setModal(true); };

  const submit = async () => {
    if (!form.name.trim() || !form.date) return toast.push("error", "Name and date are required");
    setBusy(true);
    try {
      if (editing) {
        await api(`/api/holidays/${editing.id}`, { method: "PUT", body: JSON.stringify(form) });
        toast.push("success", "Holiday updated");
      } else {
        await api("/api/holidays", { method: "POST", body: JSON.stringify(form) });
        toast.push("success", "Holiday added to the calendar");
      }
      setModal(false);
      await load();
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
      await api(`/api/holidays/${confirmDel.id}`, { method: "DELETE" });
      toast.push("success", "Holiday removed");
      setConfirmDel(null);
      await load();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  };

  const HolidayCard = ({ h, dim }: { h: Holiday; dim?: boolean }) => (
    <div className={cn("group flex items-center gap-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm transition hover:shadow-md", dim && "opacity-60")}>
      <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:from-violet-500/15 dark:to-fuchsia-500/10 text-center ring-1 ring-violet-100 dark:ring-violet-500/20">
        <span>
          <span className="block text-xl font-extrabold leading-none text-violet-700 dark:text-violet-300">{h.date.slice(8)}</span>
          <span className="block text-[10px] font-bold uppercase text-slate-400 dark:text-slate-500">{MONTHS[Number(h.date.slice(5, 7)) - 1].slice(0, 3)}</span>
        </span>
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-extrabold text-slate-800 dark:text-slate-100">{h.name}</p>
        <p className="truncate text-xs text-slate-400 dark:text-slate-500">{fmtDateLong(h.date)}{h.description ? ` · ${h.description}` : ""}</p>
      </div>
      <Badge tone={h.type}>{h.type}</Badge>
      {isMgmt && (
        <span className="flex gap-1 opacity-0 transition group-hover:opacity-100">
          <button onClick={() => openEdit(h)} className="rounded-lg p-2 text-indigo-500 hover:bg-indigo-50 cursor-pointer"><Pencil size={14} /></button>
          <button onClick={() => setConfirmDel(h)} className="rounded-lg p-2 text-rose-500 dark:text-rose-400 hover:bg-rose-50 cursor-pointer"><Trash2 size={14} /></button>
        </span>
      )}
    </div>
  );

  return (
    <div className="fade-up">
      <PageHeader
        title="Holiday Calendar"
        subtitle={`${rows.length} holidays this year · ${upcoming.length} still to come`}
        icon={<PartyPopper size={20} />}
        actions={isMgmt ? <Button onClick={openNew}><Plus size={15} /> Add Holiday</Button> : undefined}
      />

      <div className="space-y-6">
        <Card title="Upcoming" icon={<CalendarDays size={16} />}>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {upcoming.map((h) => <HolidayCard key={h.id} h={h} />)}
            {upcoming.length === 0 && <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">No more holidays this year 😅</p>}
          </div>
        </Card>
        {past.length > 0 && (
          <Card title="Past Holidays" icon={<CalendarDays size={16} />}>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              {past.map((h) => <HolidayCard key={h.id} h={h} dim />)}
            </div>
          </Card>
        )}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={editing ? "Edit Holiday" : "Add Holiday"}>
        <div className="space-y-4">
          <Field label="Holiday Name" required><Input placeholder="e.g. Diwali" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date" required><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Type">
              <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                <option>Public</option><option>Optional</option>
              </Select>
            </Field>
          </div>
          <Field label="Description"><Input placeholder="Short note (optional)" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={submit} loading={busy}>{editing ? "Save" : "Add Holiday"}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={remove}
        loading={busy}
        danger
        title="Remove holiday?"
        message={`Remove "${confirmDel?.name}" from the calendar? Leave-day calculations will change for future requests.`}
        confirmLabel="Remove"
      />
    </div>
  );
}
