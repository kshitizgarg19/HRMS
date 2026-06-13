"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { UserCircle2, Briefcase, Landmark, KeyRound, Save, Mail, Phone, MapPin, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { Avatar, Badge, Button, Card, Field, Input, PageHeader, PageLoader, ProgressBar, Select, Tabs, useToast } from "@/components/ui";
import type { Employee } from "@/lib/types";

type Profile = Employee & { manager_name?: string | null };

function ProfileInner() {
  const sp = useSearchParams();
  const [tab, setTab] = useState(sp.get("tab") === "security" ? "security" : "personal");
  const [p, setP] = useState<Profile | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [pwd, setPwd] = useState({ current: "", next: "", confirm: "" });
  const toast = useToast();

  const load = () =>
    api<{ profile: Profile }>("/api/profile").then((d) => {
      setP(d.profile);
      const f: Record<string, string> = {};
      for (const k of ["phone", "alt_phone", "address", "city", "state", "pincode", "emergency_name", "emergency_phone", "emergency_relation", "dob", "gender", "blood_group", "marital_status", "bank_name", "account_no", "ifsc", "pan", "uan"]) {
        f[k] = (d.profile[k as keyof Profile] as string) || "";
      }
      setForm(f);
    });
  useEffect(() => { load(); }, []);

  const completeness = useMemo(() => {
    if (!p) return 0;
    const fields = ["phone", "address", "city", "state", "pincode", "dob", "gender", "blood_group", "marital_status", "emergency_name", "emergency_phone", "bank_name", "account_no", "ifsc", "pan", "uan"];
    const filled = fields.filter((f) => form[f] && form[f].trim()).length;
    return Math.round((filled / fields.length) * 100);
  }, [p, form]);

  if (!p) return <PageLoader />;

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    setSaving(true);
    try {
      await api("/api/profile", { method: "PUT", body: JSON.stringify(form) });
      toast.push("success", "Profile updated");
      await load();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (!pwd.current || !pwd.next) return toast.push("error", "Fill in all password fields");
    if (pwd.next !== pwd.confirm) return toast.push("error", "New passwords don't match");
    setSaving(true);
    try {
      await api("/api/auth/change-password", { method: "POST", body: JSON.stringify({ current: pwd.current, next: pwd.next }) });
      toast.push("success", "Password changed successfully");
      setPwd({ current: "", next: "", confirm: "" });
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Failed to change password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fade-up">
      <PageHeader title="My Profile" subtitle="Your personal, work and financial information" icon={<UserCircle2 size={20} />} />

      {/* Hero card */}
      <div className="mb-6 overflow-hidden rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="h-24 bg-gradient-to-r from-indigo-600 via-violet-600 to-fuchsia-500" />
        <div className="flex flex-wrap items-end justify-between gap-4 px-6 pb-5">
          <div className="flex items-end gap-4">
            <span className="-mt-10 rounded-full ring-4 ring-white"><Avatar name={p.name} color={p.avatar_color} size={84} /></span>
            <div className="pb-1">
              <p className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">{p.name}</p>
              <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{p.designation || "—"} · {p.department || "—"}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <Badge tone={p.role}>{p.role}</Badge>
                <Badge tone={p.status}>{p.status}</Badge>
                <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">{p.emp_code} · joined {fmtDate(p.join_date)}</span>
              </div>
            </div>
          </div>
          <div className="w-full max-w-[220px] pb-1">
            <div className="mb-1 flex justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
              <span>Profile completeness</span><span>{completeness}%</span>
            </div>
            <ProgressBar value={completeness} color={completeness > 80 ? "bg-emerald-500" : completeness > 50 ? "bg-amber-500" : "bg-rose-500"} />
          </div>
        </div>
      </div>

      <div className="mb-5">
        <Tabs
          tabs={[
            { key: "personal", label: "Personal" },
            { key: "work", label: "Work" },
            { key: "financial", label: "Bank & Tax" },
            { key: "security", label: "Security" },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {tab === "personal" && (
        <Card title="Personal Details" icon={<UserCircle2 size={16} />}
          action={<Button size="sm" onClick={save} loading={saving}><Save size={14} /> Save Changes</Button>}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Date of Birth"><Input type="date" value={form.dob} onChange={set("dob")} /></Field>
            <Field label="Gender">
              <Select value={form.gender} onChange={set("gender")}>
                <option value="">Select…</option><option>Male</option><option>Female</option><option>Other</option>
              </Select>
            </Field>
            <Field label="Blood Group">
              <Select value={form.blood_group} onChange={set("blood_group")}>
                <option value="">Select…</option>{["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((b) => <option key={b}>{b}</option>)}
              </Select>
            </Field>
            <Field label="Marital Status">
              <Select value={form.marital_status} onChange={set("marital_status")}>
                <option value="">Select…</option><option>Single</option><option>Married</option>
              </Select>
            </Field>
            <Field label="Phone"><Input value={form.phone} onChange={set("phone")} placeholder="+91 …" /></Field>
            <Field label="Alternate Phone"><Input value={form.alt_phone} onChange={set("alt_phone")} /></Field>
            <Field label="Address" className="sm:col-span-2"><Input value={form.address} onChange={set("address")} /></Field>
            <Field label="City"><Input value={form.city} onChange={set("city")} /></Field>
            <Field label="State"><Input value={form.state} onChange={set("state")} /></Field>
            <Field label="PIN Code"><Input value={form.pincode} onChange={set("pincode")} /></Field>
            <Field label="Emergency Contact Name"><Input value={form.emergency_name} onChange={set("emergency_name")} /></Field>
            <Field label="Emergency Contact Phone"><Input value={form.emergency_phone} onChange={set("emergency_phone")} /></Field>
            <Field label="Relation">
              <Select value={form.emergency_relation} onChange={set("emergency_relation")}>
                <option value="">Select…</option><option>Father</option><option>Mother</option><option>Spouse</option><option>Sibling</option><option>Friend</option>
              </Select>
            </Field>
          </div>
        </Card>
      )}

      {tab === "work" && (
        <Card title="Work Details" icon={<Briefcase size={16} />}
          action={<span className="text-xs font-semibold text-slate-400 dark:text-slate-500">Managed by Admin</span>}>
          <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Employee ID", p.emp_code],
              ["Email", p.email, <Mail key="m" size={13} />],
              ["Department", p.department],
              ["Designation", p.designation],
              ["Reporting Manager", p.manager_name || "—"],
              ["Employment Type", p.employment_type],
              ["Work Location", p.work_location, <MapPin key="l" size={13} />],
              ["Date of Joining", fmtDate(p.join_date)],
              ["Status", p.status],
            ].map(([label, value, icon], i) => (
              <div key={i}>
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">{label as string}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-slate-100">{icon}{(value as string) || "—"}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === "financial" && (
        <Card title="Bank & Tax Details" icon={<Landmark size={16} />}
          action={<Button size="sm" onClick={save} loading={saving}><Save size={14} /> Save Changes</Button>}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Bank Name"><Input value={form.bank_name} onChange={set("bank_name")} /></Field>
            <Field label="Account Number"><Input value={form.account_no} onChange={set("account_no")} /></Field>
            <Field label="IFSC Code"><Input value={form.ifsc} onChange={set("ifsc")} /></Field>
            <Field label="PAN"><Input value={form.pan} onChange={set("pan")} placeholder="ABCDE1234F" /></Field>
            <Field label="UAN (PF)"><Input value={form.uan} onChange={set("uan")} /></Field>
          </div>
          <p className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 px-4 py-3 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
            🔒 These details are used for salary credit and tax filings. They are visible only to you, HR and Admin.
          </p>
        </Card>
      )}

      {tab === "security" && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card title="Change Password" icon={<KeyRound size={16} />}>
            <div className="space-y-4">
              <Field label="Current Password" required><Input type="password" value={pwd.current} onChange={(e) => setPwd({ ...pwd, current: e.target.value })} /></Field>
              <Field label="New Password" required hint="At least 6 characters"><Input type="password" value={pwd.next} onChange={(e) => setPwd({ ...pwd, next: e.target.value })} /></Field>
              <Field label="Confirm New Password" required><Input type="password" value={pwd.confirm} onChange={(e) => setPwd({ ...pwd, confirm: e.target.value })} /></Field>
              <Button onClick={changePassword} loading={saving}><ShieldCheck size={15} /> Update Password</Button>
            </div>
          </Card>
          <Card title="Account" icon={<ShieldCheck size={16} />}>
            <ul className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <li className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-3"><span className="font-semibold text-slate-400 dark:text-slate-500">Sign-in email</span><span className="font-bold">{p.email}</span></li>
              <li className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-3"><span className="font-semibold text-slate-400 dark:text-slate-500">Employee ID</span><span className="font-bold">{p.emp_code}</span></li>
              <li className="flex justify-between border-b border-slate-100 dark:border-slate-800 pb-3"><span className="font-semibold text-slate-400 dark:text-slate-500">Role</span><Badge tone={p.role}>{p.role}</Badge></li>
              <li className="flex justify-between"><span className="font-semibold text-slate-400 dark:text-slate-500">Phone</span><span className="flex items-center gap-1.5 font-bold"><Phone size={13} /> {p.phone || "—"}</span></li>
            </ul>
            <p className="mt-4 rounded-xl bg-indigo-50 dark:bg-indigo-500/15 px-4 py-3 text-xs leading-relaxed text-indigo-700 dark:text-indigo-300">
              Tip: use a password manager and never share your credentials. Sessions expire after 7 days.
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}

export default function ProfilePage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <ProfileInner />
    </Suspense>
  );
}
