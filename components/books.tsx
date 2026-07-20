"use client";

import { useMemo, useState } from "react";
import { Plus, X, Send, Trash2, FileText, Receipt, CreditCard, ArrowRightLeft, Building2, UserRound, Mail, Phone, Pencil, Printer } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/swr";
import { fmtDate, fmtINR, todayStr } from "@/lib/format";
import { TXN_META, type TxnType } from "@/lib/books";
import { Badge, Button, Card, ConfirmModal, DataTable, Field, Input, Modal, PageHeader, PageLoader, PersonCell, Select, StatCard, Textarea, useToast, cn } from "@/components/ui";
import { useMe } from "@/components/shell";
import type { BooksItem, BooksParty, BooksTxn } from "@/lib/types";

type Line = { item_id: number | null; name: string; qty: number | string; rate: number | string; tax_rate: number | string };

const STATUS_TONE: Record<string, string> = {
  Draft: "Draft", Sent: "Generated", Open: "Generated", Accepted: "Approved", Invoiced: "Approved",
  Paid: "Paid", "Partially Paid": "Pending", Overdue: "Rejected", Declined: "Rejected",
};
const tone = (s: string) => STATUS_TONE[s] || "EMPLOYEE";

/* ====================== Create a document ====================== */
function DocEditor({ type, items, parties, onClose, onSaved }: {
  type: TxnType; items: BooksItem[]; parties: BooksParty[]; onClose: () => void; onSaved: () => void;
}) {
  const meta = TXN_META[type];
  const priceField: "rate" | "purchase_rate" = (type === "bill" || type === "vendor_credit") ? "purchase_rate" : "rate";
  const [partyId, setPartyId] = useState("");
  const [txnDate, setTxnDate] = useState(todayStr());
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([{ item_id: null, name: "", qty: 1, rate: 0, tax_rate: 18 }]);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const setLine = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pickItem = (i: number, val: string) => {
    const it = items.find((x) => x.id === Number(val));
    if (it) setLine(i, { item_id: it.id, name: it.name, rate: it[priceField] ?? it.rate, tax_rate: it.tax_rate });
    else setLine(i, { item_id: null });
  };

  const totals = useMemo(() => {
    let sub = 0, tax = 0;
    for (const l of lines) {
      const amt = (Number(l.qty) || 0) * (Number(l.rate) || 0);
      sub += amt; tax += (amt * (Number(l.tax_rate) || 0)) / 100;
    }
    return { sub: Math.round(sub), tax: Math.round(tax), total: Math.round(sub + tax) };
  }, [lines]);

  const submit = async () => {
    if (!partyId) return toast.push("error", `Select a ${meta.party}`);
    const clean = lines.filter((l) => String(l.name).trim() && Number(l.qty) > 0);
    if (!clean.length) return toast.push("error", "Add at least one line item");
    setBusy(true);
    try {
      const res = await api<{ number: string }>("/api/books/txns", {
        method: "POST",
        body: JSON.stringify({ type, party_id: Number(partyId), txn_date: txnDate, due_date: dueDate || null, notes, lines: clean }),
      });
      toast.push("success", `${meta.label} ${res.number} created ✓`);
      onSaved();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Failed to create");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`New ${meta.label}`} subtitle={`Pick a ${meta.party}, add items — totals & GST compute automatically`} width="max-w-3xl">
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label={meta.party === "vendor" ? "Vendor" : "Customer"} required>
            <Select value={partyId} onChange={(e) => setPartyId(e.target.value)}>
              <option value="">Select…</option>
              {parties.map((p) => <option key={p.id} value={p.id}>{p.name}{p.company ? ` — ${p.company}` : ""}</option>)}
            </Select>
          </Field>
          <Field label="Date" required><Input type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} /></Field>
          <Field label={type === "quote" ? "Valid Till" : "Due Date"}><Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} /></Field>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500 dark:text-slate-400">Items</span>
            <span className="text-[11px] font-semibold text-slate-400">Qty · Rate · GST%</span>
          </div>
          <div className="space-y-2">
            {lines.map((l, i) => {
              const amt = (Number(l.qty) || 0) * (Number(l.rate) || 0);
              return (
                <div key={i} className="rounded-xl border border-slate-200 p-2 dark:border-slate-800">
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={l.item_id ?? ""} onChange={(e) => pickItem(i, e.target.value)} className="min-w-[150px] flex-1 !py-2">
                      <option value="">— Custom line —</option>
                      {items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
                    </Select>
                    <Input placeholder="Description" value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} className="min-w-[140px] flex-1 !py-2" />
                    <Input type="number" min="0" step="any" value={l.qty} onChange={(e) => setLine(i, { qty: e.target.value })} className="!w-16 !py-2" title="Qty" />
                    <Input type="number" min="0" value={l.rate} onChange={(e) => setLine(i, { rate: e.target.value })} className="!w-24 !py-2" title="Rate" />
                    <Input type="number" min="0" value={l.tax_rate} onChange={(e) => setLine(i, { tax_rate: e.target.value })} className="!w-16 !py-2" title="GST %" />
                    <span className="w-24 shrink-0 text-right text-sm font-bold text-slate-700 dark:text-slate-200">{fmtINR(amt)}</span>
                    <button onClick={() => setLines((ls) => ls.length > 1 ? ls.filter((_, j) => j !== i) : ls)} className="shrink-0 rounded-lg p-1.5 text-rose-500 hover:bg-rose-50 cursor-pointer dark:hover:bg-rose-500/15"><X size={15} /></button>
                  </div>
                </div>
              );
            })}
          </div>
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setLines((ls) => [...ls, { item_id: null, name: "", qty: 1, rate: 0, tax_rate: 18 }])}><Plus size={14} /> Add line</Button>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <Field label="Notes" className="flex-1"><Textarea rows={2} placeholder="Terms, delivery notes…" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
          <div className="w-full shrink-0 space-y-1.5 rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/50 sm:w-56">
            <div className="flex justify-between text-slate-500 dark:text-slate-400"><span>Subtotal</span><span className="font-semibold text-slate-700 dark:text-slate-200">{fmtINR(totals.sub)}</span></div>
            <div className="flex justify-between text-slate-500 dark:text-slate-400"><span>GST</span><span className="font-semibold text-slate-700 dark:text-slate-200">{fmtINR(totals.tax)}</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-1.5 text-base font-extrabold text-slate-900 dark:border-slate-700 dark:text-slate-100"><span>Total</span><span>{fmtINR(totals.total)}</span></div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} loading={busy}><Send size={14} /> Save {meta.label}</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ====================== View / act on a document ====================== */
