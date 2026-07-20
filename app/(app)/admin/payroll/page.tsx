"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Banknote, Play, CheckCheck, Download, Eye, IndianRupee, Users2, ReceiptText, TrendingUp, Send, SlidersHorizontal, Plus, X, Calculator, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import { downloadCSV, fmtINR, MONTHS } from "@/lib/format";
import type { PayComponent } from "@/lib/payroll";
import { Badge, Button, Card, ConfirmModal, DataTable, Field, Input, Modal, PageHeader, PageLoader, PersonCell, Select, StatCard, useToast, cn } from "@/components/ui";
import { BarChart } from "@/components/charts";
import { PayslipModal } from "@/components/payslip";
import { useMe } from "@/components/shell";
import type { Payslip } from "@/lib/types";

type SlipRow = Payslip & { avatar_color?: string | null };

interface PayrollAdminData {
  month: number;
  year: number;
  slips: SlipRow[];
  summary: { generated: boolean; count: number; grossTotal: number; netTotal: number; deductionTotal: number; allPaid: boolean; draftCount: number; published: boolean; activeCount: number; estimated: number };
  history: { month: number; year: number; total: number; count: number }[];
}

type AdjustForm = { basic: number; hra: number; special_allowance: number; conveyance: number; pf: number; prof_tax: number; tds: number; lop_days: number; lop_amount: number };
const EMPTY_ADJ: AdjustForm = { basic: 0, hra: 0, special_allowance: 0, conveyance: 0, pf: 0, prof_tax: 0, tds: 0, lop_days: 0, lop_amount: 0 };

