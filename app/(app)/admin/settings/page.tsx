"use client";

import { useCallback, useEffect, useState } from "react";
import { Settings2, Building2, Plus, Pencil, Trash2, Workflow, Palmtree, Crown, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { Badge, Button, Card, ConfirmModal, DataTable, Field, Input, Modal, PageHeader, PageLoader, Select, useToast } from "@/components/ui";
import type { Department } from "@/lib/types";

interface LeaveTypeRow {
  id: number;
  name: string;
  annual_quota: number;
  paid: number;
  request_count: number;
}

const POLICY_OPTIONS = [
  { value: "HR_ADMIN", label: "HR & Admin" },
  { value: "HOD", label: "Dept HOD + HR & Admin" },
  { value: "ADMIN", label: "Admin only" },
];

const MODULES: { key: string; label: string; desc: string }[] = [
  { key: "approver_timesheets", label: "Timesheets", desc: "Who can approve or reject daily timesheet entries" },
  { key: "approver_leaves", label: "Leave Requests", desc: "Who can approve or reject leave applications" },
  { key: "approver_claims", label: "Reimbursements", desc: "Who can approve or reject expense claims" },
];

export default function OrgSettingsPage() {
  const [departments, setDepartments] = useState<Department[] | null>(null);
  const [people, setPeople] = useState<{ id: number; name: string }[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [types, setTypes] = useState<LeaveTypeRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  // modals
  const [newDept, setNewDept] = useState("");
  const [renameDept, setRenameDept] = useState<Department | null>(null);
  const [renameVal, setRenameVal] = useState("");
  const [delDept, setDelDept] = useState<Department | null>(null);
  const [typeModal, setTypeModal] = useState<LeaveTypeRow | "new" | null>(null);
  const [typeForm, setTypeForm] = useState({ name: "", annual_quota: "0", paid: true, sync: false });
  const [delType, setDelType] = useState<LeaveTypeRow | null>(null);

  const load = useCallback(() => {
    api<{ rows: Department[] }>("/api/departments").then((d) => setDepartments(d.rows)).catch(() => {});
    api<{ rows: { id: number; name: string }[] }>("/api/employees").then((d) => setPeople(d.rows as { id: number; name: string }[])).catch(() => {});
    api<{ settings: Record<string, string> }>("/api/settings").then((d) => setSettings(d.settings)).catch(() => {});
    api<{ rows: LeaveTypeRow[] }>("/api/leave-types").then((d) => setTypes(d.rows)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!departments || !types) return <PageLoader />;

  const run = async (fn: () => Promise<unknown>, okMsg: string) => {
    setBusy(true);
    try {
      await fn();
      toast.push("success", okMsg);
      load();
      return true;
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Action failed");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const addDept = () => {
    if (!newDept.trim()) return toast.push("error", "Enter a department name");
    run(() => api("/api/departments", { method: "POST", body: JSON.stringify({ name: newDept }) }), `Department "${newDept.trim()}" created`).then((ok) => ok && setNewDept(""));
  };

  const setHod = (d: Department, hod_id: string) =>
    run(() => api(`/api/departments/${d.id}`, { method: "PUT", body: JSON.stringify({ hod_id: hod_id ? Number(hod_id) : null }) }),
      hod_id ? "HOD updated" : "HOD removed");

  const saveRename = () => {
    if (!renameDept) return;
    run(() => api(`/api/departments/${renameDept.id}`, { method: "PUT", body: JSON.stringify({ name: renameVal }) }), "Department renamed — employee records synced")
      .then((ok) => ok && setRenameDept(null));
  };

  const removeDept = () => {
    if (!delDept) return;
    run(() => api(`/api/departments/${delDept.id}`, { method: "DELETE" }), "Department deleted").then((ok) => ok && setDelDept(null));
  };

  const setPolicy = (key: string, value: string) => {
    setSettings((s) => ({ ...s, [key]: value }));
    run(() => api("/api/settings", { method: "PUT", body: JSON.stringify({ key, value }) }), "Approval workflow updated");
  };

  const openType = (t: LeaveTypeRow | "new") => {
    setTypeModal(t);
    setTypeForm(t === "new" ? { name: "", annual_quota: "0", paid: true, sync: true } : { name: t.name, annual_quota: String(t.annual_quota), paid: !!t.paid, sync: false });
  };

  const saveType = () => {
    const payload = { name: typeForm.name, annual_quota: Number(typeForm.annual_quota), paid: typeForm.paid, sync: typeForm.sync };
    if (typeModal === "new") {
      run(() => api("/api/leave-types", { method: "POST", body: JSON.stringify(payload) }), "Leave type created and allocated to everyone").then((ok) => ok && setTypeModal(null));
    } else if (typeModal) {
      run(() => api(`/api/leave-types/${typeModal.id}`, { method: "PUT", body: JSON.stringify(payload) }), "Leave type updated").then((ok) => ok && setTypeModal(null));
    }
  };

  const removeType = () => {
    if (!delType) return;
    run(() => api(`/api/leave-types/${delType.id}`, { method: "DELETE" }), "Leave type deleted").then((ok) => ok && setDelType(null));
  };

  return (
    <div className="fade-up">
      <PageHeader
        title="Org Settings"
        subtitle="Departments, approval workflow and leave policy — the rules everything else follows"
        icon={<Settings2 size={20} />}
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* Departments */}
        <Card title="Departments & HODs" icon={<Building2 size={16} />} className="xl:col-span-2"
          action={
            <span className="flex items-center gap-2">
              <Input placeholder="New department name…" value={newDept} onChange={(e) => setNewDept(e.target.value)} className="!w-56 !py-1.5 text-xs" />
              <Button size="sm" onClick={addDept} loading={busy}><Plus size={13} /> Add</Button>
            </span>
          }>
          <DataTable
            rows={departments}
            keyFor={(d) => d.id}
            columns={[
              { key: "name", header: "Department", render: (d) => <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{d.name}</span> },
              {
                key: "hod", header: "Head of Department (HOD)",
                render: (d) => (
                  <span className="flex items-center gap-2">
                    <Crown size={14} className={d.hod_id ? "text-amber-500" : "text-slate-300"} />
                    <Select value={d.hod_id || ""} onChange={(e) => setHod(d, e.target.value)} className="!w-56 !py-1.5 text-xs">
                      <option value="">— No HOD assigned —</option>
                      {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </Select>
                  </span>
                ),
              },
              { key: "count", header: "Headcount", render: (d) => <Badge tone="EMPLOYEE">{d.headcount} member{d.headcount === 1 ? "" : "s"}</Badge> },
              {
                key: "act", header: "", className: "text-right",
                render: (d) => (
                  <span className="flex justify-end gap-1">
                    <button onClick={() => { setRenameDept(d); setRenameVal(d.name); }} className="rounded-lg p-2 text-indigo-500 hover:bg-indigo-50 cursor-pointer" title="Rename"><Pencil size={14} /></button>
                    <button onClick={() => setDelDept(d)} className="rounded-lg p-2 text-rose-500 dark:text-rose-400 hover:bg-rose-50 disabled:opacity-30 cursor-pointer" title="Delete" disabled={(d.headcount || 0) > 0}><Trash2 size={14} /></button>
                  </span>
                ),
              },
            ]}
          />
          <p className="mt-3 rounded-xl bg-indigo-50/60 px-4 py-2.5 text-xs leading-relaxed text-indigo-700 dark:text-indigo-300">
            👑 An HOD gets an <b>Approvals</b> inbox scoped to their department when a workflow below is set to “Dept HOD + HR & Admin” — even if they&apos;re a regular employee.
          </p>
        </Card>

        {/* Approval workflow */}
        <Card title="Approval Workflow — who approves what" icon={<Workflow size={16} />}>
          <ul className="space-y-4">
            {MODULES.map((m) => (
              <li key={m.key} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 p-4">
                <div>
                  <p className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{m.label}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{m.desc}</p>
                </div>
                <Select value={settings[m.key] || "HR_ADMIN"} onChange={(e) => setPolicy(m.key, e.target.value)} className="!w-56">
                  {POLICY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </li>
            ))}
          </ul>
          <p className="mt-4 flex items-start gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-emerald-500" />
            Admin can always approve everything. Nobody can ever approve their own request, whatever the policy.
          </p>
        </Card>

        {/* Leave types */}
        <Card title="Leave Types & Quotas" icon={<Palmtree size={16} />}
          action={<Button size="sm" onClick={() => openType("new")}><Plus size={13} /> Add Type</Button>}>
          <DataTable
            rows={types}
            keyFor={(t) => t.id}
            columns={[
              { key: "name", header: "Leave Type", render: (t) => <span className="text-sm font-extrabold text-slate-800 dark:text-slate-100">{t.name}</span> },
              { key: "quota", header: "Annual Quota", render: (t) => <span className="font-bold">{t.annual_quota} days</span> },
              { key: "paid", header: "Pay", render: (t) => <Badge tone={t.paid ? "Approved" : "Cancelled"}>{t.paid ? "Paid" : "Unpaid"}</Badge> },
              { key: "usage", header: "Requests", render: (t) => <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">{t.request_count}</span> },
              {
                key: "act", header: "", className: "text-right",
                render: (t) => (
                  <span className="flex justify-end gap-1">
                    <button onClick={() => openType(t)} className="rounded-lg p-2 text-indigo-500 hover:bg-indigo-50 cursor-pointer"><Pencil size={14} /></button>
                    <button onClick={() => setDelType(t)} className="rounded-lg p-2 text-rose-500 dark:text-rose-400 hover:bg-rose-50 disabled:opacity-30 cursor-pointer" disabled={t.request_count > 0}><Trash2 size={14} /></button>
                  </span>
                ),
              },
            ]}
          />
        </Card>
      </div>

      {/* Rename dept */}
      <Modal open={!!renameDept} onClose={() => setRenameDept(null)} title={`Rename "${renameDept?.name}"`} subtitle="All employee records move to the new name automatically">
        <div className="space-y-4">
          <Field label="New Name" required><Input value={renameVal} onChange={(e) => setRenameVal(e.target.value)} /></Field>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setRenameDept(null)}>Cancel</Button>
            <Button onClick={saveRename} loading={busy}>Rename</Button>
          </div>
        </div>
      </Modal>

      {/* Leave type modal */}
      <Modal open={!!typeModal} onClose={() => setTypeModal(null)} title={typeModal === "new" ? "Add Leave Type" : `Edit "${(typeModal as LeaveTypeRow)?.name}"`}>
        <div className="space-y-4">
          <Field label="Name" required><Input placeholder="e.g. Paternity Leave" value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} /></Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Annual Quota (days)" required><Input type="number" min="0" value={typeForm.annual_quota} onChange={(e) => setTypeForm({ ...typeForm, annual_quota: e.target.value })} /></Field>
            <Field label="Pay Type">
              <Select value={typeForm.paid ? "1" : "0"} onChange={(e) => setTypeForm({ ...typeForm, paid: e.target.value === "1" })}>
                <option value="1">Paid</option>
                <option value="0">Unpaid (salary deducted)</option>
              </Select>
            </Field>
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-amber-50 dark:bg-amber-500/15 px-4 py-3 text-xs font-bold text-amber-700 dark:text-amber-300">
            <input type="checkbox" checked={typeForm.sync} onChange={(e) => setTypeForm({ ...typeForm, sync: e.target.checked })} className="size-4 accent-amber-600" />
            Apply this quota to every employee&apos;s balance now (used days are kept)
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setTypeModal(null)}>Cancel</Button>
            <Button onClick={saveType} loading={busy}>{typeModal === "new" ? "Create Type" : "Save Changes"}</Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={!!delDept} onClose={() => setDelDept(null)} onConfirm={removeDept} loading={busy} danger
        title={`Delete "${delDept?.name}"?`} message="This removes the department. Only possible when no employees are assigned to it." confirmLabel="Delete"
      />
      <ConfirmModal
        open={!!delType} onClose={() => setDelType(null)} onConfirm={removeType} loading={busy} danger
        title={`Delete "${delType?.name}"?`} message="This removes the leave type and everyone's balance for it. Only possible when no requests ever used it." confirmLabel="Delete"
      />
    </div>
  );
}
