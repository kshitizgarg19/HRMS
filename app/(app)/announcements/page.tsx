"use client";

import { useEffect, useState } from "react";
import { Megaphone, Plus, Pin, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { Avatar, Button, Card, ConfirmModal, Field, Input, Modal, PageHeader, PageLoader, Textarea, useToast, cn } from "@/components/ui";
import { useMe } from "@/components/shell";
import type { Announcement } from "@/lib/types";

type Ann = Announcement & { author_color?: string | null; author_designation?: string | null };

export default function AnnouncementsPage() {
  const me = useMe();
  const isMgmt = me.role !== "EMPLOYEE";
  const [rows, setRows] = useState<Ann[] | null>(null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", pinned: false });
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Ann | null>(null);
  const toast = useToast();

  const load = () => api<{ rows: Ann[] }>("/api/announcements").then((d) => setRows(d.rows)).catch(() => {});
  useEffect(() => { load(); }, []);

  if (!rows) return <PageLoader />;

  const submit = async () => {
    if (!form.title.trim() || !form.body.trim()) return toast.push("error", "Title and message are required");
    setBusy(true);
    try {
      await api("/api/announcements", { method: "POST", body: JSON.stringify(form) });
      toast.push("success", "Announcement published 📣");
      setModal(false);
      setForm({ title: "", body: "", pinned: false });
      await load();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Failed to publish");
    } finally {
      setBusy(false);
    }
  };

  const togglePin = async (a: Ann) => {
    try {
      await api(`/api/announcements/${a.id}`, { method: "PUT", body: JSON.stringify({ title: a.title, body: a.body, pinned: a.pinned ? 0 : 1 }) });
      await load();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Failed");
    }
  };

  const remove = async () => {
    if (!confirmDel) return;
    setBusy(true);
    try {
      await api(`/api/announcements/${confirmDel.id}`, { method: "DELETE" });
      toast.push("success", "Announcement deleted");
      setConfirmDel(null);
      await load();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fade-up">
      <PageHeader
        title="Announcements"
        subtitle="Company news, policies and updates"
        icon={<Megaphone size={20} />}
        actions={isMgmt ? <Button onClick={() => setModal(true)}><Plus size={15} /> New Announcement</Button> : undefined}
      />

      <div className="mx-auto max-w-3xl space-y-4">
        {rows.length === 0 && (
          <Card><p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">No announcements yet.</p></Card>
        )}
        {rows.map((a) => (
          <div key={a.id} className={cn("group rounded-2xl border bg-white dark:bg-slate-900 p-6 shadow-sm transition hover:shadow-md", a.pinned ? "border-amber-300 ring-2 ring-amber-100" : "border-slate-200/80 dark:border-slate-800")}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <Avatar name={a.author_name || "?"} color={a.author_color} size={40} />
                <div>
                  <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{a.author_name}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    {a.author_designation || "—"} · {new Date(a.created_at + "Z").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                  </p>
                </div>
              </div>
              <span className="flex items-center gap-1">
                {a.pinned ? <span className="rounded-full bg-amber-100 dark:bg-amber-500/15 px-2.5 py-1 text-[11px] font-extrabold text-amber-700 dark:text-amber-300">📌 Pinned</span> : null}
                {isMgmt && (
                  <span className="flex gap-1 opacity-0 transition group-hover:opacity-100">
                    <button onClick={() => togglePin(a)} title={a.pinned ? "Unpin" : "Pin"} className="rounded-lg p-2 text-amber-500 hover:bg-amber-50 cursor-pointer"><Pin size={14} /></button>
                    <button onClick={() => setConfirmDel(a)} className="rounded-lg p-2 text-rose-500 dark:text-rose-400 hover:bg-rose-50 cursor-pointer"><Trash2 size={14} /></button>
                  </span>
                )}
              </span>
            </div>
            <h3 className="mt-4 text-lg font-extrabold tracking-tight text-slate-900 dark:text-slate-100">{a.title}</h3>
            <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-600 dark:text-slate-300">{a.body}</p>
          </div>
        ))}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="New Announcement" subtitle="Visible to everyone in the organization">
        <div className="space-y-4">
          <Field label="Title" required><Input placeholder="e.g. Office closed on Friday" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Message" required><Textarea rows={5} placeholder="Write the announcement…" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} /></Field>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
            <input type="checkbox" checked={form.pinned} onChange={(e) => setForm({ ...form, pinned: e.target.checked })} className="size-4 accent-indigo-600" />
            Pin to top
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={submit} loading={busy}>Publish</Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={remove}
        loading={busy}
        danger
        title="Delete announcement?"
        message={`Delete "${confirmDel?.title}" for everyone?`}
        confirmLabel="Delete"
      />
    </div>
  );
}
