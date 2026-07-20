"use client";

import Link from "next/link";
import { Landmark, FileText, Receipt, CreditCard, Package, AlertTriangle, Users2, Building2, IndianRupee, Plus, ArrowUpRight, Wallet, TrendingUp, TrendingDown, PieChart, ArrowDownLeft, ArrowUpRight as ArrowOut } from "lucide-react";
import { useData } from "@/lib/swr";
import { fmtINR, fmtDate, MONTHS } from "@/lib/format";
import { Badge, Card, EmptyState, PageHeader, PageLoader, StatCard } from "@/components/ui";
import { Donut } from "@/components/charts";

interface Acct { id: number; name: string; type: string; balance: number }
interface BooksDash {
  receivable: number; receivableCurrent: number; receivableOverdue: number; creditNotes: number; overdue: number;
  payable: number; payableCurrent: number; payableOverdue: number; vendorCredits: number;
  quotePipeline: number; customers: number; vendors: number; items: number; inventoryValue: number; lowStock: number;
  monthSales: number; monthSalesCount: number; monthPurchases: number;
  cashBalance: number; cashIn: number; cashOut: number; cashNet: number; accounts: Acct[];
  recent: { id: number; type: string; number: string; status: string; total: number; txn_date: string; party_name: string | null }[];
  incomeExpense: { ym: string; income: number; expense: number }[];
  topExpenses: { category: string; v: number }[];
}

const STATUS_TONE: Record<string, string> = { Draft: "Draft", Sent: "Generated", Open: "Generated", Accepted: "Approved", Invoiced: "Approved", Billed: "Approved", Paid: "Paid", "Partially Paid": "Pending", Overdue: "Rejected", Declined: "Rejected" };
const TYPE_TO: Record<string, string> = { quote: "/books/quotes", sales_order: "/books/sales-orders", invoice: "/books/invoices", credit_note: "/books/credit-notes", purchase_order: "/books/purchase-orders", bill: "/books/bills", vendor_credit: "/books/vendor-credits" };

const kfmt = (v: number) => (Math.abs(v) >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : Math.abs(v) >= 1000 ? `₹${(v / 1000).toFixed(0)}k` : `₹${Math.round(v)}`);
function ymLabel(ym: string) {
  const [y, m] = (ym || "").split("-").map(Number);
  return MONTHS[m - 1] ? `${MONTHS[m - 1].slice(0, 3)} ${String(y).slice(2)}` : (ym || "");
}

