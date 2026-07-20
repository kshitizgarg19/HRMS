import type { Q } from "./db";

export type TxnType = "quote" | "sales_order" | "invoice" | "credit_note" | "purchase_order" | "bill" | "vendor_credit";

export interface BooksLine {
  item_id: number | null;
  name: string;
  qty: number;
  rate: number;
  tax_rate: number;
  amount: number; // qty * rate, pre-tax
}

type RawLine = { item_id?: number | null; name?: string; qty?: number | string; rate?: number | string; tax_rate?: number | string };

type Meta = { label: string; plural: string; prefix: string; party: "customer" | "vendor"; convertsTo?: TxnType; defaultStatus: string };

export const TXN_META: Record<TxnType, Meta> = {
  quote: { label: "Quotation", plural: "Quotations", prefix: "QT", party: "customer", convertsTo: "invoice", defaultStatus: "Draft" },
  sales_order: { label: "Sales Order", plural: "Sales Orders", prefix: "SO", party: "customer", convertsTo: "invoice", defaultStatus: "Confirmed" },
  invoice: { label: "Invoice", plural: "Invoices", prefix: "INV", party: "customer", defaultStatus: "Sent" },
  credit_note: { label: "Credit Note", plural: "Credit Notes", prefix: "CN", party: "customer", defaultStatus: "Open" },
  purchase_order: { label: "Purchase Order", plural: "Purchase Orders", prefix: "PO", party: "vendor", convertsTo: "bill", defaultStatus: "Draft" },
  bill: { label: "Bill", plural: "Bills", prefix: "BILL", party: "vendor", defaultStatus: "Open" },
  vendor_credit: { label: "Vendor Credit", plural: "Vendor Credits", prefix: "VC", party: "vendor", defaultStatus: "Open" },
};

export const isTxnType = (t: unknown): t is TxnType => typeof t === "string" && t in TXN_META;

/** Next sequential document number, e.g. INV-0007. Uses the MAX existing suffix (not COUNT) so a
 *  deleted document never causes the next create to re-issue an existing number. */
export async function nextNumber(q: Q, type: TxnType): Promise<string> {
  const row = await q.get<{ m: number }>(
    "SELECT MAX(CAST(substr(number, instr(number, '-') + 1) AS INTEGER)) m FROM books_txns WHERE type = ?", type);
  return `${TXN_META[type].prefix}-${String((row?.m ?? 0) + 1).padStart(4, "0")}`;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Normalize raw line input → clean lines + document subtotal / tax / total. */
export function computeTotals(rawLines: RawLine[]): { lines: BooksLine[]; subtotal: number; tax: number; total: number } {
  const lines: BooksLine[] = [];
  let subtotal = 0, tax = 0;
  for (const l of rawLines || []) {
    const name = String(l?.name || "").trim();
    if (!name) continue;
    const qty = Math.max(0, Number(l?.qty) || 0);
    const rate = Math.max(0, Number(l?.rate) || 0);
    const tax_rate = Math.max(0, Number(l?.tax_rate) || 0);
    const amount = r2(qty * rate);
    subtotal += amount;
    tax += amount * (tax_rate / 100);
    lines.push({ item_id: l?.item_id ? Number(l.item_id) : null, name, qty, rate, tax_rate, amount });
  }
  subtotal = r2(subtotal);
  tax = r2(tax);
  return { lines, subtotal, tax, total: r2(subtotal + tax) };
}

/** CRM lead pipeline stages, in order. */
export const LEAD_STAGES = ["New", "Contacted", "Qualified", "Proposal", "Won", "Lost"];

/** Payment-aware status: `base` is the unpaid label ('Sent' for invoices, 'Open' for bills). */
export function payStatus(total: number, paid: number, base: string): string {
  if (paid <= 0) return base;
  if (paid >= total - 0.01) return "Paid";
  return "Partially Paid";
}