export default function AdminPayrollPage() {
  const me = useMe();
  const canManage = me.role !== "EMPLOYEE"; // HR + Admin run, reconcile and release payroll
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState<PayrollAdminData | null>(null);
  const [viewSlip, setViewSlip] = useState<number | null>(null);
  const [confirmRun, setConfirmRun] = useState(false);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [confirmRerun, setConfirmRerun] = useState(false);
  const [busy, setBusy] = useState(false);
  const [adjustSlip, setAdjustSlip] = useState<SlipRow | null>(null);
  const [regenSlip, setRegenSlip] = useState<SlipRow | null>(null);
  const [adjustForm, setAdjustForm] = useState<AdjustForm>(EMPTY_ADJ);
  const [adjustLines, setAdjustLines] = useState<PayComponent[]>([]);
  const toast = useToast();

  const load = useCallback(() => {
    api<PayrollAdminData>(`/api/payroll?month=${month}&year=${year}`).then(setData).catch(() => {});
  }, [month, year]);
  useEffect(() => { load(); }, [load]);

  // Live recompute while editing — pure sums, exactly how the server stores them.
  const adjustPreview = useMemo(() => {
    const f = adjustForm;
    const earnLines = adjustLines.filter((l) => l.type === "earning").reduce((a, l) => a + (Number(l.amount) || 0), 0);
    const dedLines = adjustLines.filter((l) => l.type === "deduction").reduce((a, l) => a + (Number(l.amount) || 0), 0);
    const gross = f.basic + f.hra + f.special_allowance + f.conveyance + earnLines;
    const total_deductions = f.pf + f.prof_tax + f.tds + f.lop_amount + dedLines;
    return { gross, total_deductions, net: gross - total_deductions };
  }, [adjustForm, adjustLines]);

  if (!data) return <PageLoader />;
  const s = data.summary;

  const openAdjust = (r: SlipRow) => {
    let lines: PayComponent[] = [];
    try { lines = r.components ? JSON.parse(r.components) : []; } catch { lines = []; }
    setAdjustForm({ basic: r.basic, hra: r.hra, special_allowance: r.special_allowance, conveyance: r.conveyance, pf: r.pf, prof_tax: r.prof_tax, tds: r.tds, lop_days: r.lop_days, lop_amount: r.lop_amount });
    setAdjustLines(lines);
    setAdjustSlip(r);
  };
  const setF = (k: keyof AdjustForm, v: string) => setAdjustForm((p) => ({ ...p, [k]: Math.max(0, Number(v) || 0) }));
  const recalcStatutory = () => setAdjustForm((p) => {
    const gross = p.basic + p.hra + p.special_allowance + p.conveyance + adjustLines.filter((l) => l.type === "earning").reduce((a, l) => a + (Number(l.amount) || 0), 0);
    const rate = gross <= 60000 ? 0.03 : gross <= 100000 ? 0.06 : 0.1;
    return { ...p, pf: Math.round(p.basic * 0.12), prof_tax: gross > 21000 ? 200 : 0, tds: Math.round(gross * rate) };
  });
  const saveAdjust = async () => {
    if (!adjustSlip) return;
    const clean = adjustLines.map((l) => ({ ...l, name: l.name.trim() }));
    if (clean.some((l) => !l.name || !(Number(l.amount) > 0))) return toast.push("error", "Each additional line needs a label and a positive amount");
    setBusy(true);
    try {
      await api(`/api/payroll/${adjustSlip.id}`, { method: "PATCH", body: JSON.stringify({ ...adjustForm, components: clean }) });
      toast.push("success", `${adjustSlip.employee_name}'s payslip updated ✓`);
      setAdjustSlip(null);
      load();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  };

  const publishAll = async () => {
    setBusy(true);
    try {
      const res = await api<{ published: number }>("/api/payroll", { method: "PATCH", body: JSON.stringify({ action: "publish", month, year }) });
      toast.push("success", `${res.published} payslips published — now visible to employees ✓`);
      setConfirmPublish(false);
      load();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Publish failed");
    } finally {
      setBusy(false);
    }
  };

  const regenerateSlip = async () => {
    if (!regenSlip) return;
    setBusy(true);
    try {
      await api(`/api/payroll/${regenSlip.id}`, { method: "PATCH", body: JSON.stringify({ regenerate: true }) });
      toast.push("success", `${regenSlip.employee_name}'s payslip regenerated from current salary ✓`);
      setRegenSlip(null);
      load();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Failed to regenerate");
    } finally {
      setBusy(false);
    }
  };

  const rerunPayroll = async () => {
    setBusy(true);
    try {
      const res = await api<{ created: number }>("/api/payroll", { method: "POST", body: JSON.stringify({ month, year, rerun: true }) });
      toast.push("success", `Payroll re-run — ${res.created} draft payslips regenerated from current salaries 💸`);
      setConfirmRerun(false);
      load();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Re-run failed");
    } finally {
      setBusy(false);
    }
  };

  const runPayroll = async () => {
    setBusy(true);
    try {
      const res = await api<{ created: number }>("/api/payroll", { method: "POST", body: JSON.stringify({ month, year }) });
      toast.push("success", `${res.created} draft payslips generated — review, adjust, then publish 💸`);
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
      const res = await api<{ updated: number }>("/api/payroll", { method: "PATCH", body: JSON.stringify({ action: "pay", month, year }) });
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
        subtitle={canManage ? "Run, reconcile and release monthly payroll" : "Track payouts and payslips (read-only)"}
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
            {canManage && !s.generated && (
              <Button onClick={() => setConfirmRun(true)}><Play size={14} /> Run Payroll</Button>
            )}
            {canManage && s.draftCount > 0 && (
              <Button variant="outline" onClick={() => setConfirmRerun(true)} loading={busy}><RotateCcw size={14} /> Re-run</Button>
            )}
            {canManage && s.draftCount > 0 && (
              <Button onClick={() => setConfirmPublish(true)} loading={busy}><Send size={14} /> Publish {s.draftCount}</Button>
            )}
            {canManage && s.published && !s.allPaid && (
              <Button variant="success" onClick={markPaid} loading={busy}><CheckCheck size={15} /> Mark All Paid</Button>
            )}
          </span>
        }
      />

      {canManage && s.draftCount > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 dark:border-amber-500/25 dark:bg-amber-500/10">
          <SlidersHorizontal size={18} className="shrink-0 text-amber-600 dark:text-amber-300" />
          <p className="flex-1 text-[13px] font-semibold text-amber-900/80 dark:text-amber-200">
            <span className="font-extrabold">{s.draftCount} payslip{s.draftCount === 1 ? "" : "s"} in draft.</span> <span className="font-bold">Adjust</span> any employee, use <span className="font-bold">Re-run</span> to regenerate from current salaries, then <span className="font-bold">Publish</span> — employees only see payslips after they&apos;re published.
          </p>
        </div>
      )}

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
                {canManage && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Hit “Run Payroll” to generate draft payslips for all {s.activeCount} active employees — LWP days are deducted automatically.</p>}
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
                  <span className="flex justify-end gap-1.5">
                    {canManage && r.status !== "Paid" && (
                      <button onClick={() => setRegenSlip(r)} className="grid size-[30px] place-items-center rounded-lg bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 cursor-pointer dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-slate-200" title="Regenerate from current salary">
                        <RotateCcw size={13} />
                      </button>
                    )}
                    {canManage && r.status !== "Paid" && (
                      <button onClick={() => openAdjust(r)} className="inline-flex items-center gap-1.5 rounded-lg bg-amber-50 dark:bg-amber-500/15 px-3 py-1.5 text-xs font-bold text-amber-700 dark:text-amber-300 transition hover:bg-amber-100 cursor-pointer" title="Adjust this payslip">
                        <SlidersHorizontal size={13} /> Adjust
                      </button>
                    )}
                    <button onClick={() => setViewSlip(r.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 px-3 py-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-300 transition hover:bg-indigo-100 cursor-pointer">
                      <Eye size={13} /> Payslip
                    </button>
                  </span>
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
        message={`This generates DRAFT payslips for all ${s.activeCount} active employees (~${fmtINR(s.estimated)} gross). Approved Leave-Without-Pay days are deducted automatically. Drafts stay hidden from employees — reconcile and Publish to release them.`}
        confirmLabel="Run Payroll"
      />

      <ConfirmModal
        open={confirmPublish}
        onClose={() => setConfirmPublish(false)}
        onConfirm={publishAll}
        loading={busy}
        title={`Publish ${s.draftCount} payslip${s.draftCount === 1 ? "" : "s"}?`}
        message={`Once published, ${MONTHS[month - 1]} ${year} payslips become visible to employees in My Payroll. Make sure all adjustments are done first.`}
        confirmLabel="Publish payslips"
      />

      <ConfirmModal
        open={confirmRerun}
        onClose={() => setConfirmRerun(false)}
        onConfirm={rerunPayroll}
        loading={busy}
        danger
        title={`Re-run ${MONTHS[month - 1]} ${year} payroll?`}
        message={`This discards the ${s.draftCount} DRAFT payslip${s.draftCount === 1 ? "" : "s"} and regenerates them from the current salaries, pay components and LOP days. Any manual draft adjustments will be lost. Published & paid payslips are NOT affected.`}
        confirmLabel="Discard drafts & re-run"
      />

      <ConfirmModal
        open={!!regenSlip}
        onClose={() => setRegenSlip(null)}
        onConfirm={regenerateSlip}
        loading={busy}
        title={`Regenerate ${regenSlip?.employee_name || ""}'s payslip?`}
        message={`Re-pulls ${regenSlip?.employee_name || "this employee"}'s CURRENT salary, pay components and LOP for ${MONTHS[month - 1]} ${year} and recomputes the slip — use this after changing their salary. Any manual adjustments on this slip are replaced.${regenSlip?.status === "Generated" ? " The new amount becomes visible to the employee right away." : ""}`}
        confirmLabel="Regenerate"
      />

      <Modal open={!!adjustSlip} onClose={() => setAdjustSlip(null)} title={`Edit payslip — ${adjustSlip?.employee_name || ""}`} subtitle={`${MONTHS[month - 1]} ${year} only — edit any value; gross, deductions & net recompute live`} width="max-w-2xl">
        <div className="space-y-5">
          {/* live summary */}
          <div className="grid grid-cols-3 gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
            <div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Gross</p><p className="mt-0.5 text-sm font-extrabold text-slate-800 dark:text-slate-100">{fmtINR(adjustPreview.gross)}</p></div>
            <div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Deductions</p><p className="mt-0.5 text-sm font-extrabold text-rose-500 dark:text-rose-400">−{fmtINR(adjustPreview.total_deductions)}</p></div>
            <div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Net Pay</p><p className="mt-0.5 text-base font-extrabold text-emerald-600 dark:text-emerald-300">{fmtINR(adjustPreview.net)}</p></div>
          </div>

          {/* Earnings */}
          <div>
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Earnings</p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Basic Pay (₹)"><Input type="number" min="0" value={adjustForm.basic} onChange={(e) => setF("basic", e.target.value)} /></Field>
              <Field label="HRA (₹)"><Input type="number" min="0" value={adjustForm.hra} onChange={(e) => setF("hra", e.target.value)} /></Field>
              <Field label="Special Allowance (₹)"><Input type="number" min="0" value={adjustForm.special_allowance} onChange={(e) => setF("special_allowance", e.target.value)} /></Field>
              <Field label="Conveyance (₹)"><Input type="number" min="0" value={adjustForm.conveyance} onChange={(e) => setF("conveyance", e.target.value)} /></Field>
            </div>
          </div>

          {/* Statutory deductions */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-[11px] font-extrabold uppercase tracking-wider text-rose-500 dark:text-rose-400">Deductions</p>
              <button onClick={recalcStatutory} className="inline-flex items-center gap-1 rounded-lg bg-indigo-50 px-2.5 py-1 text-[11px] font-bold text-indigo-600 transition hover:bg-indigo-100 cursor-pointer dark:bg-indigo-500/15 dark:text-indigo-300" title="Recompute PF (12% of basic), Professional Tax & TDS from the standard formula">
                <Calculator size={12} /> Auto PF &amp; Tax
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label="Provident Fund (₹)"><Input type="number" min="0" value={adjustForm.pf} onChange={(e) => setF("pf", e.target.value)} /></Field>
              <Field label="Professional Tax (₹)"><Input type="number" min="0" value={adjustForm.prof_tax} onChange={(e) => setF("prof_tax", e.target.value)} /></Field>
              <Field label="TDS / Income Tax (₹)"><Input type="number" min="0" value={adjustForm.tds} onChange={(e) => setF("tds", e.target.value)} /></Field>
              <Field label="Loss of Pay (₹)"><Input type="number" min="0" value={adjustForm.lop_amount} onChange={(e) => setF("lop_amount", e.target.value)} /></Field>
              <Field label="LOP Days"><Input type="number" min="0" value={adjustForm.lop_days} onChange={(e) => setF("lop_days", e.target.value)} /></Field>
            </div>
          </div>

          {/* Additional lines */}
          <div>
            <p className="mb-2 text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Incentives · Reimbursements · Other lines</p>
            <div className="space-y-2">
              {adjustLines.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-200 py-3 text-center text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500">Add a bonus, incentive, reimbursement, advance recovery, fine, etc.</p>
              )}
              {adjustLines.map((l, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input placeholder="Label (e.g. Performance bonus)" value={l.name} onChange={(e) => setAdjustLines((a) => a.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="min-w-0 flex-1" />
                  <Select value={l.type} onChange={(e) => setAdjustLines((a) => a.map((x, j) => (j === i ? { ...x, type: e.target.value as "earning" | "deduction" } : x)))} className="!w-32 shrink-0">
                    <option value="earning">Earning</option>
                    <option value="deduction">Deduction</option>
                  </Select>
                  <Input type="number" min="1" placeholder="₹" value={l.amount || ""} onChange={(e) => setAdjustLines((a) => a.map((x, j) => (j === i ? { ...x, amount: Number(e.target.value) } : x)))} className={cn("!w-28 shrink-0", l.type === "deduction" && "text-rose-600 dark:text-rose-400")} />
                  <button onClick={() => setAdjustLines((a) => a.filter((_, j) => j !== i))} className="shrink-0 rounded-lg p-2 text-rose-500 transition hover:bg-rose-50 cursor-pointer dark:text-rose-400 dark:hover:bg-rose-500/15" title="Remove line"><X size={16} /></button>
                </div>
              ))}
            </div>
            <Button variant="outline" className="mt-2" onClick={() => setAdjustLines((a) => [...a, { name: "", type: "earning", amount: 0 }])}><Plus size={14} /> Add line</Button>
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <Button variant="outline" onClick={() => setAdjustSlip(null)}>Cancel</Button>
            <Button onClick={saveAdjust} loading={busy}>Save Payslip</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
