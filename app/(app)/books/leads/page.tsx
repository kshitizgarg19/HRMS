"use client";

import { useMemo, useState } from "react";
import { Target, Plus, Trash2, UserPlus, IndianRupee, TrendingUp, Trophy, Mail, Phone, GripVertical } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/swr";
import { fmtINR } from "@/lib/format";
import { Badge, Button, Card, ConfirmModal, Field, Input, Modal, PageHeader, PageLoader, Select, StatCard, Textarea, useToast, cn } from "@/components/ui";

type Lead = {
  id: number; name: string; company: string | null; email: string | null; phone: string | null;
  source: string | null; stage: string; value: number; notes: string | null;
  owner_name: string | null; converted_party_id: number | null;
};

const STAGES = ["New", "Contacted", "Qualified", "Proposal", "Won", "Lost"] as const;
const SOURCES = ["Website", "Referral", "Cold Call", "Event", "Social", "Other"];
const STAGE_STYLE: Record<string, { dot: string; bar: string; soft: string }> = {
  New: { dot: "bg-slate-400", bar: "from-slate-400 to-slate-500", soft: "bg-slate-50 dark:bg-slate-800/40" },
  Contacted: { dot: "bg-sky-500", bar: "from-sky-500 to-cyan-500", soft: "bg-sky-50/60 dark:bg-sky-500/10" },
  Qualified: { dot: "bg-violet-500", bar: "from-violet-500 to-purple-500", soft: "bg-violet-50/60 dark:bg-violet-500/10" },
  Proposal: { dot: "bg-amber-500", bar: "from-amber-500 to-orange-500", soft: "bg-amber-50/60 dark:bg-amber-500/10" },
  Won: { dot: "bg-emerald-500", bar: "from-emerald-500 to-green-500", soft: "bg-emerald-50/60 dark:bg-emerald-500/10" },
  Lost: { dot: "bg-rose-500", bar: "from-rose-500 to-pink-500", soft: "bg-rose-50/60 dark:bg-rose-500/10" },
};
const EMPTY = { name: "", company: "", email: "", phone: "", source: "Website", stage: "New", value: "", notes: "" };

