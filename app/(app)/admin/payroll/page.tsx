"use client";

import { useCallback, useEffect, useState } from "react";
import { Banknote, Play, CheckCheck, Download, Eye, IndianRupee, Users2, ReceiptText, TrendingUp } from "lucide-react";
import { api } from "@/lib/api";
import { downloadCSV, fmtINR, MONTHS } from "@/lib/format";
import { Badge, Button, Card, ConfirmModal, DataTable, PageHeader, PageLoader, PersonCell, Select, StatCard, useToast } from "@/components/ui";
import { BarChart } from "@/components/charts";
import { PayslipModal } from "@/components/payslip";
import { useMe } from "@/components/shell";
import type { Payslip } from "@/lib/types";

type SlipRow = Payslip & { avatar_color?: string | null };

interface PayrollAdminData {
  month: number;
  year: number;
  slips: SlipRow[];
  summary: { generated: boolean; count: number; grossTotal: number; netTotal: number; deductionTotal: number; allPaid: boolean; activeCount: number; estimated: number };
  history: { month: number; year: number; total: number; count: number }[];
}

export default function AdminPayrollPage() {
  const me = useMe();
  const isAdmin = me.role === "ADMIN";
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<PayrollAdminData | null>(null);
  const [viewSlip, setViewSlip] = useState<number | null>(null);
  const [confirmRun, setConfirmRun] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const load = useCallback(() => {
    api<PayrollAdminData>(`/api/payroll?month=${month}&year=${year}`).then(setData).catch(() => {});
  }, [month, year]);
  useEffect(() => { load(); }, [load]);

  if (!data) return <PageLoader />;
  const s = data.summary;

  const runPayroll = async () => {
    setBusy(true);
    try {
      const res = await api<{ created: number }>("/api/payroll", { method: "POST", body: JSON.stringify({ month, year }) });
      toast.push("success", `Payroll run complete — ${res.created} payslips generated 💸`);
      setConfirmRun(false);
      load();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Payroll run failed");
    } finally {
      setBusy(false);
    }
  };

  const markPaid = async () => {
    setBusy(true);
    try {
      const res = await api<{ updated: number }>("/api/payroll", { method: "PATCH", body: JSON.stringify({ month, year }) });
      toast.push("success", `${res.updated} payslips marked as paid ✓`);
      load();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  };

  const exportCSV = () =>
    downloadCSV(
      `payroll_${year}_${String(month).padStart(2, "0")}.csv`,
      ["Code", "Employee", "Department", "Basic", "HRA", "Special", "Conveyance", "Gross", "PF", "Prof Tax", "TDS", "LOP Days", "LOP Amount", "Deductions", "Net Pay", "Status"],
      data.slips.map((r) => [r.emp_code, r.employee_name, r.department, r.basic, r.hra, r.special_allowance, r.conveyance, r.gross, r.pf, r.prof_tax, r.tds, r.lop_days, r.lop_amount, r.total_deductions, r.net, r.status])
    );

  const years = [year - 1, year, year + 1].filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div className="fade-up">
      <PageHeader
        title="Payroll Console"
        subtitle={isAdmin ? "Run monthly payroll, track payouts and manage payslips" : "Track payouts and payslips (read-only)"}
        icon={<Banknote size={20} />}
        actions={
          <span className="flex flex-wrap items-center gap-2">
            <Select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="!w-auto">
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </Select>
            <Select value={year} onChange={(e) => setYear(Number(e.target.value))} className="!w-auto">
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
            <Button variant="outline" onClick={exportCSV} disabled={!s.generated}><Download size={14} /> CSV</Button>
            {isAdmin && !s.generated && (
              <Button onClick={() => setConfirmRun(true)}><Play size={14} /> Run Payroll</Button>
            )}
            {isAdmin && s.generated && !s.allPaid && (
              <Button variant="success" onClick={markPaid} loading={busy}><CheckCheck size={15} /> Mark All Paid</Button>
            )}
          </span>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard
          label={s.generated ? "Net Payout" : "Estimated Payout"}
          value={fmtINR(s.generated ? s.netTotal : s.estimated)}
          icon={<IndianRupee size={20} />}
          accent="indigo"
          sub={s.generated ? `${MONTHS[month - 1]} ${year} — generated ✓` : "Based on current salary structures"}
        />
        <StatCard label="Payslips" value={s.generated ? s.count : `0 / ${s.activeCount}`} icon={<Users2 size={20} />} accent="violet" sub={s.generated ? (s.allPaid ? "All paid ✓" : "Awaiting payment") : "Not generated yet"} />
        <StatCard label="Gross Total" value={fmtINR(s.grossTotal)} icon={<TrendingUp size={20} />} accent="emerald" />
        <StatCard label="Total Deductions" value={fmtINR(s.deductionTotal)} icon={<ReceiptText size={20} />} accent="rose" sub="PF · PT · TDS · LOP" />
      </div>

      <div className="grid grid-cols-1 gap-4">
        {data.history.length > 0 && (
          <Card title="Payout History" icon={<TrendingUp size={16} />}>
            <BarChart
              data={data.history.slice(-6).map((h) => ({ label: `${MONTHS[h.month - 1].slice(0, 3)} ${String(h.year).slice(2)}`, value: Math.round(h.total) }))}
              format={(v) => `₹${(v / 100000).toFixed(1)}L`}
            />
          </Card>
        )}

        <Card
          title={`Payslips — ${MONTHS[month - 1]} ${year}`}
          icon={<Banknote size={16} />}
          action={<span className="text-xs font-semibold text-slate-400 dark:text-slate-500">{data.slips.length} payslips</span>}
        >
          <DataTable
            rows={data.slips}
            keyFor={(r) => r.id}
            empty={
              <div className="py-4 text-center">
                <p className="text-sm font-bold text-slate-500 dark:text-slate-400">No payroll run for {MONTHS[month - 1]} {year} yet</p>
                {isAdmin && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Hit “Run Payroll” to generate payslips for all {s.activeCount} active employees — LWP days are deducted automatically.</p>}
              </div>
            }
            columns={[
              { key: "emp", header: "Employee", render: (r) => <PersonCell name={r.employee_name || ""} sub={`${r.emp_code} · ${r.department || "—"}`} color={r.avatar_color} /> },
              { key: "gross", header: "Gross", render: (r) => <span className="font-semibold">{fmtINR(r.gross)}</span> },
              {
                key: "ded", header: "Deductions",
                render: (r) => (
                  <span>
                    <span className="block font-semibold text-rose-500 dark:text-rose-400">−{fmtINR(r.total_deductions)}</span>
                    {r.lop_days > 0 && <span className="text-[10px] font-bold text-amber-600 dark:text-amber-300">{r.lop_days} LOP day{r.lop_days === 1 ? "" : "s"}</span>}
                  </span>
                ),
              },
              { key: "net", header: "Net Pay", render: (r) => <span className="text-sm font-extrabold text-emerald-600 dark:text-emerald-300">{fmtINR(r.net)}</span> },
              { key: "status", header: "Status", render: (r) => <Badge tone={r.status}>{r.status}</Badge> },
              {
                key: "view", header: "", className: "text-right",
                render: (r) => (
                  <button onClick={() => setViewSlip(r.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 px-3 py-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-300 transition hover:bg-indigo-100 cursor-pointer">
                    <Eye size={13} /> Payslip
                  </button>
                ),
              },
            ]}
          />
        </Card>
      </div>

      <PayslipModal slipId={viewSlip} onClose={() => setViewSlip(null)} />

      <ConfirmModal
        open={confirmRun}
        onClose={() => setConfirmRun(false)}
        onConfirm={runPayroll}
        loading={busy}
        title={`Run payroll for ${MONTHS[month - 1]} ${year}?`}
        message={`This generates payslips for all ${s.activeCount} active employees (~${fmtINR(s.estimated)} gross). Approved Leave-Without-Pay days in the month are deducted automatically. You can mark everything paid afterwards.`}
        confirmLabel="Run Payroll"
      />
    </div>
  );
}
