# NexusHR — Complete HRMS Platform

A full-featured, three-role HR management system: **Employee self-service**, **HR operations**, and **Admin control** — attendance, timesheets, leave, reimbursements, tasks, payroll with printable payslips, holidays, announcements, directory and people analytics.

Built with **Next.js 15 (App Router) + TypeScript + Tailwind CSS v4 + libSQL/SQLite**. Local dev uses a zero-config file database; production runs on **Turso** (hosted libSQL) so it works on serverless hosts like Vercel. The DB auto-creates its schema and seeds demo data on first run.

## Quick Start

```bash
npm install
npm run dev        # http://localhost:3000  (uses a local file DB at data/nexus-hrms.db)
```

Production build: `npm run build && npm start`

## Deploy free — Vercel + Turso

Vercel's serverless functions can't write to disk, so the database lives on **Turso** (a free hosted libSQL/SQLite). Both are free.

**1. Push to GitHub**
```bash
git init && git add -A && git commit -m "NexusHR"
gh repo create nexus-hrms --private --source=. --push   # or create the repo on github.com and push
```

**2. Create the Turso database** (one-time)
```bash
brew install tursodatabase/tap/turso      # or: curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup                          # free account
turso db create nexus-hrms
turso db show nexus-hrms --url             # → DATABASE_URL  (libsql://…turso.io)
turso db tokens create nexus-hrms          # → DATABASE_AUTH_TOKEN
```

**3. Seed Turso once, from your machine** (avoids any cold-start timeout — the seed runs locally, not in a serverless request)
```bash
cp .env.example .env.local
# paste DATABASE_URL + DATABASE_AUTH_TOKEN into .env.local, then:
npm run dev
# open http://localhost:3000 once — the first request creates the schema + demo data in Turso. Stop the server (Ctrl-C).
```

**4. Deploy to Vercel**
- Import the GitHub repo at [vercel.com/new](https://vercel.com/new).
- Add three Environment Variables (Settings → Environment Variables):
  - `DATABASE_URL` — your `libsql://…` URL
  - `DATABASE_AUTH_TOKEN` — the Turso token
  - `NEXUS_JWT_SECRET` — any random string (`openssl rand -base64 32`)
- Deploy. Done — your live URL is always-on, fast, and data persists.

> To wipe and re-seed Turso later: `turso db shell nexus-hrms "DROP TABLE employees"` (or drop all tables / recreate the db), then repeat step 3.

## Demo Accounts

| Role | Email | Employee ID | Password |
|------|-------|-------------|----------|
| **Admin** (full control) | kshitiz@nexushr.in | ADM001 | `Admin@123` |
| **HR** (people ops) | priya@nexushr.in | HR001 | `Hr@123` |
| **Employee** | ranjeet@nexushr.in | EMP001 | `Emp@123` |

All other seeded employees (EMP002–EMP008): password `Emp@123`. Sign in with email **or** employee ID — or use the one-click demo chips on the login page.

## What Each Role Can Do

**Everyone (Employee)**
- Dashboard: greeting hero, check-in/check-out punch clock, attendance %, leave balance, pending requests, last net pay, weekly hours, birthdays / anniversaries / holidays / who's-out widgets
- My Profile: edit personal, contact, emergency and bank/tax details, profile completeness meter, **change password**
- Attendance: monthly color-coded calendar + punch history
- Timesheet: log daily work (date, location, tasks, hours), edit/delete while pending
- Apply Leave: 4 leave types with live balances, working-day calculator (skips weekends + holidays), half-day support, backup colleague, cancel pending requests
- Reimbursement: expense claims by category with receipt reference and status tracking
- Tasks: kanban board (To Do → In Progress → Done)
- My Payroll: salary structure, YTD totals, payslip history, **printable payslip** (print → save as PDF)
- Directory, Holiday calendar, Announcements feed

**HR (everything above, plus)**
- Approvals Center: approve/reject leaves, timesheets and claims with notes
- Employees: view all employee records (read-only)
- Payroll Console: view payouts and payslips
- Team attendance view, assign tasks, manage holidays & announcements

**HR can also (A-Z employee management)**
- Onboard employees and edit any record end-to-end (HR cannot edit Admin accounts or change roles)
- 360° employee console per person: adjust leave balances, **grant leave on behalf** (auto-approved), add/override/delete any day's attendance, view payslips, approve timesheets & claims inline

**Admin (everything above, plus)**
- Create employees of any role (auto employee ID + credentials handoff screen + standard leave quota)
- Edit any record: job, salary structure, role (Employee/HR/Admin), status, bank details
- Reset any password, delete employees (danger zone), delete a payslip to correct + re-run payroll
- **Run monthly payroll** for all active employees (auto LOP deduction for unpaid leave), mark all paid, CSV export
- **Org Settings** — the rules everything else follows:
  - **Departments**: create/rename/delete (renames sync every employee record) and assign a **HOD** per department
  - **Approval workflow**: per module (timesheets / leaves / claims) choose who approves — *HR & Admin*, *Dept HOD + HR & Admin*, or *Admin only*. An HOD (even a regular employee) gets an Approvals inbox scoped to their department
  - **Leave types & quotas**: add/edit/delete types, set annual quotas, paid/unpaid, and push a quota to everyone's balance

## Architecture

```
app/
  login/                 # split-screen login with demo quick-sign-in
  (app)/                 # authenticated shell: sidebar + topbar + role-gated nav
    dashboard/ profile/ attendance/ timesheet/ leave/
    reimbursement/ tasks/ payroll/ directory/ holidays/ announcements/
    admin/ approvals/ | employees/ (+[id]) | payroll/
  api/                   # 18 route handlers (auth, employees, leaves, payroll…)
components/              # ui.tsx (design system), charts.tsx (pure SVG), shell, payslip
lib/                     # db.ts (schema), seed.ts (demo data), auth.ts (JWT), payroll.ts
data/nexus-hrms.db       # SQLite database (delete to re-seed from scratch)
middleware.ts            # route protection + role gating for /admin
```

- **Auth**: bcrypt-hashed passwords, JWT (jose) in an httpOnly cookie, 7-day sessions, server-side role checks on every API route (approvers can never review their own requests).
- **Payroll math** (`lib/payroll.ts`): PF 12% of basic, professional tax, slab TDS, per-day LOP — shared by the seeder and the payroll engine so numbers always agree.
- **Demo data** is date-aware: birthdays, anniversaries, leaves and attendance are seeded relative to *today*, so the dashboard is always alive.

## Reset Demo Data

```bash
rm data/nexus-hrms.db   # re-created + re-seeded on next request
```
