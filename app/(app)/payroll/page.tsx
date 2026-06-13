"use client";

import { useEffect, useState } from "react";
import { Wallet, Eye, IndianRupee, PiggyBank, ReceiptText, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { fmtINR, MONTHS } from "@/lib/format";
import { Badge, Card, DataTable, PageHeader, PageLoader, StatCard } from "@/components/ui";
import { PayslipModal } from "@/components/payslip";
import type { Payslip } from "@/lib/types";

interface PayrollData {
  slips: Payslip[];
  structure: { basic: number; hra: number; special_allowance: number; conveyance: number; gross: number };
  ytd: { net: number; ded: number };
}

export default function PayrollPage() {
  const [data, setData] = useState<PayrollData | null>(null);
  const [viewSlip, setViewSlip] = useState<number | null>(null);

  useEffect(() => {
    api<PayrollData>("/api/payroll?mine=1").then(setData).catch(() => {});
  }, []);

  if (!data) return <PageLoader />;
  const s = data.structure;

  return (
    <div className="fade-up">
      <PageHeader title="My Payroll" subtitle="Salary structure, payslips and year-to-date earnings" icon={<Wallet size={20} />} />

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Monthly Gross" value={fmtINR(s.gross)} icon={<IndianRupee size={20} />} accent="indigo" sub="Current structure" />
        <StatCard label="Annual CTC" value={fmtINR(s.gross * 12)} icon={<TrendingUp size={20} />} accent="violet" />
        <StatCard label="YTD Net Credited" value={fmtINR(data.ytd.net)} icon={<PiggyBank size={20} />} accent="emerald" sub={`${new Date().getFullYear()} so far`} />
        <StatCard label="YTD Deductions" value={fmtINR(data.ytd.ded)} icon={<ReceiptText size={20} />} accent="rose" sub="PF · PT · TDS" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <Card title="Salary Structure" icon={<IndianRupee size={16} />} className="xl:col-span-4">
          <ul className="space-y-1">
            {[
              ["Basic Salary", s.basic, "50%"],
              ["House Rent Allowance", s.hra, "20%"],
              ["Special Allowance", s.special_allowance, ""],
              ["Conveyance", s.conveyance, ""],
            ].map(([k, v]) => (
              <li key={k as string} className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 py-3 last:border-0">
                <span className="text-sm font-semibold text-slate-500 dark:text-slate-400">{k}</span>
                <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{fmtINR(v as number)}</span>
              </li>
            ))}
            <li className="mt-2 flex items-center justify-between rounded-xl bg-gradient-to-r from-indigo-50 to-violet-50 dark:from-indigo-500/15 dark:to-violet-500/15 px-4 py-3">
              <span className="text-sm font-extrabold text-indigo-900">Gross / month</span>
              <span className="text-base font-extrabold text-indigo-700 dark:text-indigo-300">{fmtINR(s.gross)}</span>
            </li>
          </ul>
          <p className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Standard deductions applied on payroll: PF (12% of basic), professional tax and TDS as per slab. Loss-of-pay days reduce net pay proportionally.
          </p>
        </Card>

        <Card title="Payslip History" icon={<Wallet size={16} />} className="xl:col-span-8"
          action={<span className="text-xs font-semibold text-slate-400 dark:text-slate-500">{data.slips.length} payslips</span>}>
          <DataTable
            rows={data.slips}
            keyFor={(r) => r.id}
            empty={<p className="text-center text-sm text-slate-400 dark:text-slate-500">No payslips yet — they appear here after each payroll run.</p>}
            columns={[
              {
                key: "month", header: "Month",
                render: (r) => (
                  <span className="flex items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-violet-50 dark:bg-violet-500/15 text-sm font-extrabold text-violet-700 dark:text-violet-300">
                      {MONTHS[r.month - 1].slice(0, 3)}
                    </span>
                    <span>
                      <span className="block text-sm font-bold text-slate-800 dark:text-slate-100">{MONTHS[r.month - 1]} {r.year}</span>
                      <span className="block text-xs text-slate-400 dark:text-slate-500">{r.paid_days} paid days</span>
                    </span>
                  </span>
                ),
              },
              { key: "gross", header: "Gross", render: (r) => <span className="font-semibold">{fmtINR(r.gross)}</span> },
              { key: "ded", header: "Deductions", render: (r) => <span className="font-semibold text-rose-500 dark:text-rose-400">−{fmtINR(r.total_deductions)}</span> },
              { key: "net", header: "Net Pay", render: (r) => <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-300">{fmtINR(r.net)}</span> },
              { key: "status", header: "Status", render: (r) => <Badge tone={r.status}>{r.status}</Badge> },
              {
                key: "view", header: "", className: "text-right",
                render: (r) => (
                  <button onClick={() => setViewSlip(r.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 px-3 py-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-300 transition hover:bg-indigo-100 cursor-pointer">
                    <Eye size={13} /> View
                  </button>
                ),
              },
            ]}
          />
        </Card>
      </div>

      <PayslipModal slipId={viewSlip} onClose={() => setViewSlip(null)} />
    </div>
  );
}
