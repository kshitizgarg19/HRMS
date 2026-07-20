import { NextRequest, NextResponse } from "next/server";
import { get, all } from "@/lib/db";
import { requireAuth, isErr } from "@/lib/auth";
import { todayStr } from "@/lib/format";

export async function GET(req: NextRequest) {
  const me = await requireAuth(req, ["HR", "ADMIN"]); // company-wide financials — managers only
  if (isErr(me)) return me;
  const today = todayStr();
  const monthStart = today.slice(0, 8) + "01";

  const [agg, counts, low, recent, incomeExpense, invMonth, billMonth, cash, flow, topExp, accounts] = await Promise.all([
    get<{
      inv_unpaid: number; inv_overdue: number; credit_open: number;
      bill_unpaid: number; bill_overdue: number; vc_open: number; quote_pipeline: number;
    }>(
      `SELECT
         COALESCE(SUM(CASE WHEN type='invoice' AND status!='Paid' THEN total-paid ELSE 0 END),0) inv_unpaid,
         COALESCE(SUM(CASE WHEN type='invoice' AND status!='Paid' AND due_date IS NOT NULL AND due_date < ? THEN total-paid ELSE 0 END),0) inv_overdue,
         COALESCE(SUM(CASE WHEN type='credit_note' THEN total ELSE 0 END),0) credit_open,
         COALESCE(SUM(CASE WHEN type='bill' AND status!='Paid' THEN total-paid ELSE 0 END),0) bill_unpaid,
         COALESCE(SUM(CASE WHEN type='bill' AND status!='Paid' AND due_date IS NOT NULL AND due_date < ? THEN total-paid ELSE 0 END),0) bill_overdue,
         COALESCE(SUM(CASE WHEN type='vendor_credit' THEN total ELSE 0 END),0) vc_open,
         COALESCE(SUM(CASE WHEN type='quote' AND status IN ('Draft','Sent') THEN total ELSE 0 END),0) quote_pipeline
       FROM books_txns`, today, today),
    get<{ customers: number; vendors: number; items: number; inventory_value: number }>(
      `SELECT
         (SELECT COUNT(*) FROM books_parties WHERE type='customer') customers,
         (SELECT COUNT(*) FROM books_parties WHERE type='vendor') vendors,
         (SELECT COUNT(*) FROM books_items WHERE active=1) items,
         (SELECT COALESCE(SUM(stock*purchase_rate),0) FROM books_items WHERE active=1 AND type='goods') inventory_value`),
    get<{ c: number }>("SELECT COUNT(*) c FROM books_items WHERE active=1 AND type='goods' AND stock <= low_stock"),
    all(`SELECT t.id, t.type, t.number, t.status, t.total, t.txn_date, p.name AS party_name
         FROM books_txns t LEFT JOIN books_parties p ON p.id=t.party_id
         ORDER BY t.created_at DESC, t.id DESC LIMIT 8`),
    all<{ ym: string; income: number; expense: number }>(
      `SELECT ym, COALESCE(SUM(income),0) income, COALESCE(SUM(expense),0) expense FROM (
         SELECT substr(txn_date,1,7) ym, total income, 0 expense FROM books_txns WHERE type='invoice'
         UNION ALL
         SELECT substr(txn_date,1,7) ym, 0, total FROM books_txns WHERE type='bill'
         UNION ALL
         SELECT substr(expense_date,1,7) ym, 0, total FROM books_expenses
       ) GROUP BY ym ORDER BY ym DESC LIMIT 6`),
    get<{ v: number; c: number }>("SELECT COALESCE(SUM(total),0) v, COUNT(*) c FROM books_txns WHERE type='invoice' AND txn_date >= ?", monthStart),
    get<{ v: number }>("SELECT COALESCE(SUM(total),0) v FROM books_txns WHERE type='bill' AND txn_date >= ?", monthStart),
    get<{ bal: number }>(
      `SELECT COALESCE(SUM(opening_balance),0)
         + COALESCE((SELECT SUM(CASE WHEN kind='in' THEN amount ELSE -amount END) FROM books_bank_txns),0) bal
       FROM books_accounts`),
    get<{ inflow: number; out_pay: number; out_exp: number }>(
      `SELECT
         COALESCE((SELECT SUM(amount) FROM books_payments p JOIN books_txns t ON t.id=p.txn_id WHERE t.type='invoice'),0) inflow,
         COALESCE((SELECT SUM(amount) FROM books_payments p JOIN books_txns t ON t.id=p.txn_id WHERE t.type='bill'),0) out_pay,
         COALESCE((SELECT SUM(total) FROM books_expenses),0) out_exp`),
    all<{ category: string; v: number }>(
      "SELECT COALESCE(NULLIF(category,''),'Uncategorised') category, SUM(total) v FROM books_expenses GROUP BY category ORDER BY v DESC LIMIT 6"),
    all<{ id: number; name: string; type: string; balance: number }>(
      `SELECT a.id, a.name, a.type,
         a.opening_balance + COALESCE((SELECT SUM(CASE WHEN kind='in' THEN amount ELSE -amount END) FROM books_bank_txns b WHERE b.account_id=a.id),0) balance
       FROM books_accounts a ORDER BY a.id`),
  ]);

  const invUnpaid = agg?.inv_unpaid ?? 0, invOverdue = agg?.inv_overdue ?? 0, creditOpen = agg?.credit_open ?? 0;
  const billUnpaid = agg?.bill_unpaid ?? 0, billOverdue = agg?.bill_overdue ?? 0, vcOpen = agg?.vc_open ?? 0;
  const inflow = flow?.inflow ?? 0;
  const outflow = (flow?.out_pay ?? 0) + (flow?.out_exp ?? 0);
  const r2 = (n: number) => Math.round(n * 100) / 100;

  return NextResponse.json({
    // receivables
    receivable: r2(invUnpaid - creditOpen),
    receivableCurrent: r2(invUnpaid - invOverdue),
    receivableOverdue: r2(invOverdue),
    creditNotes: r2(creditOpen),
    overdue: r2(invOverdue),
    // payables
    payable: r2(billUnpaid - vcOpen),
    payableCurrent: r2(billUnpaid - billOverdue),
    payableOverdue: r2(billOverdue),
    vendorCredits: r2(vcOpen),
    // pipeline & counts
    quotePipeline: agg?.quote_pipeline ?? 0,
    customers: counts?.customers ?? 0,
    vendors: counts?.vendors ?? 0,
    items: counts?.items ?? 0,
    inventoryValue: counts?.inventory_value ?? 0,
    lowStock: low?.c ?? 0,
    monthSales: invMonth?.v ?? 0,
    monthSalesCount: invMonth?.c ?? 0,
    monthPurchases: billMonth?.v ?? 0,
    // cash flow
    cashBalance: cash?.bal ?? 0,
    cashIn: inflow,
    cashOut: outflow,
    cashNet: inflow - outflow,
    accounts,
    // activity & charts
    recent,
    incomeExpense: (incomeExpense || []).reverse(),
    topExpenses: topExp || [],
  });
}