function DocView({ id, type, canManage, onClose, onChanged }: {
  id: number; type: TxnType; canManage: boolean; onClose: () => void; onChanged: () => void;
}) {
  const { data, reload } = useData<{ txn: BooksTxn & Record<string, unknown> }>(`/api/books/txns/${id}`);
  const [pay, setPay] = useState<{ amount: string; pay_date: string; mode: string; reference: string } | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  const meta = TXN_META[type];
  const conv = meta.convertsTo;
  const t = data?.txn;

  const act = async (body: Record<string, unknown>, msg: string) => {
    setBusy(true);
    try {
      const res = await api<{ number?: string }>(`/api/books/txns/${id}`, { method: "PATCH", body: JSON.stringify(body) });
      toast.push("success", res.number ? `${msg} ${res.number}` : msg);
      setPay(null); reload(); onChanged();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    setBusy(true);
    try {
      await api(`/api/books/txns/${id}`, { method: "DELETE" });
      toast.push("success", `${meta.label} deleted`);
      onClose(); onChanged();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Delete failed");
    } finally { setBusy(false); }
  };

  const outstanding = t ? t.total - t.paid : 0;

  return (
    <Modal open onClose={onClose} title={t ? `${meta.label} ${t.number}` : meta.label} subtitle={t ? `${String(t.party_name || "—")}${t.party_company ? " · " + t.party_company : ""}` : ""} width="max-w-2xl">
      {!t ? <div className="py-10 text-center"><PageLoader /></div> : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge tone={tone(t.status)}>{t.status}</Badge>
            <span className="text-xs text-slate-400 dark:text-slate-500">{fmtDate(t.txn_date)}{t.due_date ? ` · due ${fmtDate(t.due_date)}` : ""}</span>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400 dark:bg-slate-800/50 dark:text-slate-500">
                <tr><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Rate</th><th className="px-3 py-2 text-right">Amount</th></tr>
              </thead>
              <tbody>
                {(t.lines || []).map((l, i) => (
                  <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-200">{l.name}<span className="ml-1 text-xs text-slate-400">· {l.tax_rate}% GST</span></td>
                    <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{l.qty}</td>
                    <td className="px-3 py-2 text-right text-slate-600 dark:text-slate-300">{fmtINR(l.rate)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-slate-800 dark:text-slate-100">{fmtINR(l.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="ml-auto w-full space-y-1 text-sm sm:w-64">
            <div className="flex justify-between text-slate-500 dark:text-slate-400"><span>Subtotal</span><span>{fmtINR(t.subtotal)}</span></div>
            <div className="flex justify-between text-slate-500 dark:text-slate-400"><span>GST</span><span>{fmtINR(t.tax)}</span></div>
            <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-extrabold text-slate-900 dark:border-slate-700 dark:text-slate-100"><span>Total</span><span>{fmtINR(t.total)}</span></div>
            {(type === "invoice" || type === "bill") && t.paid > 0 && (
              <>
                <div className="flex justify-between text-emerald-600 dark:text-emerald-400"><span>Paid</span><span>−{fmtINR(t.paid)}</span></div>
                <div className="flex justify-between font-bold text-rose-600 dark:text-rose-400"><span>Balance Due</span><span>{fmtINR(outstanding)}</span></div>
              </>
            )}
          </div>

          {(t.payments || []).length > 0 && (
            <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">Payments</p>
              {(t.payments || []).map((p) => (
                <div key={p.id} className="flex justify-between py-0.5 text-[13px]"><span className="text-slate-500 dark:text-slate-400">{fmtDate(p.pay_date)}{p.mode ? ` · ${p.mode}` : ""}{p.reference ? ` · ${p.reference}` : ""}</span><span className="font-bold text-emerald-600 dark:text-emerald-400">{fmtINR(p.amount)}</span></div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <Button variant="outline" onClick={() => window.open(`/print/${id}`, "_blank")}><Printer size={14} /> Print / PDF</Button>
            {canManage && <Button variant="outline" onClick={() => setConfirmDel(true)}><Trash2 size={14} /> Delete</Button>}
            {canManage && conv && !t.converted_to && t.status !== "Declined" && (
              <Button variant="success" loading={busy} onClick={() => act({ action: "convert" }, `Converted → ${TXN_META[conv].label}`)}><ArrowRightLeft size={14} /> Convert to {TXN_META[conv].label}</Button>
            )}
            {canManage && (type === "quote" || type === "sales_order" || type === "purchase_order") && t.status === "Draft" && (
              <Button variant="outline" loading={busy} onClick={() => act({ action: "status", status: "Sent" }, "Marked sent")}>Mark Sent</Button>
            )}
            {canManage && (type === "invoice" || type === "bill") && t.status !== "Paid" && (
              <Button loading={busy} onClick={() => setPay({ amount: String(outstanding), pay_date: todayStr(), mode: "Bank Transfer", reference: "" })}><CreditCard size={14} /> Record Payment</Button>
            )}
          </div>
        </div>
      )}

      {pay && (
        <Modal open onClose={() => setPay(null)} title="Record Payment" width="max-w-md">
          <div className="space-y-3">
            <Field label="Amount (₹)" required><Input type="number" min="1" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Date"><Input type="date" value={pay.pay_date} onChange={(e) => setPay({ ...pay, pay_date: e.target.value })} /></Field>
              <Field label="Mode"><Select value={pay.mode} onChange={(e) => setPay({ ...pay, mode: e.target.value })}>{["Bank Transfer", "UPI", "Cash", "Cheque", "Card"].map((m) => <option key={m}>{m}</option>)}</Select></Field>
            </div>
            <Field label="Reference"><Input placeholder="UTR / cheque no." value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setPay(null)}>Cancel</Button>
              <Button loading={busy} onClick={() => act({ action: "payment", ...pay, amount: Number(pay.amount) }, "Payment recorded")}>Save Payment</Button>
            </div>
          </div>
        </Modal>
      )}

      <ConfirmModal open={confirmDel} onClose={() => setConfirmDel(false)} onConfirm={remove} loading={busy} danger title={`Delete ${meta.label}?`} message="This permanently removes the document and reverses any stock movement." confirmLabel="Delete" />
    </Modal>
  );
}

/* ====================== Full page for a doc type ====================== */
export function BooksDocPage({ type }: { type: TxnType }) {
  const me = useMe();
  const canManage = me.role !== "EMPLOYEE";
  const meta = TXN_META[type];
  const { data, reload } = useData<{ rows: (BooksTxn & { party_name?: string })[] }>(`/api/books/txns?type=${type}`);
  const { data: itemsD } = useData<{ rows: BooksItem[] }>("/api/books/items");
  const { data: partiesD } = useData<{ rows: BooksParty[] }>(`/api/books/parties?type=${meta.party}`);
  const [creating, setCreating] = useState(false);
  const [viewId, setViewId] = useState<number | null>(null);
  const rows = data?.rows;

  const stats = useMemo(() => {
    const r = rows || [];
    const open = r.filter((x) => !["Paid", "Declined", "Invoiced", "Billed"].includes(x.status));
    return {
      count: r.length,
      total: r.reduce((s, x) => s + x.total, 0),
      outstanding: r.filter((x) => x.type === "invoice" || x.type === "bill").reduce((s, x) => s + (x.total - x.paid), 0),
      open: open.length,
    };
  }, [rows]);

  if (!rows) return <PageLoader />;
  const canCreate = canManage || ["quote", "sales_order", "invoice"].includes(type);

  return (
    <div className="fade-up">
      <PageHeader
        title={meta.plural}
        subtitle={type === "quote" ? "Create quotations and convert them to invoices" : type === "invoice" ? "Bill customers and track payments" : "Track vendor bills and payables"}
        icon={type === "bill" ? <Receipt size={20} /> : <FileText size={20} />}
        actions={canCreate ? <Button onClick={() => setCreating(true)}><Plus size={15} /> New {meta.label}</Button> : undefined}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label={`Total ${meta.plural}`} value={stats.count} icon={<FileText size={20} />} accent="indigo" />
        <StatCard label="Total Value" value={fmtINR(stats.total)} icon={<Receipt size={20} />} accent="violet" />
        {(type === "invoice" || type === "bill")
          ? <StatCard label={type === "bill" ? "Payable" : "Receivable"} value={fmtINR(stats.outstanding)} icon={<CreditCard size={20} />} accent={type === "bill" ? "rose" : "amber"} />
          : <StatCard label="Open" value={stats.open} icon={<Send size={20} />} accent="amber" />}
        <StatCard label="Open" value={stats.open} icon={<ArrowRightLeft size={20} />} accent="sky" />
      </div>

      <Card title={meta.plural} icon={type === "bill" ? <Receipt size={16} /> : <FileText size={16} />} action={<span className="text-xs font-semibold text-slate-400">{rows.length} records</span>}>
        <DataTable
          rows={rows}
          keyFor={(r) => r.id}
          empty={<p className="text-center text-sm text-slate-400">No {meta.plural.toLowerCase()} yet — create your first.</p>}
          columns={[
            { key: "num", header: meta.label, render: (r) => <button onClick={() => setViewId(r.id)} className="font-bold text-indigo-600 hover:underline cursor-pointer dark:text-indigo-400">{r.number}</button> },
            { key: "party", header: meta.party === "vendor" ? "Vendor" : "Customer", render: (r) => <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">{r.party_name || "—"}</span> },
            { key: "date", header: "Date", render: (r) => <span className="text-[13px] text-slate-500 dark:text-slate-400">{fmtDate(r.txn_date)}</span> },
            { key: "total", header: "Total", render: (r) => <span className="font-extrabold text-slate-900 dark:text-slate-100">{fmtINR(r.total)}</span> },
            { key: "status", header: "Status", render: (r) => <Badge tone={tone(r.status)}>{r.status}</Badge> },
            { key: "act", header: "", className: "text-right", render: (r) => <Button variant="outline" size="sm" onClick={() => setViewId(r.id)}>View</Button> },
          ]}
        />
      </Card>

      {creating && itemsD && partiesD && (
        <DocEditor type={type} items={itemsD.rows} parties={partiesD.rows} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); reload(); }} />
      )}
      {viewId && <DocView id={viewId} type={type} canManage={canManage} onClose={() => setViewId(null)} onChanged={reload} />}
    </div>
  );
}

/* ====================== Customers / Vendors page ====================== */
export function BooksPartyPage({ type }: { type: "customer" | "vendor" }) {
  const me = useMe();
  const canManage = me.role !== "EMPLOYEE";
  const label = type === "vendor" ? "Vendor" : "Customer";
  const { data, reload } = useData<{ rows: BooksParty[] }>(`/api/books/parties?type=${type}`);
  const EMPTY = { name: "", company: "", email: "", phone: "", gstin: "", billing_address: "", notes: "" };
  const [form, setForm] = useState<typeof EMPTY & { id?: number }>(EMPTY);
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<BooksParty | null>(null);
  const toast = useToast();
  const rows = data?.rows;

  const save = async () => {
    if (!form.name.trim()) return toast.push("error", "Name is required");
    setBusy(true);
    try {
      if (form.id) await api(`/api/books/parties/${form.id}`, { method: "PUT", body: JSON.stringify(form) });
      else await api("/api/books/parties", { method: "POST", body: JSON.stringify({ ...form, type }) });
      toast.push("success", `${label} saved ✓`);
      setModal(false); reload();
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };
  const del = async () => {
    if (!confirmDel) return;
    setBusy(true);
    try { await api(`/api/books/parties/${confirmDel.id}`, { method: "DELETE" }); toast.push("success", "Deleted"); setConfirmDel(null); reload(); }
    catch (e) { toast.push("error", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  if (!rows) return <PageLoader />;
  const totalOutstanding = rows.reduce((s, r) => s + (r.receivable || 0), 0);

  return (
    <div className="fade-up">
      <PageHeader
        title={type === "vendor" ? "Vendors" : "Customers"}
        subtitle={type === "vendor" ? "Suppliers you buy from" : "People & businesses you sell to"}
        icon={type === "vendor" ? <Building2 size={20} /> : <UserRound size={20} />}
        actions={canManage ? <Button onClick={() => { setForm(EMPTY); setModal(true); }}><Plus size={15} /> New {label}</Button> : undefined}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label={`Total ${type === "vendor" ? "Vendors" : "Customers"}`} value={rows.length} icon={type === "vendor" ? <Building2 size={20} /> : <UserRound size={20} />} accent="indigo" />
        <StatCard label={type === "vendor" ? "Payable" : "Receivable"} value={fmtINR(totalOutstanding)} icon={<CreditCard size={20} />} accent={type === "vendor" ? "rose" : "amber"} />
      </div>

      <Card title={type === "vendor" ? "Vendors" : "Customers"} icon={type === "vendor" ? <Building2 size={16} /> : <UserRound size={16} />}>
        <DataTable
          rows={rows}
          keyFor={(r) => r.id}
          empty={<p className="text-center text-sm text-slate-400">No {type}s yet.</p>}
          columns={[
            { key: "name", header: "Name", render: (r) => <PersonCell name={r.name} sub={r.company || undefined} /> },
            { key: "contact", header: "Contact", render: (r) => <span className="text-[13px] text-slate-500 dark:text-slate-400">{r.email && <span className="flex items-center gap-1"><Mail size={11} /> {r.email}</span>}{r.phone && <span className="flex items-center gap-1"><Phone size={11} /> {r.phone}</span>}</span> },
            { key: "gstin", header: "GSTIN", render: (r) => <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{r.gstin || "—"}</span> },
            { key: "out", header: type === "vendor" ? "Payable" : "Receivable", render: (r) => <span className={cn("font-bold", (r.receivable || 0) > 0 ? "text-amber-600 dark:text-amber-300" : "text-slate-400")}>{fmtINR(r.receivable || 0)}</span> },
            {
              key: "act", header: "", className: "text-right", render: (r) => canManage ? (
                <span className="flex justify-end gap-1">
                  <button onClick={() => { setForm({ id: r.id, name: r.name, company: r.company || "", email: r.email || "", phone: r.phone || "", gstin: r.gstin || "", billing_address: r.billing_address || "", notes: r.notes || "" }); setModal(true); }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 cursor-pointer dark:hover:bg-slate-800"><Pencil size={15} /></button>
                  <button onClick={() => setConfirmDel(r)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 cursor-pointer dark:hover:bg-rose-500/15"><Trash2 size={15} /></button>
                </span>
              ) : null,
            },
          ]}
        />
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title={form.id ? `Edit ${label}` : `New ${label}`} width="max-w-lg">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Company"><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></Field>
            <Field label="Email"><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Phone"><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
            <Field label="GSTIN"><Input value={form.gstin} onChange={(e) => setForm({ ...form, gstin: e.target.value })} /></Field>
          </div>
          <Field label="Billing Address"><Textarea rows={2} value={form.billing_address} onChange={(e) => setForm({ ...form, billing_address: e.target.value })} /></Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={save} loading={busy}>Save {label}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal open={!!confirmDel} onClose={() => setConfirmDel(null)} onConfirm={del} loading={busy} danger title={`Delete ${confirmDel?.name}?`} message="This removes the contact." confirmLabel="Delete" />
    </div>
  );
}

/* ====================== Payments received / made ====================== */
type PaymentRow = { id: number; pay_date: string; party_name: string | null; txn_number: string; mode: string | null; reference: string | null; amount: number };

export function BooksPaymentsPage({ direction }: { direction: "in" | "out" }) {
  const label = direction === "out" ? "Payments Made" : "Payments Received";
  const { data } = useData<{ rows: PaymentRow[]; total: number }>(`/api/books/payments?direction=${direction}`);
  const rows = data?.rows;
  if (!rows) return <PageLoader />;

  return (
    <div className="fade-up">
      <PageHeader title={label} subtitle={direction === "out" ? "Money paid out to vendors" : "Money collected from customers"} icon={<CreditCard size={20} />} />
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Total" value={fmtINR(data.total)} icon={<CreditCard size={20} />} accent={direction === "out" ? "rose" : "emerald"} sub={`${rows.length} payments`} />
      </div>
      <Card title={label} icon={<CreditCard size={16} />}>
        <DataTable rows={rows} keyFor={(r) => r.id} empty={<p className="text-center text-sm text-slate-400">No payments recorded yet.</p>}
          columns={[
            { key: "date", header: "Date", render: (r) => <span className="text-[13px] font-semibold">{fmtDate(r.pay_date)}</span> },
            { key: "party", header: direction === "out" ? "Vendor" : "Customer", render: (r) => <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-200">{r.party_name || "—"}</span> },
            { key: "doc", header: "Against", render: (r) => <Badge tone="EMPLOYEE">{r.txn_number}</Badge> },
            { key: "mode", header: "Mode", render: (r) => <span className="text-xs text-slate-500 dark:text-slate-400">{r.mode || "—"}{r.reference ? ` · ${r.reference}` : ""}</span> },
            { key: "amt", header: "Amount", render: (r) => <span className="font-extrabold text-emerald-600 dark:text-emerald-400">{fmtINR(r.amount)}</span> },
          ]} />
      </Card>
    </div>
  );
}
