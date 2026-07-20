"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, Briefcase, CalendarCheck2, Check, Clock4, Gift, KeyRound, Landmark, Palmtree, Pencil, Plus,
  Receipt, Save, ShieldAlert, Trash2, UserCircle2, UserCog, Wallet, X, Eye, IndianRupee,
} from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, fmtINR, fmtTime, todayStr, MONTHS } from "@/lib/format";
import {
  Avatar, Badge, Button, Card, ConfirmModal, DataTable, Field, Input, Modal, PageHeader, PageLoader,
  ProgressBar, Select, Tabs, Textarea, useToast, cn,
} from "@/components/ui";
import { PayslipModal } from "@/components/payslip";
import { useMe } from "@/components/shell";
import type { AttendanceRecord, Employee, LeaveRequest, Payslip, Reimbursement, SalaryComponent, Timesheet } from "@/lib/types";

type Balance = { leave_type_id: number; leave_type: string; paid: number; encashable: number; allocated: number; used: number; balance: number };

type Detail = {
  employee: Employee & { manager_name?: string | null };
  balances: Balance[];
  stats: { attendancePct: number; pendingLeaves: number; openTasks: number; payslips: number };
  managers: { id: number; name: string }[];
  departments: string[];
  components: SalaryComponent[];
};

const FIELDS_PERSONAL: [string, string, string?][] = [
  ["name", "Full Name"], ["email", "Work Email"], ["dob", "Date of Birth", "date"], ["gender", "Gender"],
  ["blood_group", "Blood Group"], ["marital_status", "Marital Status"], ["phone", "Phone"], ["alt_phone", "Alternate Phone"],
  ["address", "Address"], ["city", "City"], ["state", "State"], ["pincode", "PIN Code"],
  ["emergency_name", "Emergency Contact"], ["emergency_phone", "Emergency Phone"], ["emergency_relation", "Relation"],
];

const FIELDS_BANK: [string, string][] = [
  ["bank_name", "Bank Name"], ["account_no", "Account Number"], ["ifsc", "IFSC"], ["pan", "PAN"], ["uan", "UAN (PF)"],
];

