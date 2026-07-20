"use client";

import { useMemo, useRef, useState } from "react";
import { Receipt, Plus, Trash2, IndianRupee, CheckCircle2, Hourglass, Paperclip, Upload, FileText, X, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/swr";
import { fmtDate, fmtINR, todayStr } from "@/lib/format";
import { Badge, Button, Card, ConfirmModal, DataTable, Field, Input, Modal, PageHeader, PageLoader, Select, StatCard, Textarea, useToast } from "@/components/ui";
import type { Reimbursement } from "@/lib/types";

const CATEGORIES = ["Travel", "Meals", "Internet", "Medical", "Office Supplies", "Software", "Client Entertainment", "Training", "Other"];
const EMPTY = { category: "Travel", amount: "", expense_date: todayStr(), description: "", receipt: "", receipt_data: "" };
const MAX_FILE_MB = 4;

function readAsDataURL(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result as string);
    fr.onerror = () => rej(new Error("Could not read the file"));
    fr.readAsDataURL(file);
  });
}

/** Read a bill file → data URL. Images are downscaled + JPEG-compressed so uploads stay small. */
async function processReceiptFile(file: File): Promise<{ dataUrl: string; name: string }> {
  const isPdf = file.type === "application/pdf";
  const isImg = file.type.startsWith("image/");
  if (!isPdf && !isImg) throw new Error("Only an image (JPG/PNG/WebP) or a PDF is allowed");
  if (isPdf) {
    if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`PDF must be under ${MAX_FILE_MB} MB`);
    return { dataUrl: await readAsDataURL(file), name: file.name };
  }
  const original = await readAsDataURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("decode"));
      i.src = original;
    });
    const maxDim = 1600;
    let { width, height } = img;
    if (Math.max(width, height) > maxDim) {
      const s = maxDim / Math.max(width, height);
      width = Math.round(width * s);
      height = Math.round(height * s);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("nocanvas");
    ctx.drawImage(img, 0, 0, width, height);
    const compressed = canvas.toDataURL("image/jpeg", 0.82);
    if (compressed.length < original.length) {
      return { dataUrl: compressed, name: file.name.replace(/\.[^.]+$/i, "") + ".jpg" };
    }
    return { dataUrl: original, name: file.name };
  } catch {
    if (file.size > MAX_FILE_MB * 1024 * 1024) throw new Error(`Image must be under ${MAX_FILE_MB} MB`);
    return { dataUrl: original, name: file.name };
  }
}

