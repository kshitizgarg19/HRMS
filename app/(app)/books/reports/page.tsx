"use client";

import { BarChart3, TrendingUp, TrendingDown, Wallet, Users2, Package, Clock, Scale, ArrowLeftRight, Percent } from "lucide-react";
import { useData } from "@/lib/swr";
import { fmtINR } from "@/lib/format";
import { Card, EmptyState, PageHeader, PageLoader, StatCard, cn } from "@/components/ui";

interface Reports {
  pnl: { income: number; purchases: number; expenses: number; totalExpense: number; profit: number };
  salesByCustomer: { name: string; total: number; c: number }[];
  aging: { current: number; d30: number; d60: number; d90: number };
  expByCat: { category: string; total: number; c: number }[];
  topItems: { name: string; qty: number; amount: number }[];
  balanceSheet: { cash: number; receivable: number; inventory: number; assets: number; payable: number; equity: number };
  cashFlow: { cashIn: number; cashOut: number; net: number; payIn: number; bankIn: number; payOut: number; expenses: number; bankOut: number };
  gst: { output: number; input: number; payable: number };
}

function Row({ label, value, strong, color }: { label: string; value: number; strong?: boolean; color?: string }) {
  return (
    <div className={cn("flex items-center justify-between rounded-xl px-4", strong ? "py-3" : "py-2.5", strong ? (color || "bg-indigo-50 dark:bg-indigo-500/10") : "bg-slate-50 dark:bg-slate-800/50")}>
      <span className={cn(strong ? "text-sm font-extrabold" : "text-[13px] font-semibold", "text-slate-700 dark:text-slate-200")}>{label}</span>
      <span className={cn(strong ? "text-base font-extrabold" : "font-bold", "text-slate-900 dark:text-slate-100")}>{fmtINR(value)}</span>
    </div>
  );
}

