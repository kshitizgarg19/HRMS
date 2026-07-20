"use client";

import { useMemo, useState } from "react";
import { RefreshCw, Plus, X, Trash2, Zap, Pause, Play, CalendarClock } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/swr";
import { fmtDate, fmtINR, todayStr } from "@/lib/format";
import { Badge, Button, Card, ConfirmModal, DataTable, Field, Input, Modal, PageHeader, PageLoader, Select, StatCard, Textarea, useToast } from "@/components/ui";
import type { BooksItem, BooksParty } from "@/lib/types";

type Recurring = { id: number; party_id: number; party_name: string | null; frequency: string; next_date: string; total: number; active: number; last_generated: string | null; notes: string | null };
type Line = { item_id: number | null; name: string; qty: number | string; rate: number | string; tax_rate: number | string };

export default function RecurringPage() {
  const { data, reload } = useData<{ rows: Recurring[] }>("/api/books/recurring");
  const { data: itemsD } = useData<{ rows: BooksItem[] }>("/api/books/items");
  const { data: custD } = useData<{ rows: BooksParty[] }>("/api/books/parties?type=customer");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ party_id: "", frequency: "monthly", next_date: todayStr(), notes: "" });
  const [lines, setLines] = useState<Line[]>([{ item_id: null, name: "", qty: 1, rate: 0, tax_rate: 18 }]);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Recurring | null>(null);
  const toast = useToast();
  const rows = data?.rows;
  const items = itemsD?.rows || [];

  const total = useMemo(() => lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.rate) || 0) * (1 + (Number(l.tax_rate) || 0) / 100), 0), [lines]);
  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pickItem = (i: number, val: string) => { const it = items.find((x) => x.id === Number(val)); if (it) setLine(i, { item_id: it.id, name: it.name, rate: it.rate, tax_rate: it.tax_rate }); else setLine(i, { item_id: null }); };

  const save = async () => {
    if (!form.party_id) return toast.push("error", "Select a customer");
    const clean = lines.filter((l) => String(l.name).trim() && Number(l.qty) > 0);
    if (!clean.length) return toast.push("error", "Add a line item");
    setBusy(true);
    try { await api("/api/books/recurring", { method: "POST", body: JSON.stringify({ ...form, party_id: Number(form.party_id), lines: clean }) }); toast.push("success", "Recurring profile created ✓"); setModal(false); setLines([{ item_id: null, name: "", qty: 1, rate: 0, tax_rate: 18 }]); setForm({ party_id: "", frequency: "monthly", next_date: todayStr(), notes: "" }); reload(); }
    catch (e) { toast.push("error", e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); }
  };
  const generate = async (r: Recurring) => { setBusy(true); try { const res = await api<{ number: string }>(`/api/books/recurring/${r.id}`, { method: "PATCH", body: JSON.stringify({ action: "generate" }) }); toast.push("success", `Invoice ${res.number} generated ✓`); reload(); } catch (e) { toast.push("error", e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); } };
  const toggle = async (r: Recurring) => { try { await api(`/api/books/recurring/${r.id}`, { method: "PATCH", body: JSON.stringify({ action: "toggle" }) }); reload(); } catch { /* ignore */ } };
  const del = async () => { if (!confirmDel) return; setBusy(true); try { await api(`/api/books/recurring/${confirmDel.id}`, { method: "DELETE" }); toast.push("success", "Deleted"); setConfirmDel(null); reload(); } catch (e) { toast.push("error", e instanceof Error ? e.message : "Failed"); } finally { setBusy(false); } };

  if (!rows) return <PageLoader />;
  const dueCount = rows.filter((r) => r.active && r.next_date <= todayStr()).length;

  return (
    <div className="fade-up">
      <PageHeader title="Recurring Invoices" subtitle="Auto-bill customers on a schedule" icon={<RefreshCw size={20} />}
        actions={<Button onClick={() => setModal(true)}><Plus size={15} /> New Profile</Button>} />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Active Profiles" value={rows.filter((r) => r.active).length} icon={<RefreshCw size={20} />} accent="indigo" />
        <StatCard label="Due Now" value={dueCount} icon={<CalendarClock size={20} />} accent="amber" sub="ready to generate" />
      </div>

      <Card title="Recurring Profiles" icon={<RefreshCw size={16} />}>
        <DataTable rows={rows} keyFor={(r) => r.id} empty={<p className="text-center text-sm text-slate-400">No recurring profiles yet.</p>}
          columns={[
            { key: "cust", header: "Customer", render: (r) => <span className="text-[13px] font-bold text-slate-800 dark:text-slate-100">{r.party_name || "—"}</span> },
            { key: "freq", header: "Frequency", render: (r) => <Badge tone="EMPLOYEE">{r.frequency}</Badge> },
            { key: "next", header: "Next Invoice", render: (r) => <span className={cnDue(r.next_date)}>{fmtDate(r.next_date)}</span> },
            { key: "total", header: "Amount", render: (r) => <span className="font-extrabold">{fmtINR(r.total)}</span> },
            { key: "status", header: "Status", render: (r) => <Badge tone={r.active ? "Approved" : "Cancelled"}>{r.active ? "Active" : "Paused"}</Badge> },
            {
              key: "act", header: "", className: "text-right", render: (r) => (
                <span className="flex justify-end gap-1.5">
                  <button onClick={() => generate(r)} disabled={busy} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 cursor-pointer dark:bg-emerald-500/15 dark:text-emerald-300" title="Generate invoice now"><Zap size={13} /> Generate</button>
                  <button onClick={() => toggle(r)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 cursor-pointer dark:hover:bg-slate-800" title={r.active ? "Pause" : "Resume"}>{r.active ? <Pause size={15} /> : <Play size={15} />}</button>
                  <button onClick={() => setConfirmDel(r)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 cursor-pointer dark:hover:bg-rose-500/15"><Trash2 size={15} /></button>
                </span>
              ),
            },
          ]} />
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="New Recurring Profile" subtitle="An invoice auto-bills on each cycle" width="max-w-2xl">
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Customer" required><Select value={form.party_id} onChange={(e) => setForm({ ...form, party_id: e.target.value })}><option value="">Select…</option>{(custD?.rows || []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
            <Field label="Frequency"><Select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="quarterly">Quarterly</option></Select></Field>
            <Field label="Next Invoice Date"><Input type="date" value={form.next_date} onChange={(e) => setForm({ ...form, next_date: e.target.value })} /></Field>
          </div>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-2 dark:border-slate-800">
                <Select value={l.item_id ?? ""} onChange={(e) => pickItem(i, e.target.value)} className="min-w-[150px] flex-1 !py-2"><option value="">— Custom —</option>{items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}</Select>
                <Input placeholder="Description" value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} className="min-w-[120px] flex-1 !py-2" />
                <Input type="number" min="0" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} className="!w-16 !py-2" title="Qty" />
                <Input type="number" min="0" value={l.rate} onChange={(e) => setLine(i, { rate: e.target.value })} className="!w-24 !py-2" title="Rate" />
                <Input type="number" min="0" value={l.tax_rate} onChange={(e) => setLine(i, { tax_rate: e.target.value })} className="!w-16 !py-2" title="GST%" />
                <button onClick={() => setLines((ls) => ls.length > 1 ? ls.filter((_, j) => j !== i) : ls)} className="rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 cursor-pointer dark:hover:bg-rose-500/15"><X size={15} /></button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { item_id: null, name: "", qty: 1, rate: 0, tax_rate: 18 }])}><Plus size={14} /> Add line</Button>
              <span className="text-sm font-bold text-slate-700 dark:text-slate-200">Total per cycle: {fmtINR(Math.round(total))}</span>
            </div>
          </div>
          <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setModal(false)}>Cancel</Button><Button onClick={save} loading={busy}>Create Profile</Button></div>
        </div>
      </Modal>

      <ConfirmModal open={!!confirmDel} onClose={() => setConfirmDel(null)} onConfirm={del} loading={busy} danger title="Delete recurring profile?" message="It stops auto-billing this customer." confirmLabel="Delete" />
    </div>
  );
}

function cnDue(date: string) {
  return date <= todayStr() ? "text-[13px] font-bold text-amber-600 dark:text-amber-300" : "text-[13px] font-semibold text-slate-600 dark:text-slate-300";
}
