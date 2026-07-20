"use client";

import { useEffect, useState } from "react";
import { Printer, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { amountInWords, fmtDate, fmtINR, MONTHS } from "@/lib/format";
import { Badge, Button, Modal, PageLoader } from "./ui";
import type { Payslip } from "@/lib/types";
import type { PayComponent } from "@/lib/payroll";

export function PayslipModal({ slipId, onClose }: { slipId: number | null; onClose: () => void }) {
  const [slip, setSlip] = useState<Payslip | null>(null);

  useEffect(() => {
    if (slipId) {
      setSlip(null);
      api<{ slip: Payslip }>(`/api/payroll/${slipId}`).then((d) => setSlip(d.slip)).catch(() => {});
    }
  }, [slipId]);

  let extra: PayComponent[] = [];
  if (slip?.components) {
    try { extra = JSON.parse(slip.components) as PayComponent[]; } catch { extra = []; }
  }
  const extraEarn = extra.filter((c) => c.type === "earning");
  const extraDed = extra.filter((c) => c.type === "deduction");

  return (
    <Modal open={!!slipId} onClose={onClose} title="Payslip" width="max-w-3xl"
      subtitle={slip ? `${MONTHS[slip.month - 1]} ${slip.year} · ${slip.employee_name}` : undefined}>
      {!slip ? (
        <PageLoader />
      ) : (
        <>
          <div id="payslip-print" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between border-b-2 border-slate-800 px-6 py-5">
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white">
                  <Sparkles size={19} />
                </span>
                <div>
                  <p className="text-lg font-extrabold tracking-tight text-slate-900">NexusHR</p>
                  <p className="text-[11px] font-semibold text-slate-400">Gurugram HQ · people@nexushr.in</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-extrabold uppercase tracking-wider text-slate-700">Salary Slip</p>
                <p className="text-xs font-bold text-indigo-600">{MONTHS[slip.month - 1]} {slip.year}</p>
                <Badge tone={slip.status} className="mt-1">{slip.status}</Badge>
              </div>
            </div>

            {/* Employee meta */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-2.5 border-b border-slate-200 px-6 py-4 sm:grid-cols-3">
              {[
                ["Employee", slip.employee_name],
                ["Employee ID", slip.emp_code],
                ["Designation", slip.designation],
                ["Department", slip.department],
                ["Date of Joining", fmtDate(slip.join_date)],
                ["Paid Days", String(slip.paid_days)],
                ["PAN", slip.pan || "—"],
                ["UAN", slip.uan || "—"],
                ["Bank A/c", slip.account_no ? `${slip.bank_name} ·· ${String(slip.account_no).slice(-4)}` : "—"],
              ].map(([k, v]) => (
                <div key={k as string}>
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">{k}</p>
                  <p className="text-[13px] font-bold text-slate-800">{v || "—"}</p>
                </div>
              ))}
            </div>

            {/* Earnings / deductions */}
            <div className="grid grid-cols-1 sm:grid-cols-2">
              <div className="border-b border-slate-200 sm:border-b-0 sm:border-r">
                <p className="bg-emerald-50 px-6 py-2 text-[11px] font-extrabold uppercase tracking-wider text-emerald-700">Earnings</p>
                <ul className="px-6 py-3">
                  {([
                    ["Basic Salary", slip.basic],
                    ["House Rent Allowance", slip.hra],
                    ["Special Allowance", slip.special_allowance],
                    ["Conveyance", slip.conveyance],
                    ...extraEarn.map((c) => [c.name, c.amount] as [string, number]),
                  ] as [string, number][]).map(([k, v], i) => (
                    <li key={`${k}-${i}`} className="flex justify-between py-1.5 text-sm">
                      <span className="text-slate-500">{k}</span>
                      <span className="font-bold text-slate-800">{fmtINR(v)}</span>
                    </li>
                  ))}
                  <li className="mt-2 flex justify-between border-t-2 border-slate-100 pt-2.5 text-sm font-extrabold text-slate-900">
                    <span>Gross Earnings</span><span>{fmtINR(slip.gross)}</span>
                  </li>
                </ul>
              </div>
              <div>
                <p className="bg-rose-50 px-6 py-2 text-[11px] font-extrabold uppercase tracking-wider text-rose-700">Deductions</p>
                <ul className="px-6 py-3">
                  {([
                    ["Provident Fund (12%)", slip.pf],
                    ["Professional Tax", slip.prof_tax],
                    ["TDS (Income Tax)", slip.tds],
                    [`Loss of Pay (${slip.lop_days} day${slip.lop_days === 1 ? "" : "s"})`, slip.lop_amount],
                    ...extraDed.map((c) => [c.name, c.amount] as [string, number]),
                  ] as [string, number][]).map(([k, v], i) => (
                    <li key={`${k}-${i}`} className="flex justify-between py-1.5 text-sm">
                      <span className="text-slate-500">{k}</span>
                      <span className="font-bold text-slate-800">{fmtINR(v)}</span>
                    </li>
                  ))}
                  <li className="mt-2 flex justify-between border-t-2 border-slate-100 pt-2.5 text-sm font-extrabold text-slate-900">
                    <span>Total Deductions</span><span>{fmtINR(slip.total_deductions)}</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Net */}
            <div className="relative flex flex-wrap items-center justify-between gap-2 overflow-hidden bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-600 px-6 py-4 text-white">
              <div className="pointer-events-none absolute -right-8 -top-10 size-32 rounded-full bg-white/10 blur-2xl" />
              <div className="relative">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-indigo-200">Net Pay</p>
                <p className="text-2xl font-extrabold tracking-tight">{fmtINR(slip.net)}</p>
              </div>
              <p className="relative max-w-[55%] text-right text-xs font-semibold italic text-indigo-100">{amountInWords(slip.net)}</p>
            </div>
          </div>

          <p className="mt-3 text-center text-[10.5px] text-slate-400">This is a system-generated payslip and does not require a signature.</p>
          {/* sticky action bar — always reachable even on small screens */}
          <div className="sticky bottom-0 -mx-6 -mb-5 mt-4 flex justify-end gap-2 border-t border-slate-100 bg-white/85 px-6 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={() => window.print()}><Printer size={15} /> Print / Save PDF</Button>
          </div>
        </>
      )}
    </Modal>
  );
}
