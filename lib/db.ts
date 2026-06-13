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
  paid INTEGER NOT NULL DEFAULT 1
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
  // Idempotent backfill (also migrates DBs created before these features existed)
  await c.executeMultiple(
    `INSERT OR IGNORE INTO departments (name) SELECT DISTINCT department FROM employees WHERE department IS NOT NULL;
     INSERT OR IGNORE INTO settings (key, value) VALUES ('approver_timesheets','HR_ADMIN'),('approver_leaves','HR_ADMIN'),('approver_claims','HR_ADMIN');`
  );
}

async function ready(): Promise<Q> {
  if (!globalThis.__nexusReady) globalThis.__nexusReady = init();
  await globalThis.__nexusReady;
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