function Bars({ rows, color }: { rows: { label: string; value: number; sub?: string }[]; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <EmptyState title="No data yet" />;
  return (
    <ul className="space-y-2.5">
      {rows.map((r, i) => (
        <li key={i}>
          <div className="mb-1 flex items-center justify-between text-[13px]">
            <span className="truncate font-semibold text-slate-700 dark:text-slate-200">{r.label}{r.sub && <span className="ml-1.5 text-xs font-normal text-slate-400">{r.sub}</span>}</span>
            <span className="shrink-0 font-extrabold text-slate-900 dark:text-slate-100">{fmtINR(r.value)}</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className={cn("h-full rounded-full transition-all duration-700", color)} style={{ width: `${Math.max(3, (r.value / max) * 100)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function ReportsPage() {
  const { data } = useData<Reports>("/api/books/reports");
  if (!data) return <PageLoader />;
  // Defensive against a stale cached response from an older deploy (missing newer sections).
  const pnl = data.pnl ?? { income: 0, purchases: 0, expenses: 0, totalExpense: 0, profit: 0 };
  const salesByCustomer = data.salesByCustomer ?? [];
  const aging = data.aging ?? { current: 0, d30: 0, d60: 0, d90: 0 };
  const expByCat = data.expByCat ?? [];
  const topItems = data.topItems ?? [];
  const balanceSheet = data.balanceSheet ?? { cash: 0, receivable: 0, inventory: 0, assets: 0, payable: 0, equity: 0 };
  const cashFlow = data.cashFlow ?? { cashIn: 0, cashOut: 0, net: 0, payIn: 0, bankIn: 0, payOut: 0, expenses: 0, bankOut: 0 };
  const gst = data.gst ?? { output: 0, input: 0, payable: 0 };
  const agingRows = [
    { label: "Current", value: aging.current, color: "bg-emerald-500" },
    { label: "1–30 days", value: aging.d30, color: "bg-amber-500" },
    { label: "31–60 days", value: aging.d60, color: "bg-orange-500" },
    { label: "60+ days", value: aging.d90, color: "bg-rose-500" },
  ];
  const agingMax = Math.max(1, ...agingRows.map((a) => a.value));

  return (
    <div className="fade-up">
      <PageHeader title="Reports" subtitle="Profit & loss, receivables aging, sales and expense insights" icon={<BarChart3 size={20} />} />

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total Income" value={fmtINR(pnl.income)} icon={<TrendingUp size={20} />} accent="emerald" sub="invoiced" />
        <StatCard label="Total Expenses" value={fmtINR(pnl.totalExpense)} icon={<TrendingDown size={20} />} accent="rose" sub="bills + expenses" />
        <StatCard label="Net Profit" value={fmtINR(pnl.profit)} icon={<Wallet size={20} />} accent={pnl.profit >= 0 ? "indigo" : "rose"} />
        <StatCard label="Purchases" value={fmtINR(pnl.purchases)} icon={<Package size={20} />} accent="violet" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card title="Balance Sheet" icon={<Scale size={16} />}>
          <div className="space-y-2">
            <p className="px-1 text-[11px] font-extrabold uppercase tracking-wide text-slate-400">Assets</p>
            <Row label="Cash & Bank" value={balanceSheet.cash} />
            <Row label="Accounts Receivable" value={balanceSheet.receivable} />
            <Row label="Inventory" value={balanceSheet.inventory} />
            <Row label="Total Assets" value={balanceSheet.assets} strong color="bg-emerald-50 dark:bg-emerald-500/10" />
            <p className="px-1 pt-1 text-[11px] font-extrabold uppercase tracking-wide text-slate-400">Liabilities &amp; Equity</p>
            <Row label="Accounts Payable" value={balanceSheet.payable} />
            <Row label="Net Worth (Equity)" value={balanceSheet.equity} strong color="bg-indigo-50 dark:bg-indigo-500/10" />
          </div>
        </Card>

        <Card title="Cash Flow" icon={<ArrowLeftRight size={16} />}>
          <div className="space-y-2">
            <Row label="Payments Received" value={cashFlow.payIn} />
            <Row label="Bank Money In" value={cashFlow.bankIn} />
            <Row label="Total Cash In" value={cashFlow.cashIn} strong color="bg-emerald-50 dark:bg-emerald-500/10" />
            <Row label="Payments Made" value={cashFlow.payOut} />
            <Row label="Expenses" value={cashFlow.expenses} />
            <Row label="Bank Money Out" value={cashFlow.bankOut} />
            <Row label="Net Cash Flow" value={cashFlow.net} strong color={cashFlow.net >= 0 ? "bg-indigo-50 dark:bg-indigo-500/10" : "bg-rose-50 dark:bg-rose-500/10"} />
          </div>
        </Card>

        <Card title="GST Summary" icon={<Percent size={16} />}>
          <div className="space-y-2">
            <Row label="Output GST · collected on sales" value={gst.output} />
            <Row label="Input GST · paid on purchases" value={gst.input} />
            <Row label="Net GST Payable" value={gst.payable} strong color={gst.payable >= 0 ? "bg-amber-50 dark:bg-amber-500/10" : "bg-emerald-50 dark:bg-emerald-500/10"} />
          </div>
        </Card>

        <Card title="Profit & Loss" icon={<BarChart3 size={16} />}>
          <div className="space-y-2.5">
            <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 dark:bg-emerald-500/10"><span className="text-[13px] font-bold text-emerald-700 dark:text-emerald-300">Income</span><span className="font-extrabold text-emerald-700 dark:text-emerald-300">{fmtINR(pnl.income)}</span></div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 dark:bg-slate-800/50"><span className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">Purchases (bills)</span><span className="font-bold text-slate-700 dark:text-slate-200">−{fmtINR(pnl.purchases)}</span></div>
            <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 dark:bg-slate-800/50"><span className="text-[13px] font-semibold text-slate-600 dark:text-slate-300">Expenses</span><span className="font-bold text-slate-700 dark:text-slate-200">−{fmtINR(pnl.expenses)}</span></div>
            <div className={cn("flex items-center justify-between rounded-xl px-4 py-3", pnl.profit >= 0 ? "bg-indigo-50 dark:bg-indigo-500/10" : "bg-rose-50 dark:bg-rose-500/10")}>
              <span className={cn("text-sm font-extrabold", pnl.profit >= 0 ? "text-indigo-700 dark:text-indigo-300" : "text-rose-700 dark:text-rose-300")}>Net Profit</span>
              <span className={cn("text-base font-extrabold", pnl.profit >= 0 ? "text-indigo-700 dark:text-indigo-300" : "text-rose-700 dark:text-rose-300")}>{fmtINR(pnl.profit)}</span>
            </div>
          </div>
        </Card>

        <Card title="Receivables Aging" icon={<Clock size={16} />}>
          <ul className="space-y-2.5">
            {agingRows.map((a) => (
              <li key={a.label}>
                <div className="mb-1 flex items-center justify-between text-[13px]"><span className="font-semibold text-slate-700 dark:text-slate-200">{a.label}</span><span className="font-extrabold text-slate-900 dark:text-slate-100">{fmtINR(a.value)}</span></div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className={cn("h-full rounded-full transition-all duration-700", a.color)} style={{ width: `${Math.max(3, (a.value / agingMax) * 100)}%` }} /></div>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Sales by Customer" icon={<Users2 size={16} />}>
          <Bars rows={salesByCustomer.map((s) => ({ label: s.name, value: s.total, sub: `${s.c} inv` }))} color="bg-indigo-500" />
        </Card>

        <Card title="Expenses by Category" icon={<Wallet size={16} />}>
          <Bars rows={expByCat.map((e) => ({ label: e.category, value: e.total, sub: `${e.c}` }))} color="bg-rose-500" />
        </Card>

        <Card title="Top Selling Items" icon={<Package size={16} />} className="xl:col-span-2">
          <Bars rows={topItems.map((t) => ({ label: t.name, value: t.amount, sub: `${t.qty} sold` }))} color="bg-violet-500" />
        </Card>
      </div>
    </div>
  );
}
