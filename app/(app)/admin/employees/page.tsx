"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { UsersRound, Plus, Search, Download, ArrowRight, Building2, ShieldCheck, UserCheck } from "lucide-react";
import { api } from "@/lib/api";
import { downloadCSV, fmtDate, fmtINR } from "@/lib/format";
import { Badge, Button, Card, DataTable, Field, Input, Modal, PageHeader, PageLoader, PersonCell, Select, StatCard, useToast } from "@/components/ui";
import { useMe } from "@/components/shell";

interface EmpRow {
  id: number;
  emp_code: string;
  name: string;
  email: string;
  role: string;
  designation: string | null;
  department: string | null;
  manager_name: string | null;
  join_date: string | null;
  phone: string | null;
  status: string;
  avatar_color: string | null;
  basic: number;
  hra: number;
  special_allowance: number;
  conveyance: number;
  employment_type: string | null;
}

const NEW_EMPTY = {
  name: "", email: "", role: "EMPLOYEE", designation: "", department: "Engineering",
  join_date: "", phone: "", basic: "", hra: "", special_allowance: "", conveyance: "", password: "",
};

export default function AdminEmployeesPage() {
  const me = useMe();
  const isAdmin = me.role === "ADMIN";
  const router = useRouter();
  const [data, setData] = useState<{ rows: EmpRow[]; departments: string[] } | null>(null);
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [status, setStatus] = useState("");
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState(NEW_EMPTY);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ emp_code: string; password: string } | null>(null);
  const toast = useToast();

  const load = () => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (dept) params.set("department", dept);
    if (status) params.set("status", status);
    api<{ rows: EmpRow[]; departments: string[] }>(`/api/employees?${params}`).then(setData).catch(() => {});
  };
  useEffect(() => {
    const t = setTimeout(load, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, dept, status]);

  const stats = useMemo(() => {
    const rows = data?.rows || [];
    return {
      total: rows.length,
      active: rows.filter((r) => r.status === "Active").length,
      depts: new Set(rows.map((r) => r.department).filter(Boolean)).size,
      mgmt: rows.filter((r) => r.role !== "EMPLOYEE").length,
    };
  }, [data]);

  if (!data) return <PageLoader />;

  const gross = (r: EmpRow) => r.basic + r.hra + r.special_allowance + r.conveyance;

  const exportCSV = () =>
    downloadCSV(
      "employees.csv",
      ["Code", "Name", "Email", "Role", "Designation", "Department", "Joined", "Status", "Monthly Gross"],
      data.rows.map((r) => [r.emp_code, r.name, r.email, r.role, r.designation, r.department, r.join_date, r.status, gross(r)])
    );

  const create = async () => {
    if (!form.name.trim() || !form.email.trim()) return toast.push("error", "Name and email are required");
    setBusy(true);
    try {
      const res = await api<{ emp_code: string; password: string; id: number }>("/api/employees", { method: "POST", body: JSON.stringify(form) });
      setCreated({ emp_code: res.emp_code, password: res.password });
      setForm(NEW_EMPTY);
      load();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Failed to create employee");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fade-up">
      <PageHeader
        title="Employees"
        subtitle="Create, edit and manage every employee record — A to Z"
        icon={<UsersRound size={20} />}
        actions={
          <span className="flex gap-2">
            <Button variant="outline" onClick={exportCSV}><Download size={14} /> Export CSV</Button>
            <Button onClick={() => { setCreated(null); setModal(true); }}><Plus size={15} /> Add Employee</Button>
          </span>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total Employees" value={stats.total} icon={<UsersRound size={20} />} accent="indigo" />
        <StatCard label="Active" value={stats.active} icon={<UserCheck size={20} />} accent="emerald" />
        <StatCard label="Departments" value={stats.depts} icon={<Building2 size={20} />} accent="violet" />
        <StatCard label="HR & Admins" value={stats.mgmt} icon={<ShieldCheck size={20} />} accent="amber" />
      </div>

      <Card bodyClassName="p-4" className="mb-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, email, ID, designation…"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            />
          </div>
          <Select value={dept} onChange={(e) => setDept(e.target.value)} className="!w-auto">
            <option value="">All departments</option>
            {data.departments.map((d) => <option key={d}>{d}</option>)}
          </Select>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} className="!w-auto">
            <option value="">All statuses</option>
            <option>Active</option><option>On Notice</option><option>Exited</option>
          </Select>
        </div>
      </Card>

      <Card title="All Employees" icon={<UsersRound size={16} />} action={<span className="text-xs font-semibold text-slate-400 dark:text-slate-500">{data.rows.length} records</span>}>
        <DataTable
          rows={data.rows}
          keyFor={(r) => r.id}
          columns={[
            { key: "emp", header: "Employee", render: (r) => <PersonCell name={r.name} sub={`${r.emp_code} · ${r.email}`} color={r.avatar_color} /> },
            { key: "role", header: "Role", render: (r) => <Badge tone={r.role}>{r.role}</Badge> },
            {
              key: "job", header: "Designation",
              render: (r) => (
                <span>
                  <span className="block text-[13px] font-bold text-slate-700 dark:text-slate-200">{r.designation || "—"}</span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">{r.department || "—"}</span>
                </span>
              ),
            },
            { key: "joined", header: "Joined", render: (r) => <span className="text-[13px] font-semibold">{fmtDate(r.join_date)}</span> },
            { key: "ctc", header: "Monthly Gross", render: (r: EmpRow) => <span className="text-[13px] font-extrabold text-slate-800 dark:text-slate-100">{fmtINR(gross(r))}</span> },
            { key: "status", header: "Status", render: (r) => <Badge tone={r.status}>{r.status}</Badge> },
            {
              key: "open", header: "", className: "text-right",
              render: (r) => (
                <button
                  onClick={() => router.push(`/admin/employees/${r.id}`)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 px-3 py-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-300 transition hover:bg-indigo-100 cursor-pointer"
                >
                  Manage <ArrowRight size={13} />
                </button>
              ),
            },
          ]}
        />
      </Card>

      <Modal open={modal} onClose={() => setModal(false)} title="Add New Employee" subtitle="Creates the account with login credentials and standard leave quota" width="max-w-2xl">
        {created ? (
          <div className="space-y-4 text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-full bg-emerald-50 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-300"><UserCheck size={26} /></span>
            <p className="text-lg font-extrabold text-slate-900 dark:text-slate-100">Employee created 🎉</p>
            <div className="mx-auto max-w-sm rounded-2xl border border-indigo-100 bg-indigo-50/60 dark:border-indigo-500/25 dark:bg-indigo-500/10 p-4 text-left">
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-400">Share these credentials</p>
              <p className="mt-2 flex justify-between text-sm"><span className="font-semibold text-slate-500 dark:text-slate-400">Employee ID</span><span className="font-extrabold text-slate-800 dark:text-slate-100">{created.emp_code}</span></p>
              <p className="mt-1 flex justify-between text-sm"><span className="font-semibold text-slate-500 dark:text-slate-400">Temporary password</span><span className="font-extrabold text-slate-800 dark:text-slate-100">{created.password}</span></p>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500">Ask them to change the password after first sign-in (Profile → Security).</p>
            <Button onClick={() => { setModal(false); setCreated(null); }}>Done</Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Full Name" required><Input placeholder="e.g. Aarav Mehta" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
              <Field label="Work Email" required><Input type="email" placeholder="aarav@nexushr.in" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Role" required hint={!isAdmin ? "HR can onboard employees only" : undefined}>
                <Select value={isAdmin ? form.role : "EMPLOYEE"} onChange={(e) => setForm({ ...form, role: e.target.value })} disabled={!isAdmin}>
                  <option value="EMPLOYEE">Employee</option>
                  <option value="HR">HR</option>
                  <option value="ADMIN">Admin</option>
                </Select>
              </Field>
              <Field label="Department" hint="Manage the list in Org Settings">
                <Select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })}>
                  {(data.departments.length ? data.departments : ["Engineering"]).map((d) => <option key={d}>{d}</option>)}
                </Select>
              </Field>
              <Field label="Designation"><Input placeholder="e.g. Software Engineer" value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} /></Field>
              <Field label="Date of Joining"><Input type="date" value={form.join_date} onChange={(e) => setForm({ ...form, join_date: e.target.value })} /></Field>
              <Field label="Phone"><Input placeholder="+91 …" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></Field>
              <Field label="Temporary Password" hint="Defaults to Welcome@123">
                <Input placeholder="Welcome@123" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </Field>
            </div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">Monthly Salary Structure (₹)</p>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Field label="Basic"><Input type="number" min="0" value={form.basic} onChange={(e) => setForm({ ...form, basic: e.target.value })} /></Field>
              <Field label="HRA"><Input type="number" min="0" value={form.hra} onChange={(e) => setForm({ ...form, hra: e.target.value })} /></Field>
              <Field label="Special"><Input type="number" min="0" value={form.special_allowance} onChange={(e) => setForm({ ...form, special_allowance: e.target.value })} /></Field>
              <Field label="Conveyance"><Input type="number" min="0" value={form.conveyance} onChange={(e) => setForm({ ...form, conveyance: e.target.value })} /></Field>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setModal(false)}>Cancel</Button>
              <Button onClick={create} loading={busy}><Plus size={14} /> Create Employee</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