export default function AdminEmployeeDetail() {
  const me = useMe();
  const isAdmin = me.role === "ADMIN";
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();

  const [data, setData] = useState<Detail | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [tab, setTab] = useState("personal");
  const [busy, setBusy] = useState(false);
  const [newPwd, setNewPwd] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);

  // per-tab datasets
  const [leaveHistory, setLeaveHistory] = useState<LeaveRequest[] | null>(null);
  const [attMonth, setAttMonth] = useState(todayStr().slice(0, 7));
  const [attData, setAttData] = useState<{ rows: AttendanceRecord[] } | null>(null);
  const [slips, setSlips] = useState<Payslip[] | null>(null);
  const [work, setWork] = useState<{ timesheets: Timesheet[]; claims: Reimbursement[] } | null>(null);

  // modals
  const [balModal, setBalModal] = useState<Balance | null>(null);
  const [balForm, setBalForm] = useState({ allocated: "0", used: "0" });
  const [encashModal, setEncashModal] = useState<Balance | null>(null);
  const [encashDays, setEncashDays] = useState("");
  const [grantOpen, setGrantOpen] = useState(false);
  const [grantForm, setGrantForm] = useState({ leave_type_id: "", from_date: todayStr(), to_date: todayStr(), reason: "" });
  const [attModal, setAttModal] = useState<{ date: string; status: string; check_in: string; check_out: string; mode: string } | null>(null);
  const [attDelete, setAttDelete] = useState<string | null>(null);
  const [viewSlip, setViewSlip] = useState<number | null>(null);
  const [slipDelete, setSlipDelete] = useState<Payslip | null>(null);
  const [compForm, setCompForm] = useState({ name: "", type: "earning", amount: "" });

  const load = useCallback(() => {
    api<Detail>(`/api/employees/${id}`).then((d) => {
      setData(d);
      const f: Record<string, string> = {};
      const e = d.employee as unknown as Record<string, unknown>;
      [...FIELDS_PERSONAL.map((x) => x[0]), ...FIELDS_BANK.map((x) => x[0]),
        "designation", "department", "manager_id", "join_date", "work_location", "employment_type",
        "role", "status", "basic", "hra", "special_allowance", "conveyance"].forEach((k) => {
        f[k] = e[k] === null || e[k] === undefined ? "" : String(e[k]);
      });
      setForm(f);
    }).catch(() => toast.push("error", "Could not load employee"));
  }, [id, toast]);
  useEffect(() => { load(); }, [load]);

  const loadLeaves = useCallback(() => {
    api<{ requests: LeaveRequest[] }>(`/api/employees/${id}/records?type=leaves`).then((d) => setLeaveHistory(d.requests)).catch(() => {});
  }, [id]);
  const loadAttendance = useCallback(() => {
    api<{ rows: AttendanceRecord[] }>(`/api/employees/${id}/records?type=attendance&month=${attMonth}`).then((d) => setAttData({ rows: d.rows })).catch(() => {});
  }, [id, attMonth]);
  const loadSlips = useCallback(() => {
    api<{ slips: Payslip[] }>(`/api/employees/${id}/records?type=payslips`).then((d) => setSlips(d.slips)).catch(() => {});
  }, [id]);
  const loadWork = useCallback(() => {
    api<{ timesheets: Timesheet[]; claims: Reimbursement[] }>(`/api/employees/${id}/records?type=work`).then(setWork).catch(() => {});
  }, [id]);

  useEffect(() => {
    if (tab === "leaves") loadLeaves();
    if (tab === "attendance") loadAttendance();
    if (tab === "payslips") loadSlips();
    if (tab === "work") loadWork();
  }, [tab, loadLeaves, loadAttendance, loadSlips, loadWork]);

  if (!data) return <PageLoader />;
  const emp = data.employee;
  const hrLocked = !isAdmin && emp.role === "ADMIN"; // HR can't touch Admin accounts
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const run = async (fn: () => Promise<unknown>, okMsg: string, after?: () => void) => {
    setBusy(true);
    try {
      await fn();
      toast.push("success", okMsg);
      after?.();
      return true;
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Action failed");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const save = () => run(() => api(`/api/employees/${id}`, { method: "PUT", body: JSON.stringify(form) }), "Employee record updated", load);

  const addComponent = () => {
    if (!compForm.name.trim() || !compForm.amount) return toast.push("error", "Component name and amount are required");
    run(() => api(`/api/employees/${id}/components`, { method: "POST", body: JSON.stringify(compForm) }), "Pay component added", () => {
      setCompForm({ name: "", type: "earning", amount: "" });
      load();
    });
  };
  const deleteComponent = (cid: number) =>
    run(() => api(`/api/employees/${id}/components/${cid}`, { method: "DELETE" }), "Component removed", load);

  const action = (body: Record<string, unknown>, okMsg: string, after?: () => void) =>
    run(() => api(`/api/employees/${id}/records`, { method: "POST", body: JSON.stringify(body) }), okMsg, after);

  const review = (kind: "leave" | "timesheet" | "claim", rid: number, act: "approve" | "reject", after: () => void) => {
    const url = kind === "leave" ? `/api/leaves/${rid}` : kind === "timesheet" ? `/api/timesheets/${rid}` : `/api/reimbursements/${rid}`;
    return run(() => api(url, { method: kind === "timesheet" ? "PUT" : "PATCH", body: JSON.stringify({ action: act }) }),
      act === "approve" ? "Approved ✓" : "Rejected", () => { after(); load(); });
  };

  const reviewButtons = (kind: "leave" | "timesheet" | "claim", rid: number, after: () => void) =>
    emp.id === me.id ? null : (
      <span className="flex justify-end gap-1.5">
        <button onClick={() => review(kind, rid, "approve", after)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-200 hover:bg-emerald-100 cursor-pointer"><Check size={12} /> Approve</button>
        <button onClick={() => review(kind, rid, "reject", after)} className="inline-flex items-center gap-1 rounded-lg bg-rose-50 dark:bg-rose-500/15 px-2.5 py-1.5 text-[11px] font-bold text-rose-600 dark:text-rose-400 ring-1 ring-rose-200 hover:bg-rose-100 cursor-pointer"><X size={12} /> Reject</button>
      </span>
    );

  const gross = (Number(form.basic) || 0) + (Number(form.hra) || 0) + (Number(form.special_allowance) || 0) + (Number(form.conveyance) || 0);

  return (
    <div className="fade-up">
      <PageHeader
        title={emp.name}
        subtitle={`${emp.emp_code} · ${emp.designation || "—"} · ${emp.department || "—"}`}
        icon={<UserCog size={20} />}
        actions={
          <span className="flex gap-2">
            <Button variant="outline" onClick={() => router.push("/admin/employees")}><ArrowLeft size={14} /> All Employees</Button>
            {!hrLocked && ["personal", "job", "bank"].includes(tab) && <Button onClick={save} loading={busy}><Save size={14} /> Save Changes</Button>}
          </span>
        }
      />

      {/* Summary strip */}
      <div className="mb-6 overflow-hidden rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="h-2 bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-500" />
        <div className="flex flex-wrap items-center gap-6 px-6 py-5">
          <div className="flex items-center gap-4">
            <Avatar name={emp.name} color={emp.avatar_color} size={64} />
            <div>
              <p className="text-lg font-extrabold text-slate-900 dark:text-slate-100">{emp.name}</p>
              <p className="text-sm text-slate-400 dark:text-slate-500">{emp.email}</p>
              <div className="mt-1.5 flex gap-2"><Badge tone={emp.role}>{emp.role}</Badge><Badge tone={emp.status}>{emp.status}</Badge></div>
            </div>
          </div>
          <div className="ml-auto grid grid-cols-2 gap-x-10 gap-y-3 sm:grid-cols-4">
            {[
              ["Attendance (month)", `${data.stats.attendancePct}%`],
              ["Pending Leaves", String(data.stats.pendingLeaves)],
              ["Open Tasks", String(data.stats.openTasks)],
              ["Payslips", String(data.stats.payslips)],
            ].map(([k, v]) => (
              <div key={k} className="text-center">
                <p className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">{v}</p>
                <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">{k}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Tabs
          tabs={[
            { key: "personal", label: "Personal" },
            { key: "job", label: "Job & Salary" },
            { key: "bank", label: "Bank & Tax" },
            { key: "leaves", label: "Leaves" },
            { key: "attendance", label: "Attendance" },
            { key: "payslips", label: "Payslips" },
            { key: "work", label: "Timesheets & Claims" },
            ...(isAdmin ? [{ key: "security", label: "Security" }] : []),
          ]}
          active={tab}
          onChange={setTab}
        />
        {hrLocked && <Badge tone="Pending">Admin accounts can only be edited by an Admin</Badge>}
      </div>

      {tab === "personal" && (
        <Card title="Personal Details" icon={<UserCircle2 size={16} />}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FIELDS_PERSONAL.map(([key, label, type]) => (
              <Field key={key} label={label}>
                <Input type={type || "text"} value={form[key] || ""} onChange={set(key)} disabled={hrLocked} />
              </Field>
            ))}
          </div>
        </Card>
      )}

      {tab === "job" && (
        <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card title="Job Details" icon={<Briefcase size={16} />}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Designation"><Input value={form.designation || ""} onChange={set("designation")} disabled={hrLocked} /></Field>
              <Field label="Department" hint="Manage the list in Org Settings">
                <Select value={form.department || ""} onChange={set("department")} disabled={hrLocked}>
                  <option value="">—</option>
                  {data.departments.map((d) => <option key={d} value={d}>{d}</option>)}
                </Select>
              </Field>
              <Field label="Reporting Manager">
                <Select value={form.manager_id || ""} onChange={set("manager_id")} disabled={hrLocked}>
                  <option value="">No manager</option>
                  {data.managers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </Select>
              </Field>
              <Field label="Date of Joining"><Input type="date" value={form.join_date || ""} onChange={set("join_date")} disabled={hrLocked} /></Field>
              <Field label="Work Location"><Input value={form.work_location || ""} onChange={set("work_location")} disabled={hrLocked} /></Field>
              <Field label="Employment Type">
                <Select value={form.employment_type || ""} onChange={set("employment_type")} disabled={hrLocked}>
                  {["Full-time", "Part-time", "Contract", "Intern"].map((t) => <option key={t}>{t}</option>)}
                </Select>
              </Field>
              <Field label="Platform Role" hint={!isAdmin ? "Admin-only" : undefined}>
                <Select value={form.role || ""} onChange={set("role")} disabled={!isAdmin}>
                  <option value="EMPLOYEE">Employee</option><option value="HR">HR</option><option value="ADMIN">Admin</option>
                </Select>
              </Field>
              <Field label="Status">
                <Select value={form.status || ""} onChange={set("status")} disabled={hrLocked}>
                  <option>Active</option><option>On Notice</option><option>Exited</option>
                </Select>
              </Field>
            </div>
          </Card>
          <Card title="Salary Structure (Monthly)" icon={<Landmark size={16} />}>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Basic (₹)"><Input type="number" min="0" value={form.basic || ""} onChange={set("basic")} disabled={hrLocked} /></Field>
              <Field label="HRA (₹)"><Input type="number" min="0" value={form.hra || ""} onChange={set("hra")} disabled={hrLocked} /></Field>
              <Field label="Special Allowance (₹)"><Input type="number" min="0" value={form.special_allowance || ""} onChange={set("special_allowance")} disabled={hrLocked} /></Field>
              <Field label="Conveyance (₹)"><Input type="number" min="0" value={form.conveyance || ""} onChange={set("conveyance")} disabled={hrLocked} /></Field>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-5 py-4 text-white">
              <span>
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-indigo-200">Gross / month</p>
                <p className="text-2xl font-extrabold">{fmtINR(gross)}</p>
              </span>
              <span className="text-right">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-indigo-200">Annual CTC</p>
                <p className="text-lg font-extrabold">{fmtINR(gross * 12)}</p>
              </span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-400 dark:text-slate-500">Changes apply from the next payroll run. To correct an already-generated month, delete that payslip (Payslips tab) and re-run payroll.</p>
          </Card>
        </div>

        <Card title="Pay Components" icon={<Wallet size={16} />}
          action={<span className="text-xs font-semibold text-slate-400 dark:text-slate-500">custom earnings &amp; deductions</span>}>
          <p className="mb-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            Add any custom <b>earning</b> (bonus, travel allowance, incentive) or <b>deduction</b> (loan EMI, insurance, advance) beyond the four standard components. These flow into the next payroll run and show up on the payslip automatically.
          </p>
          {data.components.length > 0 && (
            <ul className="mb-4 space-y-2">
              {data.components.map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 px-3.5 py-2.5">
                  <span className="flex items-center gap-2.5">
                    <Badge tone={c.type === "earning" ? "Approved" : "Rejected"}>{c.type === "earning" ? "Earning" : "Deduction"}</Badge>
                    <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{c.name}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className={cn("text-sm font-extrabold", c.type === "earning" ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-400")}>
                      {c.type === "earning" ? "+" : "−"}{fmtINR(c.amount)}
                    </span>
                    {!hrLocked && (
                      <button onClick={() => deleteComponent(c.id)} className="rounded-lg p-1.5 text-rose-500 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 cursor-pointer" title="Remove"><Trash2 size={14} /></button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {!hrLocked && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_150px_150px_auto] sm:items-end">
              <Field label="Name"><Input placeholder="e.g. Performance bonus" value={compForm.name} onChange={(e) => setCompForm({ ...compForm, name: e.target.value })} /></Field>
              <Field label="Type">
                <Select value={compForm.type} onChange={(e) => setCompForm({ ...compForm, type: e.target.value })}>
                  <option value="earning">Earning (+)</option>
                  <option value="deduction">Deduction (−)</option>
                </Select>
              </Field>
              <Field label="Amount (₹)"><Input type="number" min="1" placeholder="0" value={compForm.amount} onChange={(e) => setCompForm({ ...compForm, amount: e.target.value })} /></Field>
              <Button onClick={addComponent} loading={busy}><Plus size={14} /> Add</Button>
            </div>
          )}
        </Card>
        </div>
      )}

      {tab === "bank" && (
        <Card title="Bank & Tax Details" icon={<Landmark size={16} />}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FIELDS_BANK.map(([key, label]) => (
              <Field key={key} label={label}><Input value={form[key] || ""} onChange={set(key)} disabled={hrLocked} /></Field>
            ))}
          </div>
        </Card>
      )}

      {/* ---------------- Leaves management ---------------- */}
      {tab === "leaves" && (
        <div className="space-y-4">
          <Card title="Leave Balances" icon={<Palmtree size={16} />}
            action={!hrLocked && (
              <Button size="sm" onClick={() => { setGrantOpen(true); setGrantForm({ leave_type_id: "", from_date: todayStr(), to_date: todayStr(), reason: "" }); }}>
                <Gift size={13} /> Grant Leave
              </Button>
            )}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {data.balances.map((b) => (
                <div key={b.leave_type_id} className="group rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] font-bold text-slate-600 dark:text-slate-300">{b.leave_type}</p>
                    {!hrLocked && (
                      <button
                        onClick={() => { setBalModal(b); setBalForm({ allocated: String(b.allocated), used: String(b.used) }); }}
                        className="rounded-lg p-1.5 text-indigo-400 opacity-0 transition group-hover:opacity-100 hover:bg-indigo-50 cursor-pointer" title="Adjust balance"
                      >
                        <Pencil size={13} />
                      </button>
                    )}
                  </div>
                  {b.paid ? (
                    <>
                      <p className="mt-1.5 text-2xl font-extrabold text-slate-900 dark:text-slate-100">{b.balance}<span className="text-sm font-bold text-slate-400 dark:text-slate-500"> / {b.allocated}</span></p>
                      <ProgressBar className="mt-2" value={b.balance} max={b.allocated || 1} />
                      <p className="mt-1.5 text-[11px] font-semibold text-slate-400 dark:text-slate-500">{b.used} used</p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm font-semibold text-slate-400 dark:text-slate-500">Unpaid · {b.used} day(s) taken</p>
                  )}
                  {!hrLocked && !!b.encashable && b.balance > 0 && (
                    <button
                      onClick={() => { setEncashModal(b); setEncashDays(""); }}
                      className="mt-2.5 inline-flex items-center gap-1 rounded-lg bg-emerald-50 dark:bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/25 cursor-pointer"
                    >
                      <IndianRupee size={11} /> Encash
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <Card title="Leave History" icon={<CalendarCheck2 size={16} />}>
            {!leaveHistory ? <PageLoader /> : (
              <DataTable
                rows={leaveHistory}
                keyFor={(r) => r.id}
                empty={<p className="text-center text-sm text-slate-400 dark:text-slate-500">No leave requests yet.</p>}
                columns={[
                  { key: "type", header: "Type", render: (r) => <span><span className="block text-sm font-bold text-slate-800 dark:text-slate-100">{r.leave_type}</span><span className="text-xs text-slate-400 dark:text-slate-500">{r.days} day{r.days === 1 ? "" : "s"}</span></span> },
                  { key: "dates", header: "Dates", render: (r) => <span className="text-[13px] font-semibold">{fmtDate(r.from_date)}{r.from_date !== r.to_date && ` → ${fmtDate(r.to_date)}`}</span> },
                  { key: "reason", header: "Reason", className: "max-w-[240px]", render: (r) => <span className="line-clamp-2 text-[13px] text-slate-500 dark:text-slate-400">{r.reason}</span> },
                  {
                    key: "status", header: "Status",
                    render: (r) => (
                      <span title={r.review_note || undefined}>
                        <Badge tone={r.status}>{r.status}</Badge>
                        {r.reviewer_name && <span className="mt-0.5 block text-[10px] text-slate-400 dark:text-slate-500">by {r.reviewer_name}</span>}
                      </span>
                    ),
                  },
                  { key: "act", header: "", className: "text-right", render: (r) => (r.status === "Pending" && !hrLocked ? reviewButtons("leave", r.id, loadLeaves) : null) },
                ]}
              />
            )}
          </Card>
        </div>
      )}

      {/* ---------------- Attendance management ---------------- */}
      {tab === "attendance" && (
        <Card title="Attendance Records" icon={<CalendarCheck2 size={16} />}
          action={
            <span className="flex items-center gap-2">
              <Input type="month" value={attMonth} onChange={(e) => setAttMonth(e.target.value)} className="!w-auto !py-1.5 text-xs" />
              {!hrLocked && (
                <Button size="sm" onClick={() => setAttModal({ date: todayStr(), status: "Present", check_in: "09:30", check_out: "18:30", mode: "WFO" })}>
                  <Plus size={13} /> Add / Override Day
                </Button>
              )}
            </span>
          }>
          {!attData ? <PageLoader /> : (
            <DataTable
              rows={attData.rows}
              keyFor={(r) => r.id}
              empty={<p className="text-center text-sm text-slate-400 dark:text-slate-500">No records this month — add one with “Add / Override Day”.</p>}
              columns={[
                { key: "date", header: "Date", render: (r) => <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{fmtDate(r.date)}</span> },
                { key: "status", header: "Status", render: (r) => <Badge tone={r.status}>{r.status}</Badge> },
                { key: "in", header: "In", render: (r) => <span className="font-semibold">{fmtTime(r.check_in)}</span> },
                { key: "out", header: "Out", render: (r) => <span className="font-semibold">{fmtTime(r.check_out)}</span> },
                { key: "hours", header: "Hours", render: (r) => (r.hours ? `${r.hours}h` : "—") },
                { key: "mode", header: "Mode", render: (r) => (r.mode ? <Badge tone={r.mode}>{r.mode}</Badge> : "—") },
                {
                  key: "act", header: "", className: "text-right",
                  render: (r) => !hrLocked && (
                    <span className="flex justify-end gap-1">
                      <button
                        onClick={() => setAttModal({ date: r.date, status: r.status, check_in: r.check_in || "09:30", check_out: r.check_out || "18:30", mode: r.mode || "WFO" })}
                        className="rounded-lg p-2 text-indigo-500 hover:bg-indigo-50 cursor-pointer" title="Edit day"
                      ><Pencil size={14} /></button>
                      <button onClick={() => setAttDelete(r.date)} className="rounded-lg p-2 text-rose-500 dark:text-rose-400 hover:bg-rose-50 cursor-pointer" title="Remove record"><Trash2 size={14} /></button>
                    </span>
                  ),
                },
              ]}
            />
          )}
        </Card>
      )}

      {/* ---------------- Payslips ---------------- */}
      {tab === "payslips" && (
        <Card title="Payslip History" icon={<Wallet size={16} />}>
          {!slips ? <PageLoader /> : (
            <DataTable
              rows={slips}
              keyFor={(r) => r.id}
              empty={<p className="text-center text-sm text-slate-400 dark:text-slate-500">No payslips yet — run payroll from the Payroll Console.</p>}
              columns={[
                { key: "m", header: "Month", render: (r) => <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{MONTHS[r.month - 1]} {r.year}</span> },
                { key: "gross", header: "Gross", render: (r) => <span className="font-semibold">{fmtINR(r.gross)}</span> },
                { key: "ded", header: "Deductions", render: (r) => <span className="font-semibold text-rose-500 dark:text-rose-400">−{fmtINR(r.total_deductions)}</span> },
                { key: "net", header: "Net", render: (r) => <span className="font-extrabold text-emerald-600 dark:text-emerald-300">{fmtINR(r.net)}</span> },
                { key: "st", header: "Status", render: (r) => <Badge tone={r.status}>{r.status}</Badge> },
                {
                  key: "act", header: "", className: "text-right",
                  render: (r) => (
                    <span className="flex justify-end gap-1">
                      <button onClick={() => setViewSlip(r.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 px-3 py-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-300 hover:bg-indigo-100 cursor-pointer"><Eye size={13} /> View</button>
                      {isAdmin && <button onClick={() => setSlipDelete(r)} className="rounded-lg p-2 text-rose-500 dark:text-rose-400 hover:bg-rose-50 cursor-pointer" title="Delete (for re-run)"><Trash2 size={14} /></button>}
                    </span>
                  ),
                },
              ]}
            />
          )}
          <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">Deleting a payslip lets you fix the salary structure and re-run payroll for that month — the run only generates missing slips.</p>
        </Card>
      )}

      {/* ---------------- Timesheets & Claims ---------------- */}
      {tab === "work" && (
        <div className="space-y-4">
          <Card title="Timesheets" icon={<Clock4 size={16} />}>
            {!work ? <PageLoader /> : (
              <DataTable
                rows={work.timesheets}
                keyFor={(r) => r.id}
                empty={<p className="text-center text-sm text-slate-400 dark:text-slate-500">No timesheets logged.</p>}
                columns={[
                  { key: "date", header: "Date", render: (r) => <span className="text-sm font-bold">{fmtDate(r.date)}</span> },
                  { key: "loc", header: "Location", render: (r) => <Badge tone={r.location.includes("Home") ? "WFH" : "WFO"}>{r.location}</Badge> },
                  { key: "tasks", header: "Tasks", className: "max-w-[300px]", render: (r) => <span className="line-clamp-2 text-[13px] text-slate-500 dark:text-slate-400">{r.tasks}</span> },
                  { key: "h", header: "Hours", render: (r) => <span className="font-extrabold">{r.hours}h</span> },
                  { key: "st", header: "Status", render: (r) => <Badge tone={r.status}>{r.status}</Badge> },
                  { key: "act", header: "", className: "text-right", render: (r) => (r.status === "Pending" && !hrLocked ? reviewButtons("timesheet", r.id, loadWork) : null) },
                ]}
              />
            )}
          </Card>
          <Card title="Reimbursement Claims" icon={<Receipt size={16} />}>
            {!work ? <PageLoader /> : (
              <DataTable
                rows={work.claims}
                keyFor={(r) => r.id}
                empty={<p className="text-center text-sm text-slate-400 dark:text-slate-500">No claims submitted.</p>}
                columns={[
                  { key: "cat", header: "Category", render: (r) => <Badge tone="EMPLOYEE">{r.category}</Badge> },
                  { key: "desc", header: "Description", className: "max-w-[280px]", render: (r) => <span className="line-clamp-2 text-[13px] text-slate-500 dark:text-slate-400">{r.description}</span> },
                  { key: "date", header: "Date", render: (r) => <span className="text-[13px] font-semibold">{fmtDate(r.expense_date)}</span> },
                  { key: "amt", header: "Amount", render: (r) => <span className="font-extrabold">{fmtINR(r.amount)}</span> },
                  { key: "st", header: "Status", render: (r) => <Badge tone={r.status}>{r.status}</Badge> },
                  { key: "act", header: "", className: "text-right", render: (r) => (r.status === "Pending" && !hrLocked ? reviewButtons("claim", r.id, loadWork) : null) },
                ]}
              />
            )}
          </Card>
        </div>
      )}

      {/* ---------------- Security (admin) ---------------- */}
      {tab === "security" && isAdmin && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Card title="Reset Password" icon={<KeyRound size={16} />}>
            <p className="mb-4 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
              Set a temporary password for <span className="font-bold text-slate-700 dark:text-slate-200">{emp.name}</span>. They can change it later from Profile → Security.
            </p>
            <div className="flex gap-2">
              <Input placeholder="New temporary password" value={newPwd} onChange={(e) => setNewPwd(e.target.value)} />
              <Button
                onClick={() => run(() => api(`/api/employees/${id}`, { method: "PUT", body: JSON.stringify({ action: "reset_password", password: newPwd }) }), "Password reset", () => setNewPwd(""))}
                loading={busy} className="shrink-0"
              ><KeyRound size={14} /> Reset</Button>
            </div>
          </Card>
          <Card title="Danger Zone" icon={<ShieldAlert size={16} />}>
            <div className="rounded-2xl border border-rose-200 bg-rose-50/50 dark:border-rose-500/25 dark:bg-rose-500/10 p-4">
              <p className="text-sm font-bold text-rose-700 dark:text-rose-300">Delete this employee</p>
              <p className="mt-1 text-xs leading-relaxed text-rose-500 dark:text-rose-400">
                Permanently removes the account and all attendance, leave, timesheet, claim and payslip history. Prefer setting status to <b>Exited</b> to keep records.
              </p>
              <Button variant="danger" size="sm" className="mt-3" onClick={() => setConfirmDel(true)} disabled={emp.id === me.id}>
                <Trash2 size={13} /> Delete Permanently
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* ---------- modals ---------- */}
      <Modal open={!!balModal} onClose={() => setBalModal(null)} title={`Adjust ${balModal?.leave_type}`} subtitle={`${emp.name} — balance = allocated − used`}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Allocated (days/year)"><Input type="number" min="0" step="0.5" value={balForm.allocated} onChange={(e) => setBalForm({ ...balForm, allocated: e.target.value })} /></Field>
            <Field label="Used (days)"><Input type="number" min="0" step="0.5" value={balForm.used} onChange={(e) => setBalForm({ ...balForm, used: e.target.value })} /></Field>
          </div>
          <p className={cn("rounded-xl px-4 py-2.5 text-xs font-bold", Number(balForm.allocated) - Number(balForm.used) >= 0 ? "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400")}>
            New balance: {Number(balForm.allocated) - Number(balForm.used)} day(s)
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setBalModal(null)}>Cancel</Button>
            <Button loading={busy} onClick={() => balModal && action({ action: "adjust_balance", leave_type_id: balModal.leave_type_id, allocated: Number(balForm.allocated), used: Number(balForm.used) }, "Balance updated", () => { setBalModal(null); load(); })}>
              Save Balance
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!encashModal} onClose={() => setEncashModal(null)} title={`Encash ${encashModal?.leave_type}`} subtitle={`${emp.name} — paid out as an earning on the next payroll run`}>
        {encashModal && (() => {
          const perDay = Math.round(((Number(emp.basic) || 0) + (Number(emp.hra) || 0) + (Number(emp.special_allowance) || 0) + (Number(emp.conveyance) || 0)) / 30);
          const days = Number(encashDays) || 0;
          const amount = Math.round(perDay * days);
          const valid = days > 0 && days <= encashModal.balance;
          return (
            <div className="space-y-4">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Available: <b className="text-slate-700 dark:text-slate-200">{encashModal.balance} day(s)</b> · per-day (gross ÷ 30): <b className="text-slate-700 dark:text-slate-200">{fmtINR(perDay)}</b>
              </p>
              <Field label="Days to encash" required>
                <Input type="number" min="0.5" max={String(encashModal.balance)} step="0.5" value={encashDays} onChange={(e) => setEncashDays(e.target.value)} />
              </Field>
              <p className={cn("rounded-xl px-4 py-2.5 text-sm font-bold", valid ? "bg-emerald-50 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-slate-50 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400")}>
                Encashment amount: {fmtINR(amount)}
              </p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEncashModal(null)}>Cancel</Button>
                <Button loading={busy} onClick={() => {
                  if (!valid) return toast.push("error", "Enter a valid number of days within the balance");
                  action({ action: "encash_leave", leave_type_id: encashModal.leave_type_id, days }, "Leave encashed — added as a pay component", () => { setEncashModal(null); setEncashDays(""); load(); });
                }}><IndianRupee size={14} /> Encash {fmtINR(amount)}</Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      <Modal open={grantOpen} onClose={() => setGrantOpen(false)} title="Grant Leave" subtitle={`Auto-approved leave on behalf of ${emp.name} — balance deducted, attendance marked`}>
        <div className="space-y-4">
          <Field label="Leave Type" required>
            <Select value={grantForm.leave_type_id} onChange={(e) => setGrantForm({ ...grantForm, leave_type_id: e.target.value })}>
              <option value="">Select…</option>
              {data.balances.map((b) => <option key={b.leave_type_id} value={b.leave_type_id}>{b.leave_type}{b.paid ? ` (${b.balance} left)` : ""}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="From" required><Input type="date" value={grantForm.from_date} onChange={(e) => setGrantForm({ ...grantForm, from_date: e.target.value, to_date: e.target.value > grantForm.to_date ? e.target.value : grantForm.to_date })} /></Field>
            <Field label="To" required><Input type="date" min={grantForm.from_date} value={grantForm.to_date} onChange={(e) => setGrantForm({ ...grantForm, to_date: e.target.value })} /></Field>
          </div>
          <Field label="Reason" required><Textarea placeholder="e.g. Medical emergency — approved over phone" value={grantForm.reason} onChange={(e) => setGrantForm({ ...grantForm, reason: e.target.value })} /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setGrantOpen(false)}>Cancel</Button>
            <Button loading={busy} onClick={() => action({ action: "grant_leave", ...grantForm, leave_type_id: Number(grantForm.leave_type_id) }, "Leave granted ✓", () => { setGrantOpen(false); loadLeaves(); load(); })}>
              <Gift size={14} /> Grant Leave
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={!!attModal} onClose={() => setAttModal(null)} title="Add / Override Attendance" subtitle={`${emp.name} — existing record for the date is replaced`}>
        {attModal && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Date" required><Input type="date" value={attModal.date} onChange={(e) => setAttModal({ ...attModal, date: e.target.value })} /></Field>
              <Field label="Status">
                <Select value={attModal.status} onChange={(e) => setAttModal({ ...attModal, status: e.target.value })}>
                  {["Present", "Half Day", "On Duty", "Absent", "Leave", "Holiday"].map((s) => <option key={s}>{s}</option>)}
                </Select>
              </Field>
            </div>
            {(attModal.status === "Present" || attModal.status === "Half Day") && (
              <div className="grid grid-cols-3 gap-4">
                <Field label="Check In"><Input type="time" value={attModal.check_in} onChange={(e) => setAttModal({ ...attModal, check_in: e.target.value })} /></Field>
                <Field label="Check Out"><Input type="time" value={attModal.check_out} onChange={(e) => setAttModal({ ...attModal, check_out: e.target.value })} /></Field>
                <Field label="Mode">
                  <Select value={attModal.mode} onChange={(e) => setAttModal({ ...attModal, mode: e.target.value })}>
                    <option>WFO</option><option>WFH</option>
                  </Select>
                </Field>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAttModal(null)}>Cancel</Button>
              <Button loading={busy} onClick={() => action({ action: "set_attendance", ...attModal }, "Attendance saved", () => { setAttModal(null); loadAttendance(); load(); })}>
                <Save size={14} /> Save Day
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={!!attDelete} onClose={() => setAttDelete(null)} loading={busy} danger
        onConfirm={() => attDelete && action({ action: "clear_attendance", date: attDelete }, "Record removed", () => { setAttDelete(null); loadAttendance(); load(); })}
        title="Remove attendance record?" message={`Remove the record for ${attDelete ? fmtDate(attDelete) : ""}? The day becomes “No record”.`} confirmLabel="Remove"
      />

      <ConfirmModal
        open={!!slipDelete} onClose={() => setSlipDelete(null)} loading={busy} danger
        onConfirm={() => slipDelete && run(() => api(`/api/payroll/${slipDelete.id}`, { method: "DELETE" }), "Payslip deleted — re-run payroll to regenerate", () => { setSlipDelete(null); loadSlips(); load(); })}
        title={`Delete ${slipDelete ? MONTHS[slipDelete.month - 1] : ""} payslip?`}
        message="Use this to correct a wrong salary: delete the slip, fix the structure, then re-run payroll for that month." confirmLabel="Delete Payslip"
      />

      <ConfirmModal
        open={confirmDel} onClose={() => setConfirmDel(false)} loading={busy} danger
        onConfirm={() => run(() => api(`/api/employees/${id}`, { method: "DELETE" }), "Employee deleted", () => router.push("/admin/employees"))}
        title={`Delete ${emp.name}?`}
        message="This permanently deletes the employee and every record linked to them (attendance, leaves, payslips, claims). This cannot be undone."
        confirmLabel="Delete Forever"
      />

      <PayslipModal slipId={viewSlip} onClose={() => setViewSlip(null)} />
    </div>
  );
}