export default function ReimbursementPage() {
  const { data, reload } = useData<{ rows: Reimbursement[] }>("/api/reimbursements");
  const rows = data?.rows;
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Reimbursement | null>(null);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // let the same file be re-picked later
    if (!f) return;
    setUploading(true);
    try {
      const { dataUrl, name } = await processReceiptFile(f);
      setForm((p) => ({ ...p, receipt_data: dataUrl, receipt: name }));
    } catch (err) {
      toast.push("error", err instanceof Error ? err.message : "Couldn't attach the file");
    } finally {
      setUploading(false);
    }
  };
  const clearFile = () => setForm((p) => ({ ...p, receipt_data: "", receipt: "" }));

  const stats = useMemo(() => {
    if (!rows) return { claimed: 0, approved: 0, pending: 0, pendingCount: 0 };
    return {
      claimed: rows.reduce((s, r) => s + r.amount, 0),
      approved: rows.filter((r) => r.status === "Approved").reduce((s, r) => s + r.amount, 0),
      pending: rows.filter((r) => r.status === "Pending").reduce((s, r) => s + r.amount, 0),
      pendingCount: rows.filter((r) => r.status === "Pending").length,
    };
  }, [rows]);

  if (!rows) return <PageLoader />;

  const submit = async () => {
    if (!form.amount || !form.description.trim()) return toast.push("error", "Amount and description are required");
    setBusy(true);
    try {
      await api("/api/reimbursements", { method: "POST", body: JSON.stringify(form) });
      toast.push("success", "Claim submitted for approval");
      setModal(false);
      setForm(EMPTY);
      await reload();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!confirmDel) return;
    setBusy(true);
    try {
      await api(`/api/reimbursements/${confirmDel.id}`, { method: "DELETE" });
      toast.push("success", "Claim withdrawn");
      setConfirmDel(null);
      await reload();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fade-up">
      <PageHeader
        title="Reimbursement"
        subtitle="Create and track your expense claims"
        icon={<Receipt size={20} />}
        actions={<Button onClick={() => setModal(true)}><Plus size={15} /> New Request</Button>}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total Claimed" value={fmtINR(stats.claimed)} icon={<IndianRupee size={20} />} accent="indigo" sub={`${rows.length} claims`} />
        <StatCard label="Approved Amount" value={fmtINR(stats.approved)} icon={<CheckCircle2 size={20} />} accent="emerald" />
        <StatCard label="Awaiting Approval" value={fmtINR(stats.pending)} icon={<Hourglass size={20} />} accent="amber" sub={`${stats.pendingCount} pending`} />
        <StatCard label="This Month" value={fmtINR(rows.filter((r) => r.expense_date.startsWith(todayStr().slice(0, 7))).reduce((s, r) => s + r.amount, 0))} icon={<Receipt size={20} />} accent="violet" />
      </div>

      <Card title="My Claims" icon={<Receipt size={16} />}>
        <DataTable
          rows={rows}
          keyFor={(r) => r.id}
          empty={<p className="text-center text-sm text-slate-400 dark:text-slate-500">No reimbursement requests found — claim your first expense.</p>}
          columns={[
            { key: "cat", header: "Category", render: (r) => <Badge tone="EMPLOYEE">{r.category}</Badge> },
            { key: "desc", header: "Description", className: "max-w-[280px]", render: (r) => (
              <span>
                <span className="line-clamp-2 text-[13px] leading-snug text-slate-700 dark:text-slate-200">{r.description}</span>
                {r.has_receipt ? (
                  <a href={`/api/reimbursements/${r.id}/receipt`} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-indigo-500 hover:underline dark:text-indigo-400">
                    <Paperclip size={11} /> View bill
                  </a>
                ) : r.receipt ? (
                  <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-slate-400 dark:text-slate-500"><Paperclip size={11} /> {r.receipt}</span>
                ) : null}
              </span>
            )},
            { key: "date", header: "Expense Date", render: (r) => <span className="text-[13px] font-semibold">{fmtDate(r.expense_date)}</span> },
            { key: "amt", header: "Amount", render: (r) => <span className="text-sm font-extrabold text-slate-900 dark:text-slate-100">{fmtINR(r.amount)}</span> },
            {
              key: "status", header: "Status",
              render: (r) => (
                <span title={r.review_note || undefined}>
                  <Badge tone={r.status}>{r.status}</Badge>
                  {r.review_note && <span className="mt-0.5 block max-w-[160px] truncate text-[10px] text-slate-400 dark:text-slate-500">{r.review_note}</span>}
                </span>
              ),
            },
            {
              key: "act", header: "", className: "text-right",
              render: (r) =>
                r.status === "Pending" ? (
                  <button onClick={() => setConfirmDel(r)} className="rounded-lg p-2 text-rose-500 dark:text-rose-400 transition hover:bg-rose-50 cursor-pointer" title="Withdraw claim">
                    <Trash2 size={15} />
                  </button>
                ) : null,
            },
          ]}
        />
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="New Reimbursement Request" subtitle="Attach the bill image or PDF for faster approval">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Category" required>
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
              </Select>
            </Field>
            <Field label="Amount (₹)" required>
              <Input type="number" min="1" placeholder="0.00" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </Field>
          </div>
          <Field label="Expense Date" required>
            <Input type="date" max={todayStr()} value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
          </Field>
          <Field label="Description" required>
            <Textarea placeholder="What was this expense for?" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="Bill / Receipt" hint="Upload an image (JPG/PNG) or a PDF — max 4 MB">
            {!form.receipt_data ? (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 px-4 py-6 text-center transition hover:border-indigo-400 hover:bg-indigo-50/40 cursor-pointer disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800/40 dark:hover:border-indigo-500/60 dark:hover:bg-slate-800"
              >
                {uploading ? <Loader2 size={20} className="animate-spin text-indigo-500" /> : <Upload size={20} className="text-indigo-500" />}
                <span className="text-[13px] font-bold text-slate-600 dark:text-slate-300">{uploading ? "Processing…" : "Click to upload bill"}</span>
                <span className="text-[11px] text-slate-400 dark:text-slate-500">Image or PDF · up to 4 MB</span>
              </button>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-800">
                {form.receipt_data.startsWith("data:image") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={form.receipt_data} alt="receipt preview" className="size-12 shrink-0 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-slate-700" />
                ) : (
                  <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-rose-50 text-rose-500 dark:bg-rose-500/15"><FileText size={20} /></span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold text-slate-700 dark:text-slate-200">{form.receipt}</span>
                  <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">Attached ✓</span>
                </span>
                <button type="button" onClick={clearFile} className="rounded-lg p-2 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500 cursor-pointer dark:hover:bg-rose-500/15" title="Remove">
                  <X size={16} />
                </button>
              </div>
            )}
            <input ref={fileRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={onFile} />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setModal(false)}>Cancel</Button>
            <Button onClick={submit} loading={busy}>Submit Claim</Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={remove}
        loading={busy}
        danger
        title="Withdraw claim?"
        message={`Withdraw your ${confirmDel?.category} claim of ${confirmDel ? fmtINR(confirmDel.amount) : ""}?`}
        confirmLabel="Withdraw"
      />
    </div>
  );
}