export default function LeadsPage() {
  const { data, reload } = useData<{ rows: Lead[] }>("/api/books/leads");
  const [form, setForm] = useState<typeof EMPTY & { id?: number }>(EMPTY);
  const [modal, setModal] = useState(false);
  const [view, setView] = useState<Lead | null>(null);
  const [busy, setBusy] = useState(false);
  const [delTarget, setDelTarget] = useState<Lead | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);
  const toast = useToast();
  const rows = data?.rows;

  const byStage = useMemo(() => {
    const m: Record<string, Lead[]> = {};
    for (const s of STAGES) m[s] = [];
    for (const l of rows || []) (m[l.stage] ||= (m[l.stage] || [])).push(l);
    return m;
  }, [rows]);

  const stats = useMemo(() => {
    const r = rows || [];
    const open = r.filter((l) => l.stage !== "Won" && l.stage !== "Lost");
    const won = r.filter((l) => l.stage === "Won");
    return {
      total: r.length,
      pipeline: open.reduce((s, l) => s + l.value, 0),
      wonCount: won.length,
      wonValue: won.reduce((s, l) => s + l.value, 0),
      conversion: r.length ? Math.round((won.length / r.length) * 100) : 0,
    };
  }, [rows]);

  if (!rows) return <PageLoader />;

  const save = async () => {
    if (!form.name.trim()) return toast.push("error", "Lead name is required");
    setBusy(true);
    try {
      const payload = { ...form, value: Number(form.value) || 0 };
      if (form.id) await api(`/api/books/leads/${form.id}`, { method: "PATCH", body: JSON.stringify(payload) });
      else await api("/api/books/leads", { method: "POST", body: JSON.stringify(payload) });
      toast.push("success", `Lead ${form.id ? "updated" : "added"} ✓`);
      setModal(false); reload();
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const moveStage = async (lead: Lead, stage: string) => {
    if (lead.stage === stage) return;
    try { await api(`/api/books/leads/${lead.id}`, { method: "PATCH", body: JSON.stringify({ stage }) }); reload(); }
    catch (e) { toast.push("error", e instanceof Error ? e.message : "Failed"); }
  };

  const convert = async (lead: Lead) => {
    setBusy(true);
    try {
      await api(`/api/books/leads/${lead.id}`, { method: "PATCH", body: JSON.stringify({ action: "convert" }) });
      toast.push("success", `${lead.name} converted to a customer ✓`);
      setView(null); reload();
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const del = async () => {
    if (!delTarget) return;
    setBusy(true);
    try { await api(`/api/books/leads/${delTarget.id}`, { method: "DELETE" }); toast.push("success", "Lead deleted"); setDelTarget(null); setView(null); reload(); }
    catch (e) { toast.push("error", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  const openEdit = (l: Lead) => {
    setForm({ id: l.id, name: l.name, company: l.company || "", email: l.email || "", phone: l.phone || "", source: l.source || "Website", stage: l.stage, value: String(l.value || ""), notes: l.notes || "" });
    setView(null); setModal(true);
  };

  return (
    <div className="fade-up">
      <PageHeader title="Leads" subtitle="Your sales pipeline — drag a lead across stages, then convert to a customer" icon={<Target size={20} />}
        actions={<Button onClick={() => { setForm(EMPTY); setModal(true); }}><Plus size={15} /> New Lead</Button>} />

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total Leads" value={stats.total} icon={<Target size={20} />} accent="indigo" />
        <StatCard label="Pipeline Value" value={fmtINR(stats.pipeline)} icon={<IndianRupee size={20} />} accent="violet" sub="open deals" />
        <StatCard label="Won" value={fmtINR(stats.wonValue)} icon={<Trophy size={20} />} accent="emerald" sub={`${stats.wonCount} deals`} />
        <StatCard label="Conversion" value={`${stats.conversion}%`} icon={<TrendingUp size={20} />} accent="amber" sub="won / total" />
      </div>

      {/* Kanban board */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {STAGES.map((stage) => {
          const list = byStage[stage] || [];
          const total = list.reduce((s, l) => s + l.value, 0);
          const st = STAGE_STYLE[stage];
          return (
            <div
              key={stage}
              onDragOver={(e) => { e.preventDefault(); setOverStage(stage); }}
              onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
              onDrop={() => { const l = rows.find((x) => x.id === dragId); if (l) moveStage(l, stage); setDragId(null); setOverStage(null); }}
              className={cn("flex flex-col rounded-2xl border p-2 transition-colors", overStage === stage ? "border-indigo-400 bg-indigo-50/50 dark:bg-indigo-500/10" : "border-slate-200/70 dark:border-slate-800/70", st.soft)}
            >
              <div className="mb-2 flex items-center justify-between px-1.5 pt-1">
                <span className="flex items-center gap-1.5 text-[13px] font-extrabold text-slate-700 dark:text-slate-200"><span className={cn("size-2 rounded-full", st.dot)} /> {stage}</span>
                <span className="rounded-full bg-white/70 px-1.5 text-[11px] font-bold text-slate-500 dark:bg-slate-900/50 dark:text-slate-400">{list.length}</span>
              </div>
              <div className={cn("mb-2 h-1 rounded-full bg-gradient-to-r", st.bar)} />
              <p className="mb-2 px-1.5 text-[11px] font-semibold text-slate-400">{fmtINR(total)}</p>

              <div className="flex min-h-[60px] flex-col gap-2">
                {list.map((l) => (
                  <button
                    key={l.id}
                    draggable
                    onDragStart={() => setDragId(l.id)}
                    onDragEnd={() => { setDragId(null); setOverStage(null); }}
                    onClick={() => setView(l)}
                    className={cn("lux-card group cursor-grab rounded-xl border border-slate-200/70 p-3 text-left active:cursor-grabbing dark:border-slate-800/70", dragId === l.id && "opacity-40")}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <span className="text-[13px] font-bold text-slate-800 dark:text-slate-100">{l.name}</span>
                      <GripVertical size={13} className="mt-0.5 shrink-0 text-slate-300 transition group-hover:text-slate-400" />
                    </div>
                    {l.company && <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{l.company}</span>}
                    <div className="mt-1.5 flex items-center justify-between">
                      <span className="text-[13px] font-extrabold text-indigo-600 dark:text-indigo-400">{fmtINR(l.value)}</span>
                      {l.source && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">{l.source}</span>}
                    </div>
                    {l.converted_party_id && <span className="mt-1.5 inline-flex"><Badge tone="Paid">Customer ✓</Badge></span>}
                  </button>
                ))}
                {list.length === 0 && <p className="px-1.5 py-3 text-center text-[11px] text-slate-400">Drop leads here</p>}
              </div>
            </div>
          );
        })}
      </div>

      {/* New / edit lead */}
      <Modal open={modal} onClose={() => setModal(false)} title={form.id ? "Edit Lead" : "New Lead"} width="max-w-lg">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Company"><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="Source"><Select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>{SOURCES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
            <Field label="Stage"><Select value={form.stage} onChange={(e) => setForm({ ...form, stage: e.target.value })}>{STAGES.map((s) => <option key={s}>{s}</option>)}</Select></Field>
            <Field label="Deal Value (₹)"><Input type="number" min="0" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></Field>
          </div>
          <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <div className="flex justify-end gap-2 pt-1"><Button variant="outline" onClick={() => setModal(false)}>Cancel</Button><Button onClick={save} loading={busy}>Save Lead</Button></div>
        </div>
      </Modal>

      {/* Lead detail */}
      <Modal open={!!view} onClose={() => setView(null)} title={view?.name || "Lead"} subtitle={view?.company || ""} width="max-w-md">
        {view && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300"><span className={cn("size-2 rounded-full", STAGE_STYLE[view.stage].dot)} /> {view.stage}</span>
              {view.source && <Badge tone="EMPLOYEE">{view.source}</Badge>}
              <span className="ml-auto text-lg font-extrabold text-indigo-600 dark:text-indigo-400">{fmtINR(view.value)}</span>
            </div>
            <div className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-[13px] dark:bg-slate-800/50">
              {view.email && <p className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><Mail size={13} /> {view.email}</p>}
              {view.phone && <p className="flex items-center gap-2 text-slate-600 dark:text-slate-300"><Phone size={13} /> {view.phone}</p>}
              {view.owner_name && <p className="text-xs text-slate-400">Owner · {view.owner_name}</p>}
            </div>
            {view.notes && <p className="rounded-xl border border-slate-100 p-3 text-[13px] text-slate-600 dark:border-slate-800 dark:text-slate-300">{view.notes}</p>}
            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
              <Button variant="outline" onClick={() => setDelTarget(view)}><Trash2 size={14} /> Delete</Button>
              <Button variant="outline" onClick={() => openEdit(view)}>Edit</Button>
              {!view.converted_party_id
                ? <Button variant="success" loading={busy} onClick={() => convert(view)}><UserPlus size={14} /> Convert to Customer</Button>
                : <Badge tone="Paid">Already a customer</Badge>}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal open={!!delTarget} onClose={() => setDelTarget(null)} onConfirm={del} loading={busy} danger title={`Delete ${delTarget?.name}?`} message="This removes the lead from your pipeline." confirmLabel="Delete" />
    </div>
  );
}
