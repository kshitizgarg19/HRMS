"use client";

import { useMemo, useState } from "react";
import { Package, Plus, Pencil, Trash2, AlertTriangle, Boxes, IndianRupee } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/swr";
import { fmtINR } from "@/lib/format";
import { Badge, Button, Card, ConfirmModal, DataTable, Field, Input, Modal, PageHeader, PageLoader, Select, StatCard, useToast, cn } from "@/components/ui";
import { useMe } from "@/components/shell";
import type { BooksItem } from "@/lib/types";

const EMPTY = { name: "", sku: "", type: "goods", rate: "", purchase_rate: "", tax_rate: "18", stock: "0", low_stock: "0", unit: "pcs", hsn: "" };

export default function ItemsPage() {
  const me = useMe();
  const canManage = me.role !== "EMPLOYEE";
  const { data, reload } = useData<{ rows: BooksItem[] }>("/api/books/items");
  const [form, setForm] = useState<typeof EMPTY & { id?: number }>(EMPTY);
  const [modal, setModal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<BooksItem | null>(null);
  const toast = useToast();
  const rows = data?.rows;

  const stats = useMemo(() => {
    const r = rows || [];
    return {
      count: r.length,
      value: r.filter((x) => x.type === "goods").reduce((s, x) => s + x.stock * x.purchase_rate, 0),
      low: r.filter((x) => x.type === "goods" && x.stock <= x.low_stock).length,
    };
  }, [rows]);

  const save = async () => {
    if (!form.name.trim()) return toast.push("error", "Item name is required");
    setBusy(true);
    try {
      if (form.id) await api(`/api/books/items/${form.id}`, { method: "PUT", body: JSON.stringify(form) });
      else await api("/api/books/items", { method: "POST", body: JSON.stringify(form) });
      toast.push("success", "Item saved ✓");
      setModal(false); reload();
    } catch (e) { toast.push("error", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };
  const del = async () => {
    if (!confirmDel) return;
    setBusy(true);
    try { await api(`/api/books/items/${confirmDel.id}`, { method: "DELETE" }); toast.push("success", "Item removed"); setConfirmDel(null); reload(); }
    catch (e) { toast.push("error", e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  };

  if (!rows) return <PageLoader />;

  return (
    <div className="fade-up">
      <PageHeader title="Items & Inventory" subtitle="Goods and services you sell or buy, with live stock" icon={<Package size={20} />}
        actions={canManage ? <Button onClick={() => { setForm(EMPTY); setModal(true); }}><Plus size={15} /> New Item</Button> : undefined} />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Total Items" value={stats.count} icon={<Boxes size={20} />} accent="indigo" />
        <StatCard label="Inventory Value" value={fmtINR(stats.value)} icon={<IndianRupee size={20} />} accent="emerald" sub="at cost" />
        <StatCard label="Low Stock" value={stats.low} icon={<AlertTriangle size={20} />} accent="rose" />
      </div>

      <Card title="Items" icon={<Package size={16} />}>
        <DataTable rows={rows} keyFor={(r) => r.id} empty={<p className="text-center text-sm text-slate-400">No items yet — add your first.</p>}
          columns={[
            { key: "name", header: "Item", render: (r) => <span><span className="block font-bold text-slate-800 dark:text-slate-100">{r.name}</span><span className="text-xs text-slate-400">{r.sku || "—"} · {r.type}</span></span> },
            { key: "rate", header: "Selling", render: (r) => <span className="font-semibold">{fmtINR(r.rate)}</span> },
            { key: "tax", header: "GST", render: (r) => <span className="text-slate-500">{r.tax_rate}%</span> },
            { key: "stock", header: "Stock", render: (r) => r.type === "goods" ? <span className={cn("font-bold", r.stock <= r.low_stock ? "text-rose-500" : "text-slate-700 dark:text-slate-200")}>{r.stock} {r.unit}{r.stock <= r.low_stock && <Badge tone="Rejected" className="ml-1">Low</Badge>}</span> : <span className="text-slate-400">—</span> },
            {
              key: "act", header: "", className: "text-right", render: (r) => canManage ? (
                <span className="flex justify-end gap-1">
                  <button onClick={() => { setForm({ id: r.id, name: r.name, sku: r.sku || "", type: r.type, rate: String(r.rate), purchase_rate: String(r.purchase_rate), tax_rate: String(r.tax_rate), stock: String(r.stock), low_stock: String(r.low_stock), unit: r.unit || "pcs", hsn: r.hsn || "" }); setModal(true); }} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-indigo-600 cursor-pointer dark:hover:bg-slate-800"><Pencil size={15} /></button>
                  <button onClick={() => setConfirmDel(r)} className="rounded-lg p-2 text-rose-500 hover:bg-rose-50 cursor-pointer dark:hover:bg-rose-500/15"><Trash2 size={15} /></button>
                </span>
              ) : null,
            },
          ]} />
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title={form.id ? "Edit Item" : "New Item"} width="max-w-lg">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="SKU"><Input value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} /></Field>
            <Field label="Type"><Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option value="goods">Goods</option><option value="service">Service</option></Select></Field>
            <Field label="GST %"><Input type="number" value={form.tax_rate} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} /></Field>
            <Field label="Selling Rate (₹)"><Input type="number" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} /></Field>
            <Field label="Purchase Rate (₹)"><Input type="number" value={form.purchase_rate} onChange={(e) => setForm({ ...form, purchase_rate: e.target.value })} /></Field>
            {form.type === "goods" && <Field label="Opening Stock"><Input type="number" value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} /></Field>}
            {form.type === "goods" && <Field label="Low-stock Alert"><Input type="number" value={form.low_stock} onChange={(e) => setForm({ ...form, low_stock: e.target.value })} /></Field>}
            {form.type === "goods" && <Field label="Unit"><Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} /></Field>}
            <Field label="HSN / SAC"><Input value={form.hsn} onChange={(e) => setForm({ ...form, hsn: e.target.value })} /></Field>
          </div>
          <div className="flex justify-end gap-2 pt-1"><Button variant="outline" onClick={() => setModal(false)}>Cancel</Button><Button onClick={save} loading={busy}>Save Item</Button></div>
        </div>
      </Modal>

      <ConfirmModal open={!!confirmDel} onClose={() => setConfirmDel(null)} onConfirm={del} loading={busy} danger title={`Remove ${confirmDel?.name}?`} message="It stays on past documents but won't appear in new ones." confirmLabel="Remove" />
    </div>
  );
}
