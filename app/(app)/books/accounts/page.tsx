"use client";

import { useMemo, useState } from "react";
import { BookOpen, Plus, Trash2, Lock } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/swr";
import { fmtINR } from "@/lib/format";
import { Badge, Button, Card, ConfirmModal, Field, Input, Modal, PageHeader, PageLoader, Select, useToast } from "@/components/ui";

type Account = { id: number; name: string; type: string; code: string | null; opening_balance: number; system: number };

const GROUPS: { type: string; label: string; tone: string }[] = [
  { type: "asset", label: "Assets", tone: "emerald" },
  { type: "liability", label: "Liabilities", tone: "rose" },
  { type: "equity", label: "Equity", tone: "violet" },
  { type: "income", label: "Income", tone: "sky" },
  { type: "expense", label: "Expenses", tone: "amber" },
];
const TONE: Record<string, string> = { emerald: "text-emerald-600 dark:text-emerald-400", rose: "text-rose-600 dark:text-rose-400", violet: "text-violet-600 dark:text-violet-400", sky: "text-sky-600 dark:text-sky-400", amber: "text-amber-600 dark:text-amber-400" };
const naturalSide = (t: string) => (t === "asset" || t === "expense" ? "Dr" : "Cr");
const EMPTY = { name: "", type: "asset", code: "", opening_balance: "" };

export default function ChartOfAccountsPage() {
  const { data, reload } = useData<{ rows: Account[] }>("/api/books/coa");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [delTarget, setDelTarget] = useState<Account | null>(null);
  const toast = useToast();
  const rows = data?.rows;

  const grouped = useMemo(() => {
    const m: Record<string, Account[]> = {};
    for (const a of rows || []) (m[a.type] ||= []).push(a);
    return m;
  }, [rows]);

  const save = async () => {
    if (!form.name.trim()) return toast.push("error", "Account name is required");
    setBusy(true);
    try {
      await api("/api/books/coa", { method: "POST", body: JSON.stringify({ ...form, opening_balance: Number(form.opening_balance) || 0 }) });
      toast.push("success", "Account added ✓"); setModal(false); setForm(EMPTY); reload();
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!delTarget) return;
    setBusy(true);
    try { await api(`/api/books/coa/${delTarget.id}`, { method: "DELETE" }); toast.push("success", "Account deleted"); setDelTarget(null); reload(); }
    catch (e) { toast.push("error", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  if (!rows) return <PageLoader />;

  return (
    <div className="fade-up">
      <PageHeader title="Chart of Accounts" subtitle="The ledger accounts that power your double-entry books" icon={<BookOpen size={20} />}
        actions={<Button onClick={() => { setForm(EMPTY); setModal(true); }}><Plus size={14} /> New Account</Button>} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {GROUPS.map((g) => {
          const list = grouped[g.type] || [];
          return (
            <Card key={g.type} title={g.label} icon={<span className={TONE[g.tone]}><BookOpen size={16} /></span>}
              action={<Badge tone="EMPLOYEE">{list.length}</Badge>}>
              {list.length === 0 ? <p className="py-4 text-center text-sm text-slate-400">No accounts</p> : (
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {list.map((a) => (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2.5">
                      <span className="min-w-0">
                        <span className="flex items-center gap-1.5 text-[13px] font-bold text-slate-800 dark:text-slate-100">
                          {a.code && <span className="text-slate-400 font-mono text-[11px]">{a.code}</span>} {a.name}
                          {!!a.system && <Lock size={11} className="text-slate-300" />}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        {a.opening_balance > 0 && (
                          <span className="text-right">
                            <span className={`block text-[13px] font-extrabold ${TONE[g.tone]}`}>{fmtINR(a.opening_balance)}</span>
                            <span className="block text-[10px] font-semibold text-slate-400">opening · {naturalSide(a.type)}</span>
                          </span>
                        )}
                        {!a.system && (
                          <button onClick={() => setDelTarget(a)} className="rounded-lg p-1.5 text-slate-300 transition hover:bg-rose-50 hover:text-rose-500 dark:hover:bg-rose-500/10" aria-label="Delete"><Trash2 size={14} /></button>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          );
        })}
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title="New Ledger Account" width="max-w-md">
        <div className="space-y-3">
          <Field label="Account Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Marketing Expenses" /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Type"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>{GROUPS.map((g) => <option key={g.type} value={g.type}>{g.label.replace(/s$/, "")}</option>)}</Select></Field>
            <Field label="Code"><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="e.g. 5600" /></Field>
          </div>
          <Field label="Opening Balance (₹)" hint={`Entered on the ${naturalSide(form.type)} side for ${form.type} accounts`}>
            <Input type="number" value={form.opening_balance} onChange={(e) => setForm({ ...form, opening_balance: e.target.value })} placeholder="0" />
          </Field>
          <div className="flex justify-end gap-2 pt-1"><Button variant="outline" onClick={() => setModal(false)}>Cancel</Button><Button onClick={save} loading={busy}>Add Account</Button></div>
        </div>
      </Modal>

      <ConfirmModal open={!!delTarget} onClose={() => setDelTarget(null)} onConfirm={remove} loading={busy} danger
        title="Delete account?" message={`Remove "${delTarget?.name}" from your chart of accounts.`} confirmLabel="Delete" />
    </div>
  );
}