/* Grouped two-series bar chart — Income vs Expense. Hand-rolled SVG, NexusHR house style. */
function IncomeExpenseBars({ data }: { data: { ym: string; income: number; expense: number }[] }) {
  const w = 560, h = 210, pad = { l: 12, r: 12, t: 26, b: 28 };
  const innerW = w - pad.l - pad.r, innerH = h - pad.t - pad.b;
  const max = Math.max(...data.flatMap((d) => [d.income, d.expense]), 1);
  const groupW = innerW / Math.max(data.length, 1);
  const bw = Math.min(22, groupW * 0.32);
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      <defs>
        <linearGradient id="ie-inc" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#10b981" stopOpacity="0.95" /><stop offset="100%" stopColor="#10b981" stopOpacity="0.5" /></linearGradient>
        <linearGradient id="ie-exp" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f43f5e" stopOpacity="0.95" /><stop offset="100%" stopColor="#f43f5e" stopOpacity="0.5" /></linearGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((g, gi) => (
        <line key={g} x1={pad.l} x2={w - pad.r} y1={y(max * g)} y2={y(max * g)} stroke="var(--chart-grid)" strokeDasharray="3 4" strokeWidth="1" className="grid-line" style={{ animationDelay: `${gi * 80}ms` }} />
      ))}
      {data.map((d, i) => {
        const cx = pad.l + groupW * (i + 0.5);
        const hi = (d.income / max) * innerH, he = (d.expense / max) * innerH;
        return (
          <g key={i}>
            <rect x={cx - bw - 2} y={pad.t + innerH - hi} width={bw} height={Math.max(hi, 2)} rx="5" fill="url(#ie-inc)" className="grow-bar bar-rect" style={{ animationDelay: `${i * 80}ms` }}><title>{`${ymLabel(d.ym)} income: ${fmtINR(d.income)}`}</title></rect>
            <rect x={cx + 2} y={pad.t + innerH - he} width={bw} height={Math.max(he, 2)} rx="5" fill="url(#ie-exp)" className="grow-bar bar-rect" style={{ animationDelay: `${i * 80 + 40}ms` }}><title>{`${ymLabel(d.ym)} expense: ${fmtINR(d.expense)}`}</title></rect>
            <text x={cx} y={h - 9} fontSize="10" fill="var(--chart-axis)" textAnchor="middle" fontWeight={600}>{ymLabel(d.ym)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function SplitBar({ a, b, aColor, bColor }: { a: number; b: number; aColor: string; bColor: string }) {
  const t = a + b || 1;
  return (
    <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
      <div className="h-full transition-all duration-700" style={{ width: `${(a / t) * 100}%`, background: aColor }} />
      <div className="h-full transition-all duration-700" style={{ width: `${(b / t) * 100}%`, background: bColor }} />
    </div>
  );
}

const ACCT_ICON: Record<string, string> = { bank: "🏦", cash: "💵", card: "💳", upi: "📲" };
const num = (v: number | undefined | null) => (typeof v === "number" && isFinite(v) ? v : 0);

export default function BooksDashboardPage() {
  const { data } = useData<BooksDash>("/api/books/dashboard");
  if (!data) return <PageLoader />;

  // Normalize — be resilient to a stale cached response from an older deploy (missing new fields).
  const d = {
    receivable: num(data.receivable), receivableCurrent: num(data.receivableCurrent), receivableOverdue: num(data.receivableOverdue), creditNotes: num(data.creditNotes),
    payable: num(data.payable), payableCurrent: num(data.payableCurrent), payableOverdue: num(data.payableOverdue), vendorCredits: num(data.vendorCredits),
    quotePipeline: num(data.quotePipeline), customers: num(data.customers), vendors: num(data.vendors), inventoryValue: num(data.inventoryValue), lowStock: num(data.lowStock),
    monthSales: num(data.monthSales), monthSalesCount: num(data.monthSalesCount), monthPurchases: num(data.monthPurchases),
    cashBalance: num(data.cashBalance), cashIn: num(data.cashIn), cashOut: num(data.cashOut), cashNet: num(data.cashNet),
    accounts: data.accounts ?? [], recent: data.recent ?? [], incomeExpense: data.incomeExpense ?? [], topExpenses: data.topExpenses ?? [],
  };
  const totalIncome = d.incomeExpense.reduce((s, x) => s + num(x.income), 0);
  const totalExpense = d.incomeExpense.reduce((s, x) => s + num(x.expense), 0);

  return (
    <div className="fade-up">
      <PageHeader
        title="Finance Overview"
        subtitle="Your Books at a glance — receivables, payables, cash flow and performance"
        icon={<Landmark size={20} />}
        actions={
          <span className="flex flex-wrap gap-2">
            <Link href="/books/quotes" className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-50 px-3.5 py-2 text-sm font-bold text-indigo-700 transition hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300"><Plus size={14} /> Quote</Link>
            <Link href="/books/invoices" className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-3.5 py-2 text-sm font-bold text-white shadow-md shadow-indigo-200 transition hover:-translate-y-px dark:shadow-none"><Plus size={14} /> Invoice</Link>
          </span>
        }
      />

      {/* Receivables / Payables hero cards with current vs overdue split */}
      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="!p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Total Receivables</p>
              <p className="mt-1 text-3xl font-extrabold text-slate-900 dark:text-slate-50">{fmtINR(d.receivable)}</p>
            </div>
            <Link href="/books/invoices" className="grid size-11 place-items-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-500/15"><CreditCard size={20} /></Link>
          </div>
          <div className="mt-4"><SplitBar a={d.receivableCurrent} b={d.receivableOverdue} aColor="#10b981" bColor="#f43f5e" /></div>
          <div className="mt-2.5 flex justify-between text-[13px]">
            <span className="font-semibold text-slate-500"><span className="mr-1.5 inline-block size-2 rounded-full bg-emerald-500 align-middle" />Current {fmtINR(d.receivableCurrent)}</span>
            <span className="font-semibold text-slate-500"><span className="mr-1.5 inline-block size-2 rounded-full bg-rose-500 align-middle" />Overdue {fmtINR(d.receivableOverdue)}</span>
          </div>
          {d.creditNotes > 0 && <p className="mt-2 text-xs text-slate-400">Less credit notes outstanding: {fmtINR(d.creditNotes)}</p>}
        </Card>

        <Card className="!p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Total Payables</p>
              <p className="mt-1 text-3xl font-extrabold text-slate-900 dark:text-slate-50">{fmtINR(d.payable)}</p>
            </div>
            <Link href="/books/bills" className="grid size-11 place-items-center rounded-2xl bg-rose-50 text-rose-600 dark:bg-rose-500/15"><Receipt size={20} /></Link>
          </div>
          <div className="mt-4"><SplitBar a={d.payableCurrent} b={d.payableOverdue} aColor="#6366f1" bColor="#f59e0b" /></div>
          <div className="mt-2.5 flex justify-between text-[13px]">
            <span className="font-semibold text-slate-500"><span className="mr-1.5 inline-block size-2 rounded-full bg-indigo-500 align-middle" />Current {fmtINR(d.payableCurrent)}</span>
            <span className="font-semibold text-slate-500"><span className="mr-1.5 inline-block size-2 rounded-full bg-amber-500 align-middle" />Overdue {fmtINR(d.payableOverdue)}</span>
          </div>
          {d.vendorCredits > 0 && <p className="mt-2 text-xs text-slate-400">Less vendor credits outstanding: {fmtINR(d.vendorCredits)}</p>}
        </Card>
      </div>

      {/* KPI stat row */}
      <div className="mb-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Cash & Bank" value={fmtINR(d.cashBalance)} icon={<Wallet size={20} />} accent="sky" sub="across all accounts" />
        <StatCard label="Sales This Month" value={fmtINR(d.monthSales)} icon={<IndianRupee size={20} />} accent="emerald" sub={`${d.monthSalesCount} invoices`} />
        <StatCard label="Purchases This Month" value={fmtINR(d.monthPurchases)} icon={<Receipt size={20} />} accent="rose" sub="bills booked" />
        <StatCard label="Quotes Pipeline" value={fmtINR(d.quotePipeline)} icon={<FileText size={20} />} accent="violet" sub="open quotations" />
      </div>

      {/* Income & Expense + Top Expenses */}
      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card icon={<TrendingUp size={16} />} className="xl:col-span-8"
          title={
            <span className="flex w-full flex-wrap items-center justify-between gap-2">
              <span>Income &amp; Expense</span>
              <span className="flex gap-3 text-xs font-bold">
                <span className="text-emerald-600"><span className="mr-1 inline-block size-2 rounded-full bg-emerald-500 align-middle" />Income {kfmt(totalIncome)}</span>
                <span className="text-rose-600"><span className="mr-1 inline-block size-2 rounded-full bg-rose-500 align-middle" />Expense {kfmt(totalExpense)}</span>
              </span>
            </span>
          }>
          {d.incomeExpense.length === 0 ? <EmptyState title="No data yet" hint="Create invoices and bills to see the trend" /> : <IncomeExpenseBars data={d.incomeExpense} />}
        </Card>

        <Card title="Top Expenses" icon={<PieChart size={16} />} className="xl:col-span-4">
          {d.topExpenses.length === 0 ? <EmptyState title="No expenses yet" hint="Record an expense to see the breakdown" /> : (
            <Donut data={d.topExpenses.map((e) => ({ label: e.category, value: Math.round(num(e.v)) }))} />
          )}
        </Card>
      </div>

      {/* Cash Flow + Bank & Cash + Recent */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card title="Cash Flow" icon={<Wallet size={16} />} className="xl:col-span-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-emerald-50/60 px-3.5 py-3 dark:bg-emerald-500/10">
              <span className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300"><ArrowDownLeft size={16} /> Money In</span>
              <span className="font-extrabold text-emerald-700 dark:text-emerald-300">{fmtINR(d.cashIn)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-rose-50/60 px-3.5 py-3 dark:bg-rose-500/10">
              <span className="flex items-center gap-2 text-sm font-semibold text-rose-700 dark:text-rose-300"><ArrowOut size={16} /> Money Out</span>
              <span className="font-extrabold text-rose-700 dark:text-rose-300">{fmtINR(d.cashOut)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-slate-200 px-3.5 py-3 dark:border-slate-700">
              <span className="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200">{d.cashNet >= 0 ? <TrendingUp size={16} className="text-emerald-500" /> : <TrendingDown size={16} className="text-rose-500" />} Net Cash Flow</span>
              <span className={`font-extrabold ${d.cashNet >= 0 ? "text-emerald-600" : "text-rose-600"}`}>{fmtINR(d.cashNet)}</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-3.5 py-3 text-white">
              <span className="text-sm font-bold">Closing Cash &amp; Bank</span>
              <span className="font-extrabold">{fmtINR(d.cashBalance)}</span>
            </div>
          </div>
        </Card>

        <Card title="Bank & Cash" icon={<Landmark size={16} />} className="xl:col-span-4">
          {d.accounts.length === 0 ? <EmptyState title="No accounts" hint="Add a bank or cash account in Banking" /> : (
            <ul className="space-y-2">
              {d.accounts.map((a) => (
                <li key={a.id}>
                  <Link href="/books/banking" className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3.5 py-2.5 transition hover:border-indigo-200 hover:bg-indigo-50/40 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:bg-slate-800">
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="text-lg">{ACCT_ICON[a.type] || "🏦"}</span>
                      <span className="min-w-0">
                        <span className="block truncate text-[13px] font-bold text-slate-800 dark:text-slate-100">{a.name}</span>
                        <span className="block text-xs capitalize text-slate-400">{a.type}</span>
                      </span>
                    </span>
                    <span className={`shrink-0 text-sm font-extrabold ${a.balance < 0 ? "text-rose-600" : "text-slate-900 dark:text-slate-100"}`}>{fmtINR(num(a.balance))}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent Activity" icon={<FileText size={16} />} className="xl:col-span-4">
          {d.recent.length === 0 ? <EmptyState title="Nothing yet" /> : (
            <ul className="space-y-2">
              {d.recent.map((r) => (
                <li key={`${r.type}-${r.id}`}>
                  <Link href={TYPE_TO[r.type] || "/books"} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/50 px-3.5 py-2.5 transition hover:border-indigo-200 hover:bg-indigo-50/40 dark:border-slate-800 dark:bg-slate-800/40 dark:hover:bg-slate-800">
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-[13px] font-bold text-slate-800 dark:text-slate-100">{r.number} <ArrowUpRight size={12} className="text-slate-300" /></span>
                      <span className="block truncate text-xs text-slate-400 dark:text-slate-500">{r.party_name || "—"} · {fmtDate(r.txn_date)}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-extrabold text-slate-900 dark:text-slate-100">{fmtINR(num(r.total))}</span>
                      <Badge tone={STATUS_TONE[r.status] || "EMPLOYEE"} className="mt-0.5">{r.status}</Badge>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Inventory / parties quick links */}
      <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Link href="/books/items"><StatCard label="Inventory Value" value={fmtINR(d.inventoryValue)} icon={<Package size={20} />} accent="indigo" sub="at cost" /></Link>
        <Link href="/books/items"><StatCard label="Low Stock Items" value={d.lowStock} icon={<AlertTriangle size={20} />} accent="rose" /></Link>
        <Link href="/books/customers"><StatCard label="Customers" value={d.customers} icon={<Users2 size={20} />} accent="sky" /></Link>
        <Link href="/books/vendors"><StatCard label="Vendors" value={d.vendors} icon={<Building2 size={20} />} accent="violet" /></Link>
      </div>
    </div>
  );
}
