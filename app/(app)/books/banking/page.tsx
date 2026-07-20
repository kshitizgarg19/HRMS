"use client";

import { useMemo, useState } from "react";
import { Landmark, Plus, Wallet, CreditCard, Smartphone, ArrowDownLeft, ArrowUpRight, IndianRupee } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/swr";
import { fmtDate, fmtINR, todayStr } from "@/lib/format";
import { Badge, Button, Card, DataTable, Field, Input, Modal, PageHeader, PageLoader, Select, StatCard, Textarea, useToast, cn } from "@/components/ui";

type Account = { id: number; name: string; type: string; account_no: string | null; opening_balance: number; balance: number };
type BankTxn = { id: number; account_id: number; account_name: string; txn_date: string; kind: "in" | "out"; amount: number; description: string | null; category: string | null };

const TYPE_ICON: Record<string, React.ReactNode> = { bank: <Landmark size={18} />, cash: <Wallet size={18} />, card: <CreditCard size={18} />, upi: <Smartphone size={18} /> };
const ACC_EMPTY = { name: "", type: "bank", account_no: "", opening_balance: "" };
const TXN_EMPTY = { account_id: "", txn_date: todayStr(), kind: "in", amount: "", description: "", category: "" };

export default function BankingPage() {
  const { data, reload } = useData<{ accounts: Account[]; txns: BankTxn[] }>("/api/books/banking");
  const [accModal, setAccModal] = useState(false);
  const [txnModal, setTxnModal] = useState(false);
  const [accForm, setAccForm] = useState(ACC_EMPTY);
  const [txnForm, setTxnForm] = useState(TXN_EMPTY);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const accounts = data?.accounts;
  const txns = data?.txns;

  const totalBalance = useMemo(() => (accounts || []).reduce((s, a) => s + a.balance, 0), [accounts]);

  const saveAcc = async () => {
    if (!accForm.name.trim()) return toast.push("error", "Account name is required");
    setBusy(true);
    try { await api("/api/books/banking", { method: "POST", body: JSON.stringify({ action: "account", ...accForm }) }); toast.push("success", "Account added ✓"); setAccModal(false); setAccForm(ACC_EMPTY); reload(); }
    catch (e) { toast.push("error", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };
  const saveTxn = async () => {
    if (!txnForm.account_id) return toast.push("error", "Pick an account");
    if (!txnForm.amount || Number(txnForm.amount) <= 0) return toast.push("error", "Enter an amount");
    setBusy(true);
    try { await api("/api/books/banking", { method: "POST", body: JSON.stringify({ action: "txn", ...txnForm }) }); toast.push("success", "Transaction recorded ✓"); setTxnModal(false); setTxnForm(TXN_EMPTY); reload(); }
    catch (e) { toast.push("error", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  if (!accounts || !txns) return <PageLoader />;

  return (
    <div className="fade-up">
      <PageHeader title="Banking" subtitle="Bank, cash and UPI accounts with money in/out" icon={<Landmark size={20} />}
        actions={
          <span className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => { setAccForm(ACC_EMPTY); setAccModal(true); }}><Plus size={14} /> Account</Button>
            <Button onClick={() => { setTxnForm(TXN_EMPTY); setTxnModal(true); }}><Plus size={14} /> Transaction</Button>
          </span>
        } />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Total Balance" value={fmtINR(totalBalance)} icon={<IndianRupee size={20} />} accent="emerald" sub={`${accounts.length} accounts`} />
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {accounts.map((a) => (
          <div key={a.id} className="card-lift relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-start justify-between">
              <span className="grid size-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300">{TYPE_ICON[a.type] || <Landmark size={18} />}</span>
              <Badge tone="EMPLOYEE">{a.type}</Badge>
            </div>
            <p className="mt-3 text-[13px] font-bold text-slate-700 dark:text-slate-200">{a.name}</p>
            {a.account_no && <p className="text-xs text-slate-400 dark:text-slate-500">{a.account_no}</p>}
            <p className="mt-2 text-[22px] font-extrabold tracking-tight text-slate-900 dark:text-slate-50">{fmtINR(a.balance)}</p>
          </div>
        ))}
      </div>

      <Card title="Recent Transactions" icon={<Landmark size={16} />}>
        <DataTable rows={txns} keyFor={(r) => r.id} empty={<p className="text-center text-sm text-slate-400">No transactions yet.</p>}
          columns={[
            { key: "date", header: "Date", render: (r) => <span className="text-[13px] font-semibold">{fmtDate(r.txn_date)}</span> },
            { key: "acc", header: "Account", render: (r) => <span className="text-[13px] text-slate-600 dark:text-slate-300">{r.account_name}</span> },
            { key: "desc", header: "Description", render: (r) => <span className="text-[13px] text-slate-700 dark:text-slate-200">{r.description || "—"}{r.category && <Badge tone="EMPLOYEE" className="ml-2">{r.category}</Badge>}</span> },
            {
              key: "amt", header: "Amount", className: "text-right", render: (r) => (
                <span className={cn("inline-flex items-center gap-1 font-extrabold", r.kind === "in" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                  {r.kind === "in" ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}{r.kind === "in" ? "+" : "−"}{fmtINR(r.amount)}
                </span>
              ),
            },
          ]} />
      </Card>

      <Modal open={accModal} onClose={() => setAccModal(false)} title="New Account" width="max-w-md">
        <div className="space-y-3">
          <Field label="Account Name" required><Input value={accForm.name} onChange={(e) => setAccForm({ ...accForm, name: e.target.value })} placeholder="e.g. HDFC Current A/c" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type"><Select value={accForm.type} onChange={(e) => setAccForm({ ...accForm, type: e.target.value })}><option value="bank">Bank</option><option value="cash">Cash</option><option value="card">Card</option><option value="upi">UPI</option></Select></Field>
            <Field label="Opening Balance (₹)"><Input type="number" value={accForm.opening_balance} onChange={(e) => setAccForm({ ...accForm, opening_balance: e.target.value })} /></Field>
          </div>
          <Field label="Account No. / Handle"><Input value={accForm.account_no} onChange={(e) => setAccForm({ ...accForm, account_no: e.target.value })} /></Field>
          <div className="flex justify-end gap-2 pt-1"><Button variant="outline" onClick={() => setAccModal(false)}>Cancel</Button><Button onClick={saveAcc} loading={busy}>Add Account</Button></div>
        </div>
      </Modal>

      <Modal open={txnModal} onClose={() => setTxnModal(false)} title="New Transaction" width="max-w-md">
        <div className="space-y-3">
          <Field label="Account" required><Select value={txnForm.account_id} onChange={(e) => setTxnForm({ ...txnForm, account_id: e.target.value })}><option value="">Select…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</Select></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type"><Select value={txnForm.kind} onChange={(e) => setTxnForm({ ...txnForm, kind: e.target.value })}><option value="in">Money In</option><option value="out">Money Out</option></Select></Field>
            <Field label="Amount (₹)" required><Input type="number" min="1" value={txnForm.amount} onChange={(e) => setTxnForm({ ...txnForm, amount: e.target.value })} /></Field>
            <Field label="Date"><Input type="date" value={txnForm.txn_date} onChange={(e) => setTxnForm({ ...txnForm, txn_date: e.target.value })} /></Field>
            <Field label="Category"><Input value={txnForm.category} onChange={(e) => setTxnForm({ ...txnForm, category: e.target.value })} placeholder="Sales / Rent…" /></Field>
          </div>
          <Field label="Description"><Textarea rows={2} value={txnForm.description} onChange={(e) => setTxnForm({ ...txnForm, description: e.target.value })} /></Field>
          <div className="flex justify-end gap-2 pt-1"><Button variant="outline" onClick={() => setTxnModal(false)}>Cancel</Button><Button onClick={saveTxn} loading={busy}>Save</Button></div>
        </div>
      </Modal>
    </div>
  );
}
