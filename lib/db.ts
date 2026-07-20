import type { Client, InArgs } from "@libsql/client";
import path from "path";
import fs from "fs";
import { seed } from "./seed";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS employees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  emp_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'EMPLOYEE',
  designation TEXT, department TEXT,
  manager_id INTEGER,
  join_date TEXT, dob TEXT, gender TEXT, blood_group TEXT, marital_status TEXT,
  phone TEXT, alt_phone TEXT, address TEXT, city TEXT, state TEXT, pincode TEXT,
  emergency_name TEXT, emergency_phone TEXT, emergency_relation TEXT,
  work_location TEXT, employment_type TEXT DEFAULT 'Full-time',
  status TEXT NOT NULL DEFAULT 'Active',
  bank_name TEXT, account_no TEXT, ifsc TEXT, pan TEXT, uan TEXT,
  basic REAL NOT NULL DEFAULT 0, hra REAL NOT NULL DEFAULT 0,
  special_allowance REAL NOT NULL DEFAULT 0, conveyance REAL NOT NULL DEFAULT 0,
  avatar_color TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  date TEXT NOT NULL,
  check_in TEXT, check_out TEXT, hours REAL,
  status TEXT NOT NULL DEFAULT 'Present',
  mode TEXT DEFAULT 'WFO',
  UNIQUE(employee_id, date)
);

CREATE TABLE IF NOT EXISTS timesheets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  date TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT 'Work From Office',
  tasks TEXT NOT NULL,
  hours REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending',
  reviewed_by INTEGER, reviewed_at TEXT, review_note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS leave_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  annual_quota REAL NOT NULL DEFAULT 0,
  paid INTEGER NOT NULL DEFAULT 1,
  carry_forward INTEGER NOT NULL DEFAULT 0,
  carry_cap REAL NOT NULL DEFAULT 0,
  encashable INTEGER NOT NULL DEFAULT 0,
  scope TEXT
);

CREATE TABLE IF NOT EXISTS leave_balances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  leave_type_id INTEGER NOT NULL REFERENCES leave_types(id),
  allocated REAL NOT NULL DEFAULT 0,
  used REAL NOT NULL DEFAULT 0,
  UNIQUE(employee_id, leave_type_id)
);

CREATE TABLE IF NOT EXISTS leave_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  leave_type_id INTEGER NOT NULL REFERENCES leave_types(id),
  from_date TEXT NOT NULL, to_date TEXT NOT NULL,
  days REAL NOT NULL,
  half TEXT NOT NULL DEFAULT 'none',
  reason TEXT NOT NULL,
  responsible_id INTEGER,
  status TEXT NOT NULL DEFAULT 'Pending',
  reviewed_by INTEGER, reviewed_at TEXT, review_note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reimbursements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  category TEXT NOT NULL,
  amount REAL NOT NULL,
  expense_date TEXT NOT NULL,
  description TEXT NOT NULL,
  receipt TEXT,
  status TEXT NOT NULL DEFAULT 'Pending',
  reviewed_by INTEGER, reviewed_at TEXT, review_note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'General',
  description TEXT,
  assigned_to INTEGER NOT NULL REFERENCES employees(id),
  assigned_by INTEGER NOT NULL REFERENCES employees(id),
  priority TEXT NOT NULL DEFAULT 'Medium',
  duration TEXT,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'To Do',
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS payslips (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  month INTEGER NOT NULL, year INTEGER NOT NULL,
  basic REAL NOT NULL, hra REAL NOT NULL,
  special_allowance REAL NOT NULL, conveyance REAL NOT NULL,
  gross REAL NOT NULL,
  pf REAL NOT NULL, prof_tax REAL NOT NULL, tds REAL NOT NULL,
  lop_days REAL NOT NULL DEFAULT 0, lop_amount REAL NOT NULL DEFAULT 0,
  total_deductions REAL NOT NULL,
  net REAL NOT NULL,
  paid_days REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'Generated',
  generated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(employee_id, month, year)
);

CREATE TABLE IF NOT EXISTS holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  date TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL DEFAULT 'Public',
  description TEXT
);

