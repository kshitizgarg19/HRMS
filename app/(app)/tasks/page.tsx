"use client";

import { useEffect, useMemo, useState } from "react";
import { ListTodo, Plus, Trash2, ArrowRight, ArrowLeft, CalendarClock, Flag } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, todayStr } from "@/lib/format";
import { Avatar, Badge, Button, Card, ConfirmModal, Field, Input, Modal, PageHeader, PageLoader, Select, Textarea, useToast, cn } from "@/components/ui";
import { useMe } from "@/components/shell";
import type { Task } from "@/lib/types";

type TaskRow = Task & { assignee_color?: string | null; assignee_dept?: string | null };

const COLUMNS: { key: Task["status"]; title: string; dot: string }[] = [
  { key: "To Do", title: "To Do", dot: "bg-slate-400" },
  { key: "In Progress", title: "In Progress", dot: "bg-sky-500" },
  { key: "Done", title: "Done", dot: "bg-emerald-500" },
];

const EMPTY = { title: "", category: "General", description: "", assigned_to: "", priority: "Medium", duration: "", due_date: "" };

export default function TasksPage() {
  const me = useMe();
  const isMgmt = me.role !== "EMPLOYEE";
  const [data, setData] = useState<{ rows: TaskRow[]; assignees: { id: number; name: string }[] } | null>(null);
  const [scope, setScope] = useState<"mine" | "all">("mine");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<TaskRow | null>(null);
  const toast = useToast();

  const load = (s = scope) =>
    api<{ rows: TaskRow[]; assignees: { id: number; name: string }[] }>(`/api/tasks${s === "all" ? "?all=1" : ""}`)
      .then(setData)
      .catch(() => {});
  useEffect(() => { load(scope); }, [scope]);

  const grouped = useMemo(() => {
    const g: Record<string, TaskRow[]> = { "To Do": [], "In Progress": [], Done: [] };
    (data?.rows || []).forEach((t) => g[t.status]?.push(t));
    return g;
  }, [data]);

  if (!data) return <PageLoader />;

  const move = async (t: TaskRow, dir: 1 | -1) => {
    const order: Task["status"][] = ["To Do", "In Progress", "Done"];
    const next = order[order.indexOf(t.status) + dir];
    if (!next) return;
    try {
      await api(`/api/tasks/${t.id}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      await load();
      if (next === "Done") toast.push("success", `"${t.title}" marked done 🎉`);
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Failed to update");
    }
  };

  const create = async () => {
    if (!form.title.trim() || !form.assigned_to) return toast.push("error", "Title and assignee are required");
    setBusy(true);
    try {
      await api("/api/tasks", { method: "POST", body: JSON.stringify(form) });
      toast.push("success", "Task assigned");
      setModal(false);
      setForm(EMPTY);
      await load();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Failed to create");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirmDel) return;
    setBusy(true);
    try {
      await api(`/api/tasks/${confirmDel.id}`, { method: "DELETE" });
      toast.push("success", "Task deleted");
      setConfirmDel(null);
      await load();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  };

  const overdue = (t: TaskRow) => t.due_date && t.status !== "Done" && t.due_date < todayStr();

  return (
    <div className="fade-up">
      <PageHeader
        title="Tasks"
        subtitle={scope === "all" ? "All tasks across the organization" : "Work assigned to you"}
        icon={<ListTodo size={20} />}
        actions={
          <span className="flex items-center gap-2">
            {isMgmt && (
              <Select value={scope} onChange={(e) => setScope(e.target.value as "mine" | "all")} className="!w-auto !py-2 text-xs font-bold">
                <option value="mine">My tasks</option>
                <option value="all">Everyone&apos;s tasks</option>
              </Select>
            )}
            {isMgmt && <Button onClick={() => setModal(true)}><Plus size={15} /> Assign Task</Button>}
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {COLUMNS.map((col) => (
          <div key={col.key} className="rounded-2xl border border-slate-200/70 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900/50 p-3">
            <p className="flex items-center gap-2 px-2 py-1.5 text-[12px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <span className={cn("size-2.5 rounded-full", col.dot)} />
              {col.title}
              <span className="ml-auto rounded-full bg-white dark:bg-slate-900 px-2 py-0.5 text-[11px] text-slate-400 dark:text-slate-500 ring-1 ring-slate-200 dark:ring-slate-700">{grouped[col.key].length}</span>
            </p>
            <div className="mt-1 space-y-2.5">
              {grouped[col.key].length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-white/60 dark:bg-slate-800/30 py-6 text-center text-xs font-semibold text-slate-300 dark:text-slate-600">No tasks</p>
              )}
              {grouped[col.key].map((t) => (
                <div key={t.id} className="group rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 shadow-sm transition hover:shadow-md">
                  <div className="flex items-start justify-between gap-2">
                    <p className={cn("text-[13.5px] font-bold leading-snug text-slate-800 dark:text-slate-100", t.status === "Done" && "text-slate-400 dark:text-slate-500 line-through")}>{t.title}</p>
                    <Badge tone={t.priority}><Flag size={9} /> {t.priority}</Badge>
                  </div>
                  {t.description && <p className="mt-1.5 line-clamp-2 text-xs leading-relaxed text-slate-500 dark:text-slate-400">{t.description}</p>}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Avatar name={t.assignee_name || "?"} color={t.assignee_color} size={22} />
                      <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">{(t.assignee_name || "").split(" ")[0]}</span>
                      <span className="text-[10px] text-slate-300">·</span>
                      <span className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-400 dark:text-slate-500">{t.category}</span>
                    </span>
                    {t.due_date && (
                      <span className={cn("flex items-center gap-1 text-[11px] font-bold", overdue(t) ? "text-rose-500 dark:text-rose-400" : "text-slate-400 dark:text-slate-500")}>
                        <CalendarClock size={11} /> {fmtDate(t.due_date).slice(0, 6)}{overdue(t) && " ⚠"}
                      </span>
                    )}
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 dark:border-slate-800 pt-2.5 opacity-0 transition group-hover:opacity-100">
                    <span className="flex gap-1">
                      {t.status !== "To Do" && (
                        <button onClick={() => move(t, -1)} className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-400 dark:text-slate-500 transition hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer">
                          <ArrowLeft size={11} /> Back
                        </button>
                      )}
                      {t.status !== "Done" && (
                        <button onClick={() => move(t, 1)} className="flex items-center gap-1 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 px-2 py-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-300 transition hover:bg-indigo-100 cursor-pointer">
                          {t.status === "To Do" ? "Start" : "Complete"} <ArrowRight size={11} />
                        </button>
                      )}
                    </span>
                    {isMgmt && (
                      <button onClick={() => setConfirmDel(t)} className="rounded-lg p-1.5 text-rose-400 transition hover:bg-rose-50 cursor-pointer">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="Assign New Task" subtitle="The assignee will see it on their board instantly">
        <div className="space-y-4">
          <Field label="Task Title" required><Input placeholder="e.g. Prepare Q3 hiring plan" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Description"><Textarea placeholder="Details, links, acceptance criteria…" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Assign To" required>
              <Select value={form.assigned_to} onChange={(e) => setForm({ ...form, assigned_to: e.target.value })}>
                <option value="">Select employee…</option>
                {data.assignees.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
            <Field label="Priority">
              <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                <option>Low</option><option>Medium</option><option>High</option><option>Urgent</option>
              </Select>
            </Field>
            <Field label="Category">
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {["General", "Engineering", "Design", "HR", "Finance", "Markets", "Quant", "Operations", "DevOps"].map((c) => <option key={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Due Date"><Input type="date" min={todayStr()} value={form.due_date} onChange={(e) => setForm({ ...form, due_date: e.target.value })} /></Field>
          </div>
          <Field label="Estimated Duration" hint="e.g. 3 days, 1 week"><Input value={form.duration} onChange={(e) => setForm({ ...form, duration: e.target.value })} /></Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={create} loading={busy}>Assign Task</Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={remove}
        loading={busy}
        danger
        title="Delete task?"
        message={`Delete "${confirmDel?.title}"? The assignee will no longer see it.`}
        confirmLabel="Delete"
      />
    </div>
  );
}
