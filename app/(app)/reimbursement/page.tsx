"use client";

import { useEffect, useMemo, useState } from "react";
import { Receipt, Plus, Trash2, IndianRupee, CheckCircle2, Hourglass, Paperclip } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, fmtINR, todayStr } from "@/lib/format";
import { Badge, Button, Card, ConfirmModal, DataTable, Field, Input, Modal, PageHeader, PageLoader, Select, StatCard, Textarea, useToast } from "@/components/ui";
import type { Reimbursement } from "@/lib/types";

const CATEGORIES = ["Travel", "Meals", "Internet", "Medical", "Office Supplies", "Software", "Client Entertainment", "Training", "Other"];
const EMPTY = { category: "Travel", amount: "", expense_date: todayStr(), description: "", receipt: "" };

export default function ReimbursementPage() {
  const [rows, setRows] = useState<Reimbursement[] | null>(null);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Reimbursement | null>(null);
  const toast = useToast();

  const load = () => api<{ rows: Reimbursement[] }>("/api/reimbursements").then((d) => setRows(d.rows)).catch(() => {});
  useEffect(() => { load(); }, []);

  const stats = useMemo(() => {
    if (!rows) return { claimed: 0, approved: 0, pending: 0, pendingCount: 0 };
    return {
      claimed: rows.reduce((s, r) => s + r.amount, 0),
      approved: rows.filter((r) => r.status === "Approved").reduce((s, r) => s + r.amount, 0),
      pending: rows.filter((r) => r.status === "Pending").reduce((s, r) => s + r.amount, 0),
      pendingCount: rows.filter((r) => r.status === "Pending").length,
    };
  }, [rows]);

  if (!rows) return <PageLoader />;

  const submit = async () => {
    if (!form.amount || !form.description.trim()) return toast.push("error", "Amount and description are required");
    setBusy(true);
    try {
      await api("/api/reimbursements", { method: "POST", body: JSON.stringify(form) });
      toast.push("success", "Claim submitted for approval");
      setModal(false);
      setForm(EMPTY);
      await load();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirmDel) return;
    setBusy(true);
    try {
      await api(`/api/reimbursements/${confirmDel.id}`, { method: "DELETE" });
      toast.push("success", "Claim withdrawn");
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
        title="Reimbursement"
        subtitle="Create and track your expense claims"
        icon={<Receipt size={20} />}
        actions={<Button onClick={() => setModal(true)}><Plus size={15} /> New Request</Button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total Claimed" value={fmtINR(stats.claimed)} icon={<IndianRupee size={20} />} accent="indigo" sub={`${rows.length} claims`} />
        <StatCard label="Approved Amount" value={fmtINR(stats.approved)} icon={<CheckCircle2 size={20} />} accent="emerald" />
        <StatCard label="Awaiting Approval" value={fmtINR(stats.pending)} icon={<Hourglass size={20} />} accent="amber" sub={`${stats.pendingCount} pending`} />
        <StatCard label="This Month" value={fmtINR(rows.filter((r) => r.expense_date.startsWith(todayStr().slice(0, 7))).reduce((s, r) => s + r.amount, 0))} icon={<Receipt size={20} />} accent="violet" />
      </div>

      <Card title="My Claims" icon={<Receipt size={16} />}>
        <DataTable
          rows={rows}
          keyFor={(r) => r.id}
          empty={<p className="text-center text-sm text-slate-400 dark:text-slate-500">No reimbursement requests found — claim your first expense.</p>}
          columns={[
            { key: "cat", header: "Category", render: (r) => <Badge tone="EMPLOYEE">{r.category}</Badge> },
            { key: "desc", header: "Description", className: "max-w-[280px]", render: (r) => (
              <span>
                <span className="line-clamp-2 text-[13px] leading-snug text-slate-700 dark:text-slate-200">{r.description}</span>
                {r.receipt && <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-indigo-500"><Paperclip size={11} /> {r.receipt}</span>}
              </span>
            )},
            { key: "date", header: "Expense Date", render: (r) => <span className="text-[13px] font-semibold">{fmtDate(r.expense_date)}</span> },
            { key: "amt", header: "Amount", render: (r) => <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100">{fmtINR(r.amount)}</span> },
            {
              key: "status", header: "Status",
              render: (r) => (
                <span title={r.review_note || undefined}>
                  <Badge tone={r.status}>{r.status}</Badge>
                  {r.review_note && <span className="mt-0.5 block max-w-[160px] truncate text-[10px] text-slate-400 dark:text-slate-500">{r.review_note}</span>}
                </span>
              ),
            },
            {
              key: "act", header: "", className: "text-right",
              render: (r) =>
                r.status === "Pending" ? (
                  <button onClick={() => setConfirmDel(r)} className="rounded-lg p-2 text-rose-500 dark:text-rose-400 transition hover:bg-rose-50 cursor-pointer" title="Withdraw claim">
                    <Trash2 size={15} />
                  </button>
                ) : null,
            },
          ]}
        />
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="New Reimbursement Request" subtitle="Attach the receipt name for faster approval">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Category" required>
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Amount (₹)" required>
              <Input type="number" min="1" placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Field>
          </div>
          <Field label="Expense Date" required>
            <Input type="date" max={todayStr()} value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
          </Field>
          <Field label="Description" required>
            <Textarea placeholder="What was this expense for?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="Receipt / Bill Reference" hint="File name or invoice number for the attached receipt">
            <Input placeholder="e.g. uber_invoice_2450.pdf" value={form.receipt} onChange={(e) => setForm({ ...form, receipt: e.target.value })} />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={submit} loading={busy}>Submit Claim</Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={remove}
        loading={busy}
        danger
        title="Withdraw claim?"
        message={`Withdraw your ${confirmDel?.category} claim of ${confirmDel ? fmtINR(confirmDel.amount) : ""}?`}
        confirmLabel="Withdraw"
      />
    </div>
  );
}
