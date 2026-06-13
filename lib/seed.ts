import bcrypt from "bcryptjs";
import { computePayslip } from "./payroll";
import type { Q } from "./db";

/* Deterministic PRNG so the demo data looks the same on every machine. */
function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const iso = (d: Date) => d.toLocaleDateString("en-CA");
const addD = (s: string, n: number) => {
  const d = new Date(s + "T00:00:00");
  d.setDate(d.getDate() + n);
  return iso(d);
};
const isWknd = (s: string) => [0, 6].includes(new Date(s + "T00:00:00").getDay());

export async function seed(q: Q) {
  const rand = mulberry32(20260612);
  const TODAY = iso(new Date());
  const YEAR = new Date().getFullYear();

  /* Month-day taken from an offset relative to today, with a fixed year —
     keeps birthday/anniversary widgets populated whenever the DB is seeded. */
  const mdFrom = (offset: number, year: number) => `${year}${addD(TODAY, offset).slice(4)}`;

  const colors = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4", "#ef4444", "#84cc16", "#f97316", "#14b8a6"];

  const employees = [
    {
      code: "ADM001", name: "Kshitiz Garg", email: "kshitiz@nexushr.in", pwd: "Admin@123", role: "ADMIN",
      desig: "Chief Technology Officer", dept: "Engineering", mgr: null as number | null,
      join: mdFrom(-740, YEAR - 2), dob: mdFrom(96, 1999), gender: "Male", blood: "B+", marital: "Single",
      phone: "+91 98110 23401", city: "Gurugram", state: "Haryana",
      basic: 90000, hra: 36000, special: 40000, conv: 4000,
    },
    {
      code: "HR001", name: "Priya Sharma", email: "priya@nexushr.in", pwd: "Hr@123", role: "HR",
      desig: "HR Manager", dept: "Human Resources", mgr: 1,
      join: mdFrom(-620, YEAR - 2), dob: mdFrom(52, 1996), gender: "Female", blood: "O+", marital: "Married",
      phone: "+91 98110 23402", city: "New Delhi", state: "Delhi",
      basic: 45000, hra: 18000, special: 15000, conv: 2500,
    },
    {
      code: "EMP001", name: "Ranjeet Kumar", email: "ranjeet@nexushr.in", pwd: "Emp@123", role: "EMPLOYEE",
      desig: "Senior Quant Analyst", dept: "Quant Research", mgr: 1,
      join: mdFrom(-400, YEAR - 1), dob: mdFrom(2, 1998), gender: "Male", blood: "A+", marital: "Single",
      phone: "+91 98110 23403", city: "Gurugram", state: "Haryana",
      basic: 60000, hra: 24000, special: 21000, conv: 3000,
    },
    {
      code: "EMP002", name: "Kaushik Chatterjee", email: "kaushik@nexushr.in", pwd: "Emp@123", role: "EMPLOYEE",
      desig: "Markets Analyst", dept: "Markets", mgr: 1,
      join: mdFrom(-300, YEAR - 1), dob: mdFrom(10, 1997), gender: "Male", blood: "AB+", marital: "Single",
      phone: "+91 98110 23404", city: "Kolkata", state: "West Bengal",
      basic: 50000, hra: 20000, special: 16000, conv: 2500,
    },
    {
      code: "EMP003", name: "Devender Kumar", email: "devender@nexushr.in", pwd: "Emp@123", role: "EMPLOYEE",
      desig: "DevOps Engineer", dept: "Engineering", mgr: 1,
      join: mdFrom(-510, YEAR - 2), dob: mdFrom(28, 1995), gender: "Male", blood: "B-", marital: "Married",
      phone: "+91 98110 23405", city: "Noida", state: "Uttar Pradesh",
      basic: 48000, hra: 19200, special: 14000, conv: 2500,
    },
    {
      code: "EMP004", name: "Gautam Gupta", email: "gautam@nexushr.in", pwd: "Emp@123", role: "EMPLOYEE",
      desig: "Frontend Developer", dept: "Engineering", mgr: 1,
      join: mdFrom(-230, YEAR - 1), dob: mdFrom(34, 2000), gender: "Male", blood: "O-", marital: "Single",
      phone: "+91 98110 23406", city: "Gurugram", state: "Haryana",
      basic: 42000, hra: 16800, special: 11500, conv: 2000,
    },
    {
      code: "EMP005", name: "Ashok Rautela", email: "ashok@nexushr.in", pwd: "Emp@123", role: "EMPLOYEE",
      desig: "Operations Lead", dept: "Operations", mgr: 1,
      join: mdFrom(4, YEAR - 1), dob: mdFrom(150, 1993), gender: "Male", blood: "A-", marital: "Married",
      phone: "+91 98110 23407", city: "Dehradun", state: "Uttarakhand",
      basic: 52000, hra: 20800, special: 15000, conv: 2500,
    },
    {
      code: "EMP006", name: "Anushka Agrawal", email: "anushka@nexushr.in", pwd: "Emp@123", role: "EMPLOYEE",
      desig: "UI/UX Designer", dept: "Design", mgr: 1,
      join: mdFrom(6, YEAR - 2), dob: mdFrom(170, 1999), gender: "Female", blood: "B+", marital: "Single",
      phone: "+91 98110 23408", city: "Jaipur", state: "Rajasthan",
      basic: 44000, hra: 17600, special: 12000, conv: 2000,
    },
    {
      code: "EMP007", name: "Bharti Mangla", email: "bharti@nexushr.in", pwd: "Emp@123", role: "EMPLOYEE",
      desig: "Finance Associate", dept: "Finance", mgr: 1,
      join: mdFrom(6, YEAR - 3), dob: mdFrom(200, 1996), gender: "Female", blood: "O+", marital: "Married",
      phone: "+91 98110 23409", city: "New Delhi", state: "Delhi",
      basic: 40000, hra: 16000, special: 10500, conv: 2000,
    },
    {
      code: "EMP008", name: "Ritik Dhingra", email: "ritik@nexushr.in", pwd: "Emp@123", role: "EMPLOYEE",
      desig: "Backend Developer", dept: "Engineering", mgr: 1,
      join: mdFrom(-90, YEAR), dob: mdFrom(230, 2001), gender: "Male", blood: "A+", marital: "Single",
      phone: "+91 98110 23410", city: "Gurugram", state: "Haryana",
      basic: 38000, hra: 15200, special: 9800, conv: 2000,
    },
  ];

  const INS_EMP = `
    INSERT INTO employees (emp_code, name, email, password_hash, role, designation, department, manager_id,
      join_date, dob, gender, blood_group, marital_status, phone, address, city, state, pincode,
      emergency_name, emergency_phone, emergency_relation, work_location, employment_type, status,
      bank_name, account_no, ifsc, pan, uan, basic, hra, special_allowance, conveyance, avatar_color)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

  const banks = ["HDFC Bank", "ICICI Bank", "State Bank of India", "Axis Bank", "Kotak Mahindra Bank"];
  for (let i = 0; i < employees.length; i++) {
    const e = employees[i];
    await q.run(
      INS_EMP,
      e.code, e.name, e.email, bcrypt.hashSync(e.pwd, 10), e.role, e.desig, e.dept, e.mgr,
      e.join, e.dob, e.gender, e.blood, e.marital, e.phone,
      `${100 + i * 7}, Sector ${12 + i}, ${e.city}`, e.city, e.state, String(110001 + i * 11),
      i % 2 ? "Sunita Devi" : "Rakesh Kumar", `+91 99100 1${String(2300 + i)}`, i % 2 ? "Mother" : "Father",
      e.city === "Gurugram" ? "Gurugram HQ" : `${e.city} Office`,
      e.code === "EMP008" ? "Intern" : "Full-time", "Active",
      banks[i % banks.length], `5010${String(11223344 + i * 91)}`, `HDFC000${1000 + i}`,
      `ABCPK${1000 + i * 7}H`, `1011${String(22334455 + i * 13)}`,
      e.basic, e.hra, e.special, e.conv, colors[i % colors.length]
    );
  }

  /* ---- Leave types & balances ---- */
  const INS_TYPE = "INSERT INTO leave_types (name, annual_quota, paid) VALUES (?, ?, ?)";
  await q.run(INS_TYPE, "Casual Leave", 12, 1);
  await q.run(INS_TYPE, "Sick Leave", 8, 1);
  await q.run(INS_TYPE, "Earned Leave", 15, 1);
  await q.run(INS_TYPE, "Leave Without Pay", 0, 0);
  const INS_BAL = "INSERT INTO leave_balances (employee_id, leave_type_id, allocated, used) VALUES (?, ?, ?, 0)";
  for (let id = 1; id <= employees.length; id++) {
    await q.run(INS_BAL, id, 1, 12);
    await q.run(INS_BAL, id, 2, 8);
    await q.run(INS_BAL, id, 3, 15);
    await q.run(INS_BAL, id, 4, 0);
  }

  /* ---- Holidays (current year) ---- */
  const INS_HOL = "INSERT OR IGNORE INTO holidays (name, date, type, description) VALUES (?, ?, ?, ?)";
  const HOLIDAYS: [string, string, string, string][] = [
    ["New Year's Day", `${YEAR}-01-01`, "Public", "Start of the calendar year"],
    ["Republic Day", `${YEAR}-01-26`, "Public", "National holiday"],
    ["Holi", `${YEAR}-03-04`, "Public", "Festival of colours"],
    ["Ambedkar Jayanti", `${YEAR}-04-14`, "Optional", "Restricted holiday"],
    ["Muharram", `${YEAR}-06-26`, "Public", "Islamic new year"],
    ["Independence Day", `${YEAR}-08-15`, "Public", "National holiday"],
    ["Gandhi Jayanti", `${YEAR}-10-02`, "Public", "National holiday"],
    ["Diwali", `${YEAR}-11-08`, "Public", "Festival of lights"],
    ["Govardhan Puja", `${YEAR}-11-09`, "Optional", "Restricted holiday"],
    ["Christmas", `${YEAR}-12-25`, "Public", "Christmas day"],
  ];
  for (const h of HOLIDAYS) await q.run(INS_HOL, ...h);
  const holidayDates = new Set(HOLIDAYS.map((h) => h[1]));

  /* ---- Leave requests ---- */
  const INS_LEAVE = `
    INSERT INTO leave_requests (employee_id, leave_type_id, from_date, to_date, days, half, reason, responsible_id,
      status, reviewed_by, reviewed_at, review_note, created_at)
    VALUES (?, ?, ?, ?, ?, 'none', ?, ?, ?, ?, ?, ?, datetime('now', ?))`;
  const INS_ATT = `
    INSERT OR REPLACE INTO attendance (employee_id, date, check_in, check_out, hours, status, mode)
    VALUES (?, ?, ?, ?, ?, ?, ?)`;
  const USE_BAL = "UPDATE leave_balances SET used = used + ? WHERE employee_id = ? AND leave_type_id = ?";

  const wdays = (from: string, to: string) => {
    let n = 0;
    for (let c = from; c <= to; c = addD(c, 1)) if (!isWknd(c) && !holidayDates.has(c)) n++;
    return n;
  };
  const approveLeave = async (emp: number, type: number, from: string, to: string, reason: string, resp: number | null, reviewer = 2) => {
    const d = wdays(from, to);
    if (d <= 0) return;
    await q.run(INS_LEAVE, emp, type, from, to, d, reason, resp, "Approved", reviewer, new Date().toISOString(), "Approved. Take care!", "-10 days");
    await q.run(USE_BAL, d, emp, type);
    for (let c = from; c <= to; c = addD(c, 1))
      if (!isWknd(c) && !holidayDates.has(c)) await q.run(INS_ATT, emp, c, null, null, null, "Leave", null);
  };

  // On leave today (powers the "Employees on leave" widgets)
  await approveLeave(5, 2, TODAY, TODAY, "Fever and rest advised by doctor", 10);
  await approveLeave(6, 3, addD(TODAY, -2), TODAY, "Family function in hometown", 10);
  await approveLeave(9, 1, TODAY, addD(TODAY, 1), "Personal errand — bank and registry work", 2);
  // History
  await approveLeave(1, 3, addD(TODAY, -32), addD(TODAY, -30), "Short vacation", 2);
  await approveLeave(2, 1, addD(TODAY, -21), addD(TODAY, -21), "Family commitment", 1, 1);
  await approveLeave(3, 2, addD(TODAY, -15), addD(TODAY, -15), "Migraine", 4);
  // Pending (powers the approvals queue)
  const pend = async (emp: number, type: number, from: string, to: string, reason: string, resp: number | null, agoDays: number) => {
    const d = wdays(from, to);
    if (d <= 0) return;
    await q.run(INS_LEAVE, emp, type, from, to, d, reason, resp, "Pending", null, null, null, `-${agoDays} days`);
  };
  await pend(3, 1, addD(TODAY, 6), addD(TODAY, 7), "Cousin's wedding in Patna", 4, 2);
  await pend(4, 4, addD(TODAY, 3), addD(TODAY, 3), "Visa appointment at embassy", 3, 1);
  await pend(8, 3, addD(TODAY, 10), addD(TODAY, 12), "Trip to Jaipur for family event", 9, 0);
  await pend(10, 2, addD(TODAY, 1), addD(TODAY, 1), "Dental procedure scheduled", 6, 0);
  // Rejected example
  await q.run(INS_LEAVE, 6, 1, addD(TODAY, -10), addD(TODAY, -9), Math.max(1, wdays(addD(TODAY, -10), addD(TODAY, -9))), "Long weekend plan", 4, "Rejected", 1, new Date().toISOString(), "Release week — please reschedule.", "-12 days");

  /* ---- Attendance: weekdays for the past ~45 days ---- */
  for (let id = 1; id <= employees.length; id++) {
    for (let off = 45; off >= 1; off--) {
      const day = addD(TODAY, -off);
      if (isWknd(day) || holidayDates.has(day)) continue;
      const existing = await q.get("SELECT id FROM attendance WHERE employee_id = ? AND date = ?", id, day);
      if (existing) continue; // leave rows already inserted
      const r = rand();
      if (r < 0.03) {
        await q.run(INS_ATT, id, day, null, null, null, "Absent", null);
        continue;
      }
      const inH = 9 + Math.floor(rand() * 2); // 9 or 10
      const inM = Math.floor(rand() * 60);
      const workedMin = 7.5 * 60 + Math.floor(rand() * 150); // 7.5h – 10h
      const outTotal = inH * 60 + inM + workedMin;
      const checkIn = `${String(inH).padStart(2, "0")}:${String(inM).padStart(2, "0")}`;
      const checkOut = `${String(Math.floor(outTotal / 60)).padStart(2, "0")}:${String(outTotal % 60).padStart(2, "0")}`;
      await q.run(INS_ATT, id, day, checkIn, checkOut, Math.round((workedMin / 60) * 100) / 100, "Present", r < 0.18 ? "WFH" : "WFO");
    }
  }

  /* ---- Timesheets ---- */
  const INS_TS = `
    INSERT INTO timesheets (employee_id, date, location, tasks, hours, status, reviewed_by, reviewed_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`;
  const TS_TASKS: Record<number, string[]> = {
    1: ["Deployed PulseScreen and OTR handler to production", "Architecture review — payroll engine v2", "Hiring panel + roadmap planning", "Incident review and EC2 cost optimisation"],
    3: ["Market making on Sambhav, strategy development", "Backtest momentum signals on NSE futures", "Risk model calibration and reporting"],
    4: ["Morning market scan and desk notes", "Client portfolio review and rebalance memo", "Earnings season tracker update"],
    5: ["EC2 autoscaling policies + CloudWatch alarms", "CI/CD pipeline migration to GitHub Actions", "Disaster-recovery drill and runbook updates"],
    6: ["Dashboard revamp — React component library", "Fixed responsive issues on reports module", "Design-system tokens integration"],
    10: ["OTR handler regression test suite", "REST API pagination + caching layer", "Database index tuning for reports"],
  };
  for (const [empStr, pool] of Object.entries(TS_TASKS)) {
    const emp = Number(empStr);
    let added = 0;
    for (let off = 1; off <= 14 && added < 8; off++) {
      const day = addD(TODAY, -off);
      if (isWknd(day) || holidayDates.has(day)) continue;
      const onLeave = await q.get("SELECT id FROM attendance WHERE employee_id = ? AND date = ? AND status = 'Leave'", emp, day);
      if (onLeave) continue;
      const hours = 7 + Math.floor(rand() * 4) + (rand() < 0.5 ? 0.5 : 0);
      const status = added < 3 ? "Pending" : rand() < 0.85 ? "Approved" : "Rejected";
      await q.run(
        INS_TS,
        emp, day, rand() < 0.2 ? "Work From Home" : "Work From Office",
        pool[(off + added) % pool.length], hours, status,
        status === "Pending" ? null : 2, status === "Pending" ? null : new Date().toISOString()
      );
      added++;
    }
  }

  /* ---- Reimbursements ---- */
  const INS_RE = `
    INSERT INTO reimbursements (employee_id, category, amount, expense_date, description, receipt, status, reviewed_by, reviewed_at, review_note, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now', ?))`;
  await q.run(INS_RE, 3, "Travel", 2450, addD(TODAY, -4), "Cab to client office (Sambhav) — round trip", "uber_apr_2450.pdf", "Pending", null, null, null, "-4 days");
  await q.run(INS_RE, 6, "Internet", 1199, addD(TODAY, -9), "Monthly broadband bill — WFH allowance", "airtel_bill.pdf", "Approved", 2, new Date().toISOString(), "Approved under WFH policy", "-9 days");
  await q.run(INS_RE, 5, "Meals", 650, addD(TODAY, -2), "Team dinner during release night", "zomato_650.pdf", "Pending", null, null, null, "-2 days");
  await q.run(INS_RE, 1, "Client Entertainment", 5800, addD(TODAY, -15), "Dinner with Sambhav stakeholders", "taj_invoice.pdf", "Approved", 2, new Date().toISOString(), "Within policy limit", "-15 days");
  await q.run(INS_RE, 9, "Medical", 3200, addD(TODAY, -12), "Annual health check-up", "apollo_receipt.pdf", "Rejected", 2, new Date().toISOString(), "Covered under group insurance — claim there", "-12 days");
  await q.run(INS_RE, 4, "Travel", 12750, addD(TODAY, -6), "Flight DEL→BLR for markets conference", "indigo_pnr.pdf", "Pending", null, null, null, "-6 days");
  await q.run(INS_RE, 10, "Office Supplies", 2100, addD(TODAY, -3), "Mechanical keyboard for development work", "amazon_invoice.pdf", "Pending", null, null, null, "-3 days");
  await q.run(INS_RE, 8, "Software", 1599, addD(TODAY, -20), "Figma professional — monthly", "figma_inv.pdf", "Approved", 1, new Date().toISOString(), "Tool approved for design team", "-20 days");

  /* ---- Tasks ---- */
  const INS_TASK = `
    INSERT INTO tasks (title, category, description, assigned_to, assigned_by, priority, duration, due_date, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`;
  await q.run(INS_TASK, "Q2 dashboard revamp — design handoff", "Design", "Finalise Figma specs for the analytics dashboard and hand off to frontend.", 8, 1, "High", "5 days", addD(TODAY, 5), "In Progress");
  await q.run(INS_TASK, "Set up CloudWatch alarms for EC2 fleet", "DevOps", "CPU, memory, disk + SNS alerts to #infra channel.", 5, 1, "Urgent", "2 days", addD(TODAY, 2), "In Progress");
  await q.run(INS_TASK, "OTR handler regression tests", "Engineering", "Cover edge cases from last week's incident. Target 90% coverage.", 10, 1, "Urgent", "3 days", addD(TODAY, 3), "To Do");
  await q.run(INS_TASK, "May P&L reconciliation", "Finance", "Match broker statements with internal ledger; flag breaks > ₹1,000.", 9, 1, "High", "4 days", addD(TODAY, -1), "Done");
  await q.run(INS_TASK, "Campus hiring drive — shortlists", "HR", "Screen 120 applications for SDE intern role; shortlist 25.", 2, 1, "Medium", "1 week", addD(TODAY, 7), "In Progress");
  await q.run(INS_TASK, "Sambhav market-making strategy v3", "Quant", "Tighten spreads during opening auction; add inventory guardrails.", 3, 1, "High", "1 week", addD(TODAY, 6), "To Do");
  await q.run(INS_TASK, "Earnings tracker — Q1 FY27 sheet", "Markets", "Prepare sector-wise earnings calendar with consensus estimates.", 4, 1, "Medium", "3 days", addD(TODAY, 4), "To Do");
  await q.run(INS_TASK, "Vendor onboarding — payroll provider", "Operations", "Collect compliance docs and complete vendor risk checklist.", 7, 2, "Low", "2 weeks", addD(TODAY, 12), "In Progress");
  await q.run(INS_TASK, "Frontend performance audit", "Engineering", "Lighthouse + bundle analysis; ship top 5 quick wins.", 6, 1, "Medium", "4 days", addD(TODAY, 8), "To Do");
  await q.run(INS_TASK, "Update employee handbook — leave policy", "HR", "Reflect new earned-leave carry-forward rules.", 2, 1, "Low", "3 days", addD(TODAY, -3), "Done");

  /* ---- Payslips: previous 3 months, all Paid ---- */
  const INS_SLIP = `
    INSERT INTO payslips (employee_id, month, year, basic, hra, special_allowance, conveyance, gross, pf, prof_tax, tds,
      lop_days, lop_amount, total_deductions, net, paid_days, status, generated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Paid', ?)`;
  const now = new Date();
  for (let back = 3; back >= 1; back--) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const m = d.getMonth() + 1, y = d.getFullYear();
    for (let i = 0; i < employees.length; i++) {
      const e = employees[i];
      const p = computePayslip({ basic: e.basic, hra: e.hra, special_allowance: e.special, conveyance: e.conv }, m, y, 0);
      await q.run(INS_SLIP, i + 1, m, y, p.basic, p.hra, p.special_allowance, p.conveyance, p.gross, p.pf, p.prof_tax, p.tds,
        p.lop_days, p.lop_amount, p.total_deductions, p.net, p.paid_days,
        new Date(y, m, 1).toISOString());
    }
  }

  /* ---- Announcements ---- */
  const INS_ANN = "INSERT INTO announcements (title, body, pinned, created_by, created_at) VALUES (?, ?, ?, ?, datetime('now', ?))";
  await q.run(INS_ANN, "Muharram holiday — office closed", `The office will remain closed on 26 ${YEAR === 2026 ? "Jun" : "June"} for Muharram. Wishing everyone peace and reflection.`, 1, 2, "-1 days");
  await q.run(INS_ANN, "H1 Town Hall — all hands", "Join us for the half-yearly town hall in the 4th-floor auditorium (and on Meet). Agenda: H1 results, roadmap, awards night teaser.", 0, 1, "-3 days");
  await q.run(INS_ANN, "New reimbursement policy live", "Claims now auto-route to HR with a 5-working-day SLA. Always attach receipts — claims without receipts will bounce.", 0, 2, "-6 days");
  await q.run(INS_ANN, "Welcome our newest engineer!", "Please give a warm welcome to Ritik Dhingra joining the backend team. Say hi on #introductions.", 0, 2, "-12 days");
}
