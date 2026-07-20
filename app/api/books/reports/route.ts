import { NextRequest, NextResponse } from "next/server";
import { get, all } from "@/lib/db";
import { requireAuth, isErr } from "@/lib/auth";
import { todayStr } from "@/lib/format";

export async function GET(req: NextRequest) {
  const me = await requireAuth(req, ["HR", "ADMIN"]);
  if (isErr(me)) return me;
  const today = todayStr();

  const [pnl, salesByCustomer, agingRows, expByCat, topItems, bal, gstAgg] = await Promise.all([
    get<{ income: number; purchases: number; expenses: number }>(
      `SELECT
        (SELECT COALESCE(SUM(total),0) FROM books_txns WHERE type='invoice') income,
        (SELECT COALESCE(SUM(total),0) FROM books_txns WHERE type='bill') purchases,
        (SELECT COALESCE(SUM(total),0) FROM books_expenses) expenses`),
    all<{ name: string; total: number; c: number }>(
      `SELECT p.name, COALESCE(SUM(t.total),0) total, COUNT(*) c
       FROM books_txns t JOIN books_parties p ON p.id=t.party_id
       WHERE t.type='invoice' GROUP BY p.id ORDER BY total DESC LIMIT 8`),
    all<{ bal: number; due_date: string | null }>(
      "SELECT total-paid bal, due_date FROM books_txns WHERE type='invoice' AND status!='Paid'"),
    all<{ category: string; total: number; c: number }>(
      "SELECT category, COALESCE(SUM(total),0) total, COUNT(*) c FROM books_expenses GROUP BY category ORDER BY total DESC"),
    all<{ name: string; qty: number; amount: number }>(
      `SELECT name, COALESCE(SUM(qty),0) qty, COALESCE(SUM(amount),0) amount
       FROM books_txn_lines WHERE txn_id IN (SELECT id FROM books_txns WHERE type='invoice')
       GROUP BY name ORDER BY amount DESC LIMIT 8`),
    get<{ cash: number; bank_in: number; bank_out: number; receivable: number; payable: number; inventory: number; pay_in: number; pay_out: number }>(
      `SELECT
        (SELECT COALESCE(SUM(opening_balance),0) FROM books_accounts)
          + COALESCE((SELECT SUM(CASE WHEN kind='in' THEN amount ELSE -amount END) FROM books_bank_txns),0) AS cash,
        (SELECT COALESCE(SUM(CASE WHEN kind='in' THEN amount ELSE 0 END),0) FROM books_bank_txns) AS bank_in,
        (SELECT COALESCE(SUM(CASE WHEN kind='out' THEN amount ELSE 0 END),0) FROM books_bank_txns) AS bank_out,
        (SELECT COALESCE(SUM(total-paid),0) FROM books_txns WHERE type='invoice' AND status!='Paid') AS receivable,
        (SELECT COALESCE(SUM(total-paid),0) FROM books_txns WHERE type='bill' AND status!='Paid') AS payable,
        (SELECT COALESCE(SUM(stock*purchase_rate),0) FROM books_items WHERE active=1 AND type='goods') AS inventory,
        (SELECT COALESCE(SUM(pm.amount),0) FROM books_payments pm JOIN books_txns t ON t.id=pm.txn_id WHERE t.type='invoice') AS pay_in,
        (SELECT COALESCE(SUM(pm.amount),0) FROM books_payments pm JOIN books_txns t ON t.id=pm.txn_id WHERE t.type='bill') AS pay_out`),
    get<{ gst_out: number; gst_bill: number; gst_exp: number }>(
      `SELECT
        (SELECT COALESCE(SUM(tax),0) FROM books_txns WHERE type='invoice') gst_out,
        (SELECT COALESCE(SUM(tax),0) FROM books_txns WHERE type='bill') gst_bill,
        (SELECT COALESCE(SUM(tax),0) FROM books_expenses) gst_exp`),
  ]);

  // Receivables aging buckets
  const aging = { current: 0, d30: 0, d60: 0, d90: 0 };
  const dayDiff = (d: string) => Math.floor((new Date(today + "T00:00:00").getTime() - new Date(d + "T00:00:00").getTime()) / 86400000);
  for (const r of agingRows) {
    const overdue = r.due_date ? dayDiff(r.due_date) : 0;
    if (overdue <= 0) aging.current += r.bal;
    else if (overdue <= 30) aging.d30 += r.bal;
    else if (overdue <= 60) aging.d60 += r.bal;
    else aging.d90 += r.bal;
  }

  const income = pnl?.income ?? 0;
  const totalExpense = (pnl?.purchases ?? 0) + (pnl?.expenses ?? 0);

  const cash = bal?.cash ?? 0, receivable = bal?.receivable ?? 0, inventory = bal?.inventory ?? 0, payable = bal?.payable ?? 0;
  const assets = cash + receivable + inventory;
  const cashIn = (bal?.pay_in ?? 0) + (bal?.bank_in ?? 0);
  const cashOut = (bal?.pay_out ?? 0) + (pnl?.expenses ?? 0) + (bal?.bank_out ?? 0);
  const gstOut = gstAgg?.gst_out ?? 0;
  const gstIn = (gstAgg?.gst_bill ?? 0) + (gstAgg?.gst_exp ?? 0);

  return NextResponse.json({
    pnl: { income, purchases: pnl?.purchases ?? 0, expenses: pnl?.expenses ?? 0, totalExpense, profit: income - totalExpense },
    salesByCustomer,
    aging,
    expByCat,
    topItems,
    balanceSheet: { cash, receivable, inventory, assets, payable, equity: assets - payable },
    cashFlow: { cashIn, cashOut, net: cashIn - cashOut, payIn: bal?.pay_in ?? 0, bankIn: bal?.bank_in ?? 0, payOut: bal?.pay_out ?? 0, expenses: pnl?.expenses ?? 0, bankOut: bal?.bank_out ?? 0 },
    gst: { output: gstOut, input: gstIn, payable: gstOut - gstIn },
  });
}
