"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Printer, X, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, fmtINR, amountInWords } from "@/lib/format";
import { TXN_META, type TxnType } from "@/lib/books";
import type { BooksTxn } from "@/lib/types";

type FullTxn = BooksTxn & { party_name?: string; party_company?: string; party_email?: string; party_phone?: string; party_gstin?: string; party_address?: string };

export default function PrintDocPage() {
  const { id } = useParams<{ id: string }>();
  const [t, setT] = useState<FullTxn | null>(null);
  useEffect(() => {
    api<{ txn: FullTxn }>(`/api/books/txns/${id}`).then((d) => setT(d.txn)).catch(() => {});
  }, [id]);

  if (!t) return <div className="grid min-h-screen place-items-center bg-slate-100 text-slate-400">Loading…</div>;
  const meta = TXN_META[t.type as TxnType] ?? { label: "Document" };
  const docTitle = t.type === "invoice" ? "TAX INVOICE" : meta.label.toUpperCase();
  const balance = t.total - t.paid;

  return (
    <div className="min-h-screen bg-slate-200 py-8 print:bg-white print:py-0 [color-scheme:light]">
      <style>{`@media print { .no-print { display: none !important; } @page { size: A4; margin: 14mm; } body { background: #fff; } }`}</style>

      {/* Action bar (hidden when printing) */}
      <div className="no-print mx-auto mb-4 flex max-w-[820px] items-center justify-between px-4">
        <button onClick={() => window.close()} className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-sm font-bold text-slate-600 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"><X size={15} /> Close</button>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-2 text-sm font-bold text-white shadow-md hover:-translate-y-px"><Printer size={15} /> Print / Save as PDF</button>
      </div>

      {/* The document */}
      <div className="mx-auto max-w-[820px] bg-white p-10 text-slate-800 shadow-xl print:max-w-none print:p-0 print:shadow-none">
        {/* Header */}
        <div className="flex items-start justify-between border-b-2 border-slate-800 pb-5">
          <div className="flex items-center gap-3">
            <span className="grid size-12 place-items-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white"><Sparkles size={24} /></span>
            <div>
              <p className="text-2xl font-extrabold tracking-tight">NexusHR <span className="text-indigo-600">Books</span></p>
              <p className="text-xs text-slate-500">123 Business Park, Mumbai 400051 · GSTIN 27AAAAA0000A1Z5</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black tracking-tight text-slate-800">{docTitle}</p>
            <p className="text-sm font-bold text-indigo-600">{t.number}</p>
          </div>
        </div>

        {/* Meta */}
        <div className="mt-6 flex justify-between gap-6">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">{meta.party === "vendor" ? "Vendor" : "Bill To"}</p>
            <p className="mt-1 text-base font-extrabold text-slate-800">{t.party_name || "—"}</p>
            {t.party_company && <p className="text-sm text-slate-600">{t.party_company}</p>}
            {t.party_address && <p className="max-w-[260px] text-xs text-slate-500">{t.party_address}</p>}
            {t.party_gstin && <p className="text-xs text-slate-500">GSTIN: {t.party_gstin}</p>}
            {t.party_phone && <p className="text-xs text-slate-500">{t.party_phone}</p>}
          </div>
          <div className="text-right text-sm">
            <div className="mb-1"><span className="text-slate-400">Date: </span><span className="font-semibold">{fmtDate(t.txn_date)}</span></div>
            {t.due_date && <div className="mb-1"><span className="text-slate-400">{t.type === "quote" ? "Valid Till: " : "Due: "}</span><span className="font-semibold">{fmtDate(t.due_date)}</span></div>}
            <div><span className="text-slate-400">Status: </span><span className="font-semibold">{t.status}</span></div>
          </div>
        </div>

        {/* Lines */}
        <table className="mt-7 w-full border-collapse text-sm">
          <thead>
            <tr className="bg-slate-800 text-white">
              <th className="px-3 py-2.5 text-left font-bold">#</th>
              <th className="px-3 py-2.5 text-left font-bold">Item & Description</th>
              <th className="px-3 py-2.5 text-right font-bold">Qty</th>
              <th className="px-3 py-2.5 text-right font-bold">Rate</th>
              <th className="px-3 py-2.5 text-right font-bold">GST</th>
              <th className="px-3 py-2.5 text-right font-bold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {(t.lines || []).map((l, i) => (
              <tr key={i} className="border-b border-slate-200">
                <td className="px-3 py-2.5 text-slate-500">{i + 1}</td>
                <td className="px-3 py-2.5 font-semibold text-slate-800">{l.name}</td>
                <td className="px-3 py-2.5 text-right text-slate-600">{l.qty}</td>
                <td className="px-3 py-2.5 text-right text-slate-600">{fmtINR(l.rate)}</td>
                <td className="px-3 py-2.5 text-right text-slate-600">{l.tax_rate}%</td>
                <td className="px-3 py-2.5 text-right font-bold text-slate-800">{fmtINR(l.amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div className="mt-5 flex justify-end">
          <div className="w-72 space-y-1.5 text-sm">
            <div className="flex justify-between text-slate-600"><span>Subtotal</span><span className="font-semibold">{fmtINR(t.subtotal)}</span></div>
            <div className="flex justify-between text-slate-600"><span>GST</span><span className="font-semibold">{fmtINR(t.tax)}</span></div>
            <div className="flex justify-between border-t-2 border-slate-800 pt-2 text-base font-black text-slate-900"><span>Total</span><span>{fmtINR(t.total)}</span></div>
            {(t.type === "invoice" || t.type === "bill") && t.paid > 0 && (
              <>
                <div className="flex justify-between text-emerald-600"><span>Paid</span><span>−{fmtINR(t.paid)}</span></div>
                <div className="flex justify-between font-bold text-rose-600"><span>Balance Due</span><span>{fmtINR(balance)}</span></div>
              </>
            )}
          </div>
        </div>

        <p className="mt-4 text-xs italic text-slate-500">Amount in words: {amountInWords(t.total)}</p>
        {t.notes && <div className="mt-5 rounded-lg bg-slate-50 p-3 text-xs text-slate-600"><span className="font-bold">Notes: </span>{t.notes}</div>}

        <div className="mt-10 flex items-end justify-between border-t border-slate-200 pt-5">
          <p className="text-xs text-slate-400">This is a computer-generated document.</p>
          <div className="text-center">
            <div className="h-12 w-40 border-b border-slate-300" />
            <p className="mt-1 text-xs font-semibold text-slate-500">Authorised Signatory</p>
          </div>
        </div>
      </div>
    </div>
  );
}