CREATE TABLE IF NOT EXISTS announcements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  pinned INTEGER NOT NULL DEFAULT 0,
  created_by INTEGER NOT NULL REFERENCES employees(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS departments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  hod_id INTEGER REFERENCES employees(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS salary_components (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'earning',
  amount REAL NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS duty_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  from_date TEXT NOT NULL, to_date TEXT NOT NULL,
  days REAL NOT NULL,
  slot TEXT NOT NULL DEFAULT 'full',
  location TEXT NOT NULL,
  purpose TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'Pending',
  reviewed_by INTEGER, reviewed_at TEXT, review_note TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

/* ---------- Books / Finance module (Zoho Books-style) ---------- */
CREATE TABLE IF NOT EXISTS books_parties (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL DEFAULT 'customer',   -- customer | vendor
  name TEXT NOT NULL,
  company TEXT, email TEXT, phone TEXT, gstin TEXT,
  billing_address TEXT, notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS books_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  sku TEXT,
  type TEXT NOT NULL DEFAULT 'goods',       -- goods | service
  rate REAL NOT NULL DEFAULT 0,             -- selling price
  purchase_rate REAL NOT NULL DEFAULT 0,
  tax_rate REAL NOT NULL DEFAULT 18,        -- GST %
  stock REAL NOT NULL DEFAULT 0,
  low_stock REAL NOT NULL DEFAULT 0,
  unit TEXT DEFAULT 'pcs',
  hsn TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS books_txns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,                        -- quote | invoice | bill
  number TEXT NOT NULL,
  party_id INTEGER REFERENCES books_parties(id),
  txn_date TEXT NOT NULL,
  due_date TEXT,
  status TEXT NOT NULL DEFAULT 'Draft',
  subtotal REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  paid REAL NOT NULL DEFAULT 0,
  notes TEXT,
  converted_to INTEGER,                     -- quote -> invoice id
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS books_txn_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  txn_id INTEGER NOT NULL REFERENCES books_txns(id),
  item_id INTEGER,
  name TEXT NOT NULL,
  qty REAL NOT NULL DEFAULT 1,
  rate REAL NOT NULL DEFAULT 0,
  tax_rate REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS books_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  txn_id INTEGER NOT NULL REFERENCES books_txns(id),
  amount REAL NOT NULL,
  pay_date TEXT NOT NULL,
  mode TEXT, reference TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS books_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  expense_date TEXT NOT NULL,
  category TEXT NOT NULL,
  vendor_id INTEGER REFERENCES books_parties(id),
  amount REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  payment_mode TEXT, reference TEXT, notes TEXT,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS books_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'bank',   -- bank | cash | card | upi
  account_no TEXT,
  opening_balance REAL NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS books_bank_txns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL REFERENCES books_accounts(id),
  txn_date TEXT NOT NULL,
  kind TEXT NOT NULL,                  -- in | out
  amount REAL NOT NULL,
  description TEXT, category TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS books_recurring (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  party_id INTEGER REFERENCES books_parties(id),
  frequency TEXT NOT NULL DEFAULT 'monthly',   -- weekly | monthly | quarterly
  next_date TEXT NOT NULL,
  lines TEXT,                                   -- JSON
  total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  last_generated TEXT,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

/* ---------- Accountant: chart of accounts + double-entry journals ---------- */
CREATE TABLE IF NOT EXISTS books_coa (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,                            -- asset | liability | equity | income | expense
  code TEXT,
  opening_balance REAL NOT NULL DEFAULT 0,       -- on the account's natural side
  system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS books_journals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  journal_date TEXT NOT NULL,
  reference TEXT,
  narration TEXT,
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS books_journal_lines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  journal_id INTEGER NOT NULL REFERENCES books_journals(id),
  account_id INTEGER NOT NULL REFERENCES books_coa(id),
  debit REAL NOT NULL DEFAULT 0,
  credit REAL NOT NULL DEFAULT 0,
  description TEXT
);

-- Zoho Books integration (single-row config, id always 1). Secrets are HR/ADMIN-only & never sent to the client.
CREATE TABLE IF NOT EXISTS books_integration (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  dc TEXT NOT NULL DEFAULT 'in',
  client_id TEXT,
  client_secret TEXT,
  org_id TEXT,
  refresh_token TEXT,
  connected INTEGER NOT NULL DEFAULT 0,
  auto_sync INTEGER NOT NULL DEFAULT 0,
  last_sync TEXT,
  last_error TEXT
);

-- CRM sales pipeline: leads move New → Contacted → Qualified → Proposal → Won/Lost, then convert to a customer.
CREATE TABLE IF NOT EXISTS books_leads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  company TEXT, email TEXT, phone TEXT,
  source TEXT,                              -- Website | Referral | Cold Call | Event | Social | Other
  stage TEXT NOT NULL DEFAULT 'New',        -- New | Contacted | Qualified | Proposal | Won | Lost
  value REAL NOT NULL DEFAULT 0,            -- expected deal value
  owner_id INTEGER,
  notes TEXT,
  converted_party_id INTEGER REFERENCES books_parties(id),
  created_by INTEGER,
  created_at TEXT DEFAULT (datetime('now'))
);
`;

/** Small async query interface that mirrors the old better-sqlite3 surface (.get/.all/.run). */
export interface Q {
  get<T = Record<string, unknown>>(sql: string, ...args: unknown[]): Promise<T | undefined>;
  all<T = Record<string, unknown>>(sql: string, ...args: unknown[]): Promise<T[]>;
  run(sql: string, ...args: unknown[]): Promise<{ lastInsertRowid: number | undefined; changes: number }>;
}

type Executor = (stmt: { sql: string; args: InArgs }) => Promise<{ rows: unknown[]; lastInsertRowid?: bigint; rowsAffected: number }>;

function wrap(exec: Executor): Q {
  return {
    async get<T = Record<string, unknown>>(sql: string, ...args: unknown[]) {
      const r = await exec({ sql, args: args as InArgs });
      return r.rows[0] as T | undefined;
    },
    async all<T = Record<string, unknown>>(sql: string, ...args: unknown[]) {
      const r = await exec({ sql, args: args as InArgs });
      return r.rows as T[];
    },
    async run(sql: string, ...args: unknown[]) {
      const r = await exec({ sql, args: args as InArgs });
      return { lastInsertRowid: r.lastInsertRowid != null ? Number(r.lastInsertRowid) : undefined, changes: r.rowsAffected };
    },
  };
}

declare global {
  // eslint-disable-next-line no-var
  var __nexusClientP: Promise<Client> | undefined;
  // eslint-disable-next-line no-var
  var __nexusReady: Promise<void> | undefined;
  // eslint-disable-next-line no-var
  var __nexusInitErr: string | undefined;
}

export function lastInitError(): string | undefined {
  return globalThis.__nexusInitErr;
}

/**
 * Pick the right libSQL client at runtime:
 *  - local dev (file: URL) → native `@libsql/client` (supports a local SQLite file)
 *  - production (Turso libsql:// URL) → pure-JS `@libsql/client/web` over HTTP,
 *    so the serverless bundle carries NO native binary (keeps it small + portable).
 */
async function makeClient(): Promise<Client> {
  const url = process.env.DATABASE_URL || "file:./data/nexus-hrms.db";
  if (url.startsWith("file:")) {
    const dir = path.dirname(url.slice("file:".length));
    if (dir && dir !== "." && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const { createClient } = await import("@libsql/client");
    return createClient({ url, intMode: "number" });
  }
  const { createClient } = await import("@libsql/client/web");
  return createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN, intMode: "number" });
}

function client(): Promise<Client> {
  if (!globalThis.__nexusClientP) globalThis.__nexusClientP = makeClient();
  return globalThis.__nexusClientP;
}

/** Run a write transaction. NOTE: callers go through the public `tx` which ensures the schema first. */
async function txRaw<T>(fn: (q: Q) => Promise<T>): Promise<T> {
  const t = await (await client()).transaction("write");
  try {
    const res = await fn(wrap((stmt) => t.execute(stmt)));
    await t.commit();
    return res;
  } catch (e) {
    try { await t.rollback(); } catch { /* ignore */ }
    throw e;
  }
}

async function init(): Promise<void> {
  const c = await client();
  await c.executeMultiple(SCHEMA);
  const q = wrap((stmt) => c.execute(stmt));
  const count = await q.get<{ c: number }>("SELECT COUNT(*) AS c FROM employees");
  if (!count || count.c === 0) {
    await txRaw((t) => seed(t));
  }
  // Idempotent backfill + column migrations. Wrapped defensively: across concurrent cold
  // function instances these can race (e.g. duplicate ALTER) — a race must never reject init()
  // and poison the instance for the whole session.
  try {
    await c.executeMultiple(
      `INSERT OR IGNORE INTO departments (name) SELECT DISTINCT department FROM employees WHERE department IS NOT NULL;
       INSERT OR IGNORE INTO settings (key, value) VALUES ('approver_timesheets','HR_ADMIN'),('approver_leaves','HR_ADMIN'),('approver_claims','HR_ADMIN');
       INSERT OR IGNORE INTO books_integration (id, dc) VALUES (1, 'in');`
    );
  } catch { /* already backfilled by a concurrent instance */ }

  const addCol = async (table: string, col: string, def: string) => {
    try {
      const info = await c.execute(`PRAGMA table_info(${table})`);
      if (!info.rows.some((r) => (r as { name?: string }).name === col)) {
        await c.execute(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
      }
    } catch { /* column already added by a concurrent instance */ }
  };
  await addCol("payslips", "components", "TEXT");
  await addCol("reimbursements", "receipt_data", "TEXT"); // base64 of the uploaded bill (image/pdf)
  await addCol("reimbursements", "receipt_type", "TEXT"); // its mime type
  await addCol("leave_types", "carry_forward", "INTEGER NOT NULL DEFAULT 0");
  await addCol("leave_types", "carry_cap", "REAL NOT NULL DEFAULT 0");
  await addCol("leave_types", "encashable", "INTEGER NOT NULL DEFAULT 0");
  await addCol("leave_types", "scope", "TEXT");
  // Zoho Books sync — map each local record to its Zoho counterpart so re-syncs are idempotent.
  await addCol("books_parties", "zoho_id", "TEXT");
  await addCol("books_items", "zoho_id", "TEXT");
  await addCol("books_txns", "zoho_id", "TEXT");
  await addCol("books_integration", "last_pull", "TEXT"); // throttles the Zoho→NexusHR auto-pull
  // Backstop: a Zoho record maps to at most one local row, so overlapping pulls can't create duplicates.
  for (const ix of [
    "CREATE UNIQUE INDEX IF NOT EXISTS ux_books_parties_zoho ON books_parties(zoho_id) WHERE zoho_id IS NOT NULL",
    "CREATE UNIQUE INDEX IF NOT EXISTS ux_books_items_zoho ON books_items(zoho_id) WHERE zoho_id IS NOT NULL",
    "CREATE UNIQUE INDEX IF NOT EXISTS ux_books_txns_zoho ON books_txns(zoho_id) WHERE zoho_id IS NOT NULL",
  ]) { try { await c.execute(ix); } catch { /* a pre-existing duplicate or a concurrent instance — non-fatal */ } }

  // Seed the Books / Finance module with demo data on first run (independent of the HR seed).
  try {
    const bc = await q.get<{ c: number }>("SELECT COUNT(*) AS c FROM books_items");
    if (!bc || bc.c === 0) {
      await c.executeMultiple(`
        INSERT INTO books_items (name, sku, type, rate, purchase_rate, tax_rate, stock, low_stock, unit, hsn) VALUES
          ('Standard Website Package','WEB-STD','service',45000,0,18,0,0,'job',NULL),
          ('Premium Website Package','WEB-PRM','service',90000,0,18,0,0,'job',NULL),
          ('Annual Maintenance (AMC)','AMC-01','service',24000,0,18,0,0,'year',NULL),
          ('Wireless Mouse','HW-MS','goods',650,400,18,120,20,'pcs','8471'),
          ('Mechanical Keyboard','HW-KB','goods',2200,1500,18,45,10,'pcs','8471'),
          ('USB-C Hub','HW-HUB','goods',1800,1100,18,8,15,'pcs','8471');
        INSERT INTO books_parties (type, name, company, email, phone, gstin, billing_address) VALUES
          ('customer','Rahul Mehta','Acme Retail Pvt Ltd','rahul@acmeretail.in','+91 98200 11223','27AABCA1234A1Z5','BKC, Mumbai 400051'),
          ('customer','Sneha Iyer','BlueWave Technologies','sneha@bluewave.io','+91 99030 44556','29AACCB5678B1Z3','Koramangala, Bengaluru 560034'),
          ('customer','Imtiaz Khan','Sunrise Traders','imtiaz@sunrise.co','+91 90011 22334','07AADCS9012C1Z1','Connaught Place, New Delhi 110001'),
          ('vendor','Karan Shah','TechSupply Distributors','karan@techsupply.in','+91 98765 00112','27AABCT3344D1Z9','Andheri, Mumbai 400069'),
          ('vendor','Office Mart India','Office Mart India','sales@officemart.in','+91 80022 33445','29AABCO5566E1Z7','Whitefield, Bengaluru 560066');
        INSERT INTO books_txns (type, number, party_id, txn_date, due_date, status, subtotal, tax, total, paid, created_by) VALUES
          ('invoice','INV-0001',1,'2026-06-08','2026-07-08','Sent',45000,8100,53100,0,1),
          ('invoice','INV-0002',2,'2026-06-11','2026-06-26','Partially Paid',17500,3150,20650,10000,1),
          ('quote','QT-0001',3,'2026-06-13','2026-06-27','Sent',90000,16200,106200,0,1),
          ('bill','BILL-0001',4,'2026-06-09','2026-07-09','Open',20000,3600,23600,0,1),
          ('sales_order','SO-0001',1,'2026-06-14','2026-06-28','Confirmed',24000,4320,28320,0,1),
          ('purchase_order','PO-0001',5,'2026-06-10','2026-06-24','Draft',18000,3240,21240,0,1),
          ('credit_note','CN-0001',2,'2026-06-15',NULL,'Open',2200,396,2596,0,1);
        INSERT INTO books_txn_lines (txn_id, item_id, name, qty, rate, tax_rate, amount) VALUES
          (1,1,'Standard Website Package',1,45000,18,45000),
          (2,4,'Wireless Mouse',10,650,18,6500),
          (2,5,'Mechanical Keyboard',5,2200,18,11000),
          (3,2,'Premium Website Package',1,90000,18,90000),
          (4,4,'Wireless Mouse',50,400,18,20000),
          (5,3,'Annual Maintenance (AMC)',1,24000,18,24000),
          (6,6,'USB-C Hub',10,1800,18,18000),
          (7,5,'Mechanical Keyboard',1,2200,18,2200);
        INSERT INTO books_payments (txn_id, amount, pay_date, mode, reference) VALUES
          (2,10000,'2026-06-12','UPI','UTR2026061200');
        INSERT INTO books_expenses (expense_date, category, vendor_id, amount, tax, total, payment_mode, reference, created_by) VALUES
          ('2026-06-05','Office Rent',NULL,40000,0,40000,'Bank Transfer','RENT-JUN',1),
          ('2026-06-09','Software Subscriptions',4,8000,1440,9440,'Card','AWS-INV-9921',1);
        INSERT INTO books_accounts (name, type, account_no, opening_balance) VALUES
          ('HDFC Current A/c','bank','50200012345678',500000),
          ('Petty Cash','cash',NULL,15000),
          ('Company UPI','upi','company@hdfc',0);
        INSERT INTO books_bank_txns (account_id, txn_date, kind, amount, description, category) VALUES
          (1,'2026-06-08','in',53100,'Collection — INV-0001','Sales'),
          (1,'2026-06-05','out',40000,'Office rent — June','Rent'),
          (2,'2026-06-10','out',2500,'Stationery purchase','Office Supplies');
      `);
    }
  } catch { /* books already seeded, or a concurrent instance seeded it */ }

  // Seed the chart of accounts + opening journals independently — runs on any DB whose ledger is still empty.
  try {
    const cc = await q.get<{ c: number }>("SELECT COUNT(*) AS c FROM books_coa");
    if (!cc || cc.c === 0) {
      await c.executeMultiple(`
        INSERT INTO books_coa (name, type, code, opening_balance, system) VALUES
          ('Cash','asset','1000',100000,1),
          ('Bank','asset','1010',500000,1),
          ('Accounts Receivable','asset','1100',120000,1),
          ('Inventory','asset','1200',150000,1),
          ('Accounts Payable','liability','2000',60000,1),
          ('GST Payable','liability','2100',0,1),
          ('Owner Equity','equity','3000',810000,1),
          ('Sales','income','4000',0,1),
          ('Other Income','income','4100',0,1),
          ('Cost of Goods Sold','expense','5000',0,1),
          ('Salaries','expense','5100',0,1),
          ('Rent','expense','5200',0,1),
          ('Utilities','expense','5300',0,1),
          ('Office Expenses','expense','5400',0,1),
          ('Bank Charges','expense','5500',0,1);
      `);
      // Look up ids by name so the opening journals are correct regardless of auto-increment offsets.
      const acc = await q.all<{ id: number; name: string }>("SELECT id, name FROM books_coa");
      const id = (n: string) => acc.find((a) => a.name === n)?.id ?? 0;
      const j1 = Number((await q.run("INSERT INTO books_journals (journal_date, reference, narration, created_by) VALUES (?, ?, ?, ?)", "2026-06-02", "JV-001", "Owner capital infusion", 1)).lastInsertRowid);
      await q.run("INSERT INTO books_journal_lines (journal_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)", j1, id("Bank"), 200000, 0, "Capital into bank");
      await q.run("INSERT INTO books_journal_lines (journal_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)", j1, id("Owner Equity"), 0, 200000, "Owner equity");
      const j2 = Number((await q.run("INSERT INTO books_journals (journal_date, reference, narration, created_by) VALUES (?, ?, ?, ?)", "2026-06-05", "JV-002", "June office rent paid", 1)).lastInsertRowid);
      await q.run("INSERT INTO books_journal_lines (journal_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)", j2, id("Rent"), 40000, 0, "Rent expense");
      await q.run("INSERT INTO books_journal_lines (journal_id, account_id, debit, credit, description) VALUES (?, ?, ?, ?, ?)", j2, id("Bank"), 0, 40000, "Paid from bank");
    }
  } catch { /* ledger already seeded, or a concurrent instance seeded it */ }

  // Seed a demo sales pipeline independently — runs on any DB whose leads table is still empty.
  try {
    const lc = await q.get<{ c: number }>("SELECT COUNT(*) AS c FROM books_leads");
    if (!lc || lc.c === 0) {
      await c.executeMultiple(`
        INSERT INTO books_leads (name, company, email, phone, source, stage, value, notes, created_by) VALUES
          ('Aarav Mehta','Quantum Retail','aarav@quantumretail.in','+91 98100 11223','Website','New',120000,'Wants a full e-commerce build',1),
          ('Diya Sharma','Lotus Hospitality','diya@lotushotels.com','+91 99220 33445','Referral','Contacted',250000,'Referred by Acme Retail',1),
          ('Vikram Nair','Nimbus Logistics','vikram@nimbuslog.in','+91 90030 55667','Cold Call','Qualified',180000,'Needs fleet tracking dashboard',1),
          ('Sara Khan','Bright Edu','sara@brightedu.org','+91 80040 77889','Event','Proposal',320000,'Proposal sent — awaiting sign-off',1),
          ('Rohan Gupta','Peak Fitness','rohan@peakfit.in','+91 70050 99001','Social','Won',95000,'Closed — converting to customer',1),
          ('Meera Joshi','Cloud9 Travels','meera@cloud9.travel','+91 98765 22110','Website','Lost',140000,'Went with a competitor',1);
      `);
    }
  } catch { /* leads already seeded, or a concurrent instance seeded it */ }
}

async function ready(): Promise<Q> {
  if (!globalThis.__nexusReady) globalThis.__nexusReady = init();
  try {
    await globalThis.__nexusReady;
  } catch (e) {
    // A transient setup failure must NOT permanently poison this instance — allow the next call to retry.
    globalThis.__nexusInitErr = String((e as Error)?.message || e);
    globalThis.__nexusReady = undefined;
    throw e;
  }
  return wrap(async (stmt) => (await client()).execute(stmt));
}

/* ---- public API (all async) ---- */
export async function get<T = Record<string, unknown>>(sql: string, ...args: unknown[]): Promise<T | undefined> {
  return (await ready()).get<T>(sql, ...args);
}
export async function all<T = Record<string, unknown>>(sql: string, ...args: unknown[]): Promise<T[]> {
  return (await ready()).all<T>(sql, ...args);
}
export async function run(sql: string, ...args: unknown[]) {
  return (await ready()).run(sql, ...args);
}
export async function tx<T>(fn: (q: Q) => Promise<T>): Promise<T> {
  await ready();
  return txRaw(fn);
}
