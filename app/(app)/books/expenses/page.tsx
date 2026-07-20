"use client";

import { useMemo, useState } from "react";
import { Wallet, Plus, Trash2, IndianRupee, CalendarDays } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/swr";
import { fmtDate, fmtINR, todayStr } from "@/lib/format";
import { Badge, Button, Card, ConfirmModal, DataTable, Field, Input, Modal, PageHeader, PageLoader, Select, StatCard, Textarea, useToast } from "@/components/ui";
import type { BooksParty } from "@/lib/types";

type Expense = { id: number; expense_date: string; category: string; vendor_id: number | null; vendor_name: string | null; amount: number; tax: number; total: number; payment_mode: string | null; reference: string | null; notes: string | null };
const CATEGORIES = ["Office Rent", "Salaries", "Software Subscriptions", "Utilities", "Travel", "Marketing", "Internet & Phone", "Office Supplies", "Professional Fees", "Bank Charges", "Repairs & Maintenance", "Miscellaneous"];
const EMPTY = { expense_date: todayStr(), category: "Office Supplies", vendor_id: "", amount: "", tax: "", payment_mode: "Bank Transfer", reference: "", notes: "" };
const MODES = ["Bank Transfer", "UPI", "Cash", "Card", "Cheque"];

export default function ExpensesPage() {
  const { data, reload } = useData<{ rows: Expense[] }>("/api/books/expenses");
  const { data: vendorsD } = useData<{ rows: BooksParty[] }>("/api/books/parties?type=vendor");
  const [form, setForm] = useState(EMPTY);
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Expense | null>(null);
  const toast = useToast();
  const rows = data?.rows;

  const stats = useMemo(() => {
    const r = rows || [];
    const month = todayStr().slice(0, 7);
    return { total: r.reduce((s, x) => s + x.total, 0), monthTotal: r.filter((x) => x.expense_date.startsWith(month)).reduce((s, x) => s + x.total, 0), count: r.length };
  }, [rows]);

  const save = async () => {
    if (!form.amount || Number(form.amount) <= 0) return toast.push("error", "Enter a valid amount");
    setBusy(true);
    try { await api("/api/books/expenses", { method: "POST", body: JSON.stringify(form) }); toast.push("success", "Expense recorded ✓"); setModal(false); setForm(EMPTY); reload(); }
    catch (e) { toast.push("error", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };
  const del = async () => {
    if (!confirmDel) return;
    setBusy(true);
    try { await api(`/api/books/expenses/${confirmDel.id}`, { method: "DELETE" }); toast.push("success", "Expense deleted"); setConfirmDel(null); reload(); }
    catch (e) { toast.push("error", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  if (!rows) return <PageLoader />;

  return (
    <div className="fade-up">
      <PageHeader title="Expenses" subtitle="Record and categorise business spending" icon={<Wallet size={20} />}
        actions={<Button onClick={() => { setForm(EMPTY); setModal(true); }}><Plus size={15} /> New Expense</Button>} />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Total Expenses" value={fmtINR(stats.total)} icon={<IndianRupee size={20} />} accent="rose" sub={`${stats.count} entries`} />
        <StatCard label="This Month" value={fmtINR(stats.monthTotal)} icon={<CalendarDays size={20} />} accent="amber" />
      </div>

      <Card title="Expenses" icon={<Wallet size={16} />}>
        <DataTable rows={rows} keyFor={(r) => r.id} empty={<p className="text-center text-sm text-slate-400">No expenses yet.</p>}
          columns={[
            { key: "date", header: "Date", render: (r) => <span className="text-[13px] font-semibold">{fmtDate(r.expense_date)}</span> },
            { key: "cat", header: "Category", render: (r) => <Badge tone="EMPLOYEE">{r.category}</Badge> },
            { key: "vendor", header: "Paid To", render: (r) => <span className="text-[13px] text-slate-600 dark:text-slate-300">{r.vendor_name || "—"}</span> },
            { key: "mode", header: "Mode", render: (r) => <span className="text-xs text-slate-500 dark:text-slate-400">{r.payment_mode || "—"}{r.reference ? ` · ${r.reference}` : ""}</span> },
            { key: "amt", header: "Amount", render: (r) => <span className="font-extrabold text-rose-600 dark:text-rose-400">{fmtINR(r.total)}</span> },
            { key: "act", header: "", className: "text-right", render: (r) => <button onClick={() => setConfirmDel(r)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 cursor-pointer dark:hover:bg-rose-500/15"><Trash2 size={15} /></button> },
          ]} />
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="New Expense" width="max-w-lg">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date" required><Input type="date" max={todayStr()} value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></Field>
            <Field label="Category" required><Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
            <Field label="Amount (₹)" required><Input type="number" min="1" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
            <Field label="GST/Tax (₹)"><Input type="number" min="0" value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} /></Field>
            <Field label="Paid To (Vendor)"><Select value={form.vendor_id} onChange={(e) => setForm({ ...form, vendor_id: e.target.value })}><option value="">— None —</option>{(vendorsD?.rows || []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</Select></Field>
            <Field label="Payment Mode"><Select value={form.payment_mode} onChange={(e) => setForm({ ...form, payment_mode: e.target.value })}>{MODES.map((m) => <option key={m}>{m}</option>)}</Select></Field>
          </div>
          <Field label="Reference"><Input placeholder="Invoice / UTR no." value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} /></Field>
          <Field label="Notes"><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <div className="flex justify-end gap-2 pt-1"><Button variant="outline" onClick={() => setModal(false)}>Cancel</Button><Button onClick={save} loading={busy}>Save Expense</Button></div>
        </div>
      </Modal>

      <ConfirmModal open={!!confirmDel} onClose={() => setConfirmDel(null)} onConfirm={del} loading={busy} danger title="Delete expense?" message={`Remove the ${confirmDel?.category} expense of ${confirmDel ? fmtINR(confirmDel.total) : ""}?`} confirmLabel="Delete" />
    </div>
  );
}
