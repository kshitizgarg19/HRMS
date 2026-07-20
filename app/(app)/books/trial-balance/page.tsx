"use client";

import { Scale, CheckCircle2, AlertTriangle } from "lucide-react";
import { useData } from "@/lib/swr";
import { fmtINR } from "@/lib/format";
import { Card, EmptyState, PageHeader, PageLoader, StatCard } from "@/components/ui";

type Row = { id: number; name: string; type: string; code: string | null; debit: number; credit: number };
type TB = { rows: Row[]; totalDebit: number; totalCredit: number; balanced: boolean };

const TYPE_LABEL: Record<string, string> = { asset: "Assets", liability: "Liabilities", equity: "Equity", income: "Income", expense: "Expenses" };
const ORDER = ["asset", "liability", "equity", "income", "expense"];

export default function TrialBalancePage() {
  const { data } = useData<TB>("/api/books/trial-balance");
  if (!data) return <PageLoader />;

  const active = data.rows.filter((r) => r.debit > 0 || r.credit > 0);
  const groups = ORDER.map((t) => ({ type: t, rows: active.filter((r) => r.type === t) })).filter((g) => g.rows.length);

  return (
    <div className="fade-up">
      <PageHeader title="Trial Balance" subtitle="Every ledger account's net debit or credit — proof the books balance" icon={<Scale size={20} />} />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Total Debit" value={fmtINR(data.totalDebit)} icon={<Scale size={20} />} accent="indigo" />
        <StatCard label="Total Credit" value={fmtINR(data.totalCredit)} icon={<Scale size={20} />} accent="violet" />
        <StatCard label={data.balanced ? "Balanced" : "Out of Balance"} value={data.balanced ? "✓" : fmtINR(Math.abs(data.totalDebit - data.totalCredit))}
          icon={data.balanced ? <CheckCircle2 size={20} /> : <AlertTriangle size={20} />} accent={data.balanced ? "emerald" : "rose"}
          sub={data.balanced ? "debits = credits" : "difference"} />
      </div>

      <Card title="Trial Balance" icon={<Scale size={16} />} bodyClassName="p-0">
        {active.length === 0 ? <div className="p-5"><EmptyState title="No balances yet" hint="Add opening balances or post a journal entry" /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-100 bg-slate-50/70 text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-800/40">
                <tr><th className="px-5 py-2.5 text-left font-bold">Account</th><th className="px-5 py-2.5 text-right font-bold">Debit</th><th className="px-5 py-2.5 text-right font-bold">Credit</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                {groups.flatMap((g) => [
                  <tr key={`h-${g.type}`} className="bg-slate-50/40 dark:bg-slate-800/20"><td colSpan={3} className="px-5 py-1.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{TYPE_LABEL[g.type]}</td></tr>,
                  ...g.rows.map((r) => (
                    <tr key={r.id} className="transition hover:bg-indigo-50/30 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-2.5"><span className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">{r.code && <span className="mr-1.5 font-mono text-[11px] text-slate-400">{r.code}</span>}{r.name}</span></td>
                      <td className="px-5 py-2.5 text-right font-semibold text-slate-800 dark:text-slate-100">{r.debit ? fmtINR(r.debit) : <span className="text-slate-300">—</span>}</td>
                      <td className="px-5 py-2.5 text-right font-semibold text-slate-800 dark:text-slate-100">{r.credit ? fmtINR(r.credit) : <span className="text-slate-300">—</span>}</td>
                    </tr>
                  )),
                ])}
              </tbody>
              <tfoot className="border-t-2 border-slate-200 bg-slate-50/70 dark:border-slate-700 dark:bg-slate-800/40">
                <tr className="text-[15px] font-extrabold">
                  <td className="px-5 py-3 text-slate-500">Total</td>
                  <td className="px-5 py-3 text-right text-slate-900 dark:text-slate-50">{fmtINR(data.totalDebit)}</td>
                  <td className="px-5 py-3 text-right text-slate-900 dark:text-slate-50">{fmtINR(data.totalCredit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
