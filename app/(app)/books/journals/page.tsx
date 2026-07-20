"use client";

import { useState } from "react";
import { NotebookPen, Plus, Trash2, Scale, Eye } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/swr";
import { fmtINR, fmtDate, todayStr } from "@/lib/format";
import { Badge, Button, Card, ConfirmModal, DataTable, Field, Input, Modal, PageHeader, PageLoader, Select, Textarea, useToast, cn } from "@/components/ui";

type Journal = { id: number; journal_date: string; reference: string | null; narration: string | null; amount: number; line_count: number };
type Account = { id: number; name: string; type: string; code: string | null };
type Line = { account_id: string; debit: string; credit: string; description: string };
type DetailLine = { id: number; account_id: number; account_name: string; account_code: string | null; debit: number; credit: number; description: string | null };

const blankLine = (): Line => ({ account_id: "", debit: "", credit: "", description: "" });
const r2 = (n: number) => Math.round(n * 100) / 100;

export default function JournalsPage() {
  const { data, reload } = useData<{ rows: Journal[] }>("/api/books/journals");
  const { data: coa } = useData<{ rows: Account[] }>("/api/books/coa");
  const [modal, setModal] = useState(false);
  const [date, setDate] = useState(todayStr());
  const [reference, setReference] = useState("");
  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState<Line[]>([blankLine(), blankLine()]);
  const [busy, setBusy] = useState(false);
  const [delTarget, setDelTarget] = useState<Journal | null>(null);
  const [view, setView] = useState<{ journal: Journal; lines: DetailLine[] } | null>(null);
  const toast = useToast();
  const rows = data?.rows;
  const accounts = coa?.rows || [];

  const totalDebit = r2(lines.reduce((s, l) => s + (Number(l.debit) || 0), 0));
  const totalCredit = r2(lines.reduce((s, l) => s + (Number(l.credit) || 0), 0));
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  const openNew = () => { setDate(todayStr()); setReference(""); setNarration(""); setLines([blankLine(), blankLine()]); setModal(true); };

  const save = async () => {
    if (!balanced) return toast.push("error", "Debits must equal credits");
    const clean = lines.filter((l) => l.account_id && (Number(l.debit) > 0 || Number(l.credit) > 0));
    if (clean.length < 2) return toast.push("error", "Add at least two account lines");
    setBusy(true);
    try {
      await api("/api/books/journals", { method: "POST", body: JSON.stringify({ journal_date: date, reference, narration, lines: clean }) });
      toast.push("success", "Journal posted ✓"); setModal(false); reload();
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };
  const openView = async (j: Journal) => {
    try { const d = await api<{ journal: Journal; lines: DetailLine[] }>(`/api/books/journals/${j.id}`); setView(d); }
    catch (e) { toast.push("error", e instanceof Error ? e.message : "Failed"); }
  };
  const remove = async () => {
    if (!delTarget) return;
    setBusy(true);
    try { await api(`/api/books/journals/${delTarget.id}`, { method: "DELETE" }); toast.push("success", "Journal deleted"); setDelTarget(null); reload(); }
    catch (e) { toast.push("error", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  if (!rows) return <PageLoader />;

  return (
    <div className="fade-up">
      <PageHeader title="Manual Journals" subtitle="Double-entry adjustments — every entry balances debits against credits" icon={<NotebookPen size={20} />}
        actions={<Button onClick={openNew}><Plus size={14} /> New Journal</Button>} />

      <Card title="Journal Entries" icon={<NotebookPen size={16} />}>
        <DataTable rows={rows} keyFor={(r) => r.id} empty={<p className="text-center text-sm text-slate-400">No journal entries yet.</p>}
          columns={[
            { key: "date", header: "Date", render: (r) => <span className="text-[13px] font-semibold">{fmtDate(r.journal_date)}</span> },
            { key: "ref", header: "Reference", render: (r) => <span className="text-[13px] font-bold text-slate-800 dark:text-slate-100">{r.reference || "—"}</span> },
            { key: "narration", header: "Narration", render: (r) => <span className="text-[13px] text-slate-600 dark:text-slate-300">{r.narration || "—"}</span> },
            { key: "lines", header: "Lines", className: "text-center", render: (r) => <Badge tone="EMPLOYEE">{r.line_count}</Badge> },
            { key: "amt", header: "Amount", className: "text-right", render: (r) => <span className="text-[13px] font-extrabold text-slate-900 dark:text-slate-100">{fmtINR(r.amount)}</span> },
            {
              key: "act", header: "", className: "text-right", render: (r) => (
                <span className="flex items-center justify-end gap-1">
                  <button onClick={() => openView(r)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-indigo-50 hover:text-indigo-600 dark:hover:bg-indigo-500/10" aria-label="View"><Eye size={15} /></button>
                  <button onClick={() => setDelTarget(r)} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10" aria-label="Delete"><Trash2 size={15} /></button>
                </span>
              ),
            },
          ]} />
      </Card>

      {/* New journal */}
      <Modal open={modal} onClose={() => setModal(false)} title="New Journal Entry" width="max-w-2xl">
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Field label="Date" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
            <Field label="Reference"><Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="JV-003" /></Field>
            <Field label="Narration"><Input value={narration} onChange={(e) => setNarration(e.target.value)} placeholder="What is this for?" /></Field>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/60">
                <tr><th className="px-3 py-2 text-left font-bold">Account</th><th className="px-3 py-2 text-right font-bold">Debit</th><th className="px-3 py-2 text-right font-bold">Credit</th><th className="w-8" /></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {lines.map((l, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5">
                      <Select value={l.account_id} onChange={(e) => setLine(i, { account_id: e.target.value })}>
                        <option value="">Select account…</option>
                        {accounts.map((a) => <option key={a.id} value={a.id}>{a.code ? `${a.code} · ` : ""}{a.name}</option>)}
                      </Select>
                    </td>
                    <td className="px-2 py-1.5"><Input type="number" min="0" className="text-right" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} placeholder="0" /></td>
                    <td className="px-2 py-1.5"><Input type="number" min="0" className="text-right" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} placeholder="0" /></td>
                    <td className="px-1">
                      {lines.length > 2 && <button onClick={() => setLines((ls) => ls.filter((_, idx) => idx !== i))} className="rounded p-1 text-slate-300 hover:text-rose-500" aria-label="Remove line"><Trash2 size={14} /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50/60 dark:border-slate-700 dark:bg-slate-800/40">
                <tr className="font-extrabold">
                  <td className="px-3 py-2 text-right text-slate-500">Totals</td>
                  <td className="px-3 py-2 text-right text-slate-900 dark:text-slate-100">{fmtINR(totalDebit)}</td>
                  <td className="px-3 py-2 text-right text-slate-900 dark:text-slate-100">{fmtINR(totalCredit)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button variant="outline" onClick={() => setLines((ls) => [...ls, blankLine()])}><Plus size={14} /> Add Line</Button>
            <span className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold", balanced ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300" : "bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300")}>
              <Scale size={14} /> {balanced ? "Balanced" : `Difference ${fmtINR(r2(totalDebit - totalCredit))}`}
            </span>
          </div>

          <div className="flex justify-end gap-2 pt-1"><Button variant="outline" onClick={() => setModal(false)}>Cancel</Button><Button onClick={save} loading={busy} disabled={!balanced}>Post Journal</Button></div>
        </div>
      </Modal>

      {/* View journal */}
      <Modal open={!!view} onClose={() => setView(null)} title={view?.journal.reference || "Journal Entry"} width="max-w-xl">
        {view && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="font-semibold text-slate-500">{fmtDate(view.journal.journal_date)}</span>
              {view.journal.narration && <span className="text-slate-600 dark:text-slate-300">{view.journal.narration}</span>}
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500 dark:bg-slate-800/60">
                  <tr><th className="px-3 py-2 text-left font-bold">Account</th><th className="px-3 py-2 text-right font-bold">Debit</th><th className="px-3 py-2 text-right font-bold">Credit</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {view.lines.map((l) => (
                    <tr key={l.id}>
                      <td className="px-3 py-2">
                        <span className="block text-[13px] font-bold text-slate-800 dark:text-slate-100">{l.account_code ? `${l.account_code} · ` : ""}{l.account_name}</span>
                        {l.description && <span className="block text-xs text-slate-400">{l.description}</span>}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-700 dark:text-slate-200">{l.debit ? fmtINR(l.debit) : "—"}</td>
                      <td className="px-3 py-2 text-right font-semibold text-slate-700 dark:text-slate-200">{l.credit ? fmtINR(l.credit) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal open={!!delTarget} onClose={() => setDelTarget(null)} onConfirm={remove} loading={busy} danger
        title="Delete journal?" message="This removes the entry and its ledger postings." confirmLabel="Delete" />
    </div>
  );
}
