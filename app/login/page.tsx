"use client";

import { useState } from "react";
import { Sparkles, Eye, EyeOff, ShieldCheck, UserRound, Briefcase, Loader2, ArrowRight } from "lucide-react";
import { api } from "@/lib/api";

const DEMO = [
  { label: "Admin", icon: <ShieldCheck size={14} />, id: "kshitiz@nexushr.in", pwd: "Admin@123", desc: "Full control" },
  { label: "HR", icon: <Briefcase size={14} />, id: "priya@nexushr.in", pwd: "Hr@123", desc: "People ops" },
  { label: "Employee", icon: <UserRound size={14} />, id: "ranjeet@nexushr.in", pwd: "Emp@123", desc: "Self service" },
];

const FEATURES = [
  "Attendance, timesheets & leave in one place",
  "One-click payroll runs with printable payslips",
  "Approvals inbox for HR and Admin",
  "Live org analytics on a beautiful dashboard",
];

export default function LoginPage() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e?: React.FormEvent, id = identifier, pwd = password) => {
    e?.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api("/api/auth/login", { method: "POST", body: JSON.stringify({ identifier: id, password: pwd }) });
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Brand panel */}
      <div className="relative hidden w-[46%] overflow-hidden bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-900 lg:block">
        <div className="aurora" />
        <div className="float-a absolute -left-24 -top-24 size-96 rounded-full bg-violet-600/25 blur-3xl" />
        <div className="float-b absolute -bottom-32 -right-16 size-[28rem] rounded-full bg-fuchsia-600/25 blur-3xl" />
        <div className="float-y absolute right-10 top-24 size-40 rounded-full border border-white/10" />
        <div className="float-b absolute right-24 top-40 size-64 rounded-full border border-white/5" />

        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-2xl bg-white/10 text-white ring-1 ring-white/20 backdrop-blur">
              <Sparkles size={22} />
            </span>
            <span>
              <span className="block text-xl font-extrabold tracking-tight text-white">NexusHR</span>
              <span className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-300">People Platform</span>
            </span>
          </div>

          <div>
            <h1 className="hero-shimmer max-w-md text-4xl font-extrabold leading-tight tracking-tight">
              Everything your team needs, in one place.
            </h1>
            <p className="fade-up mt-4 max-w-md text-[15px] leading-relaxed text-indigo-200" style={{ animationDelay: "150ms" }}>
              Attendance, leave, payroll, tasks and people analytics — a complete HRMS built for modern teams.
            </p>
            <ul className="stagger-children mt-8 space-y-3">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm font-medium text-indigo-100 transition-transform duration-300 hover:translate-x-1.5">
                  <span className="grid size-5 place-items-center rounded-full bg-emerald-400/20 text-emerald-300 ring-1 ring-emerald-400/30">✓</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs font-medium text-indigo-300/70">© {new Date().getFullYear()} NexusHR · Crafted for teams that move fast</p>
        </div>
      </div>

      {/* Form panel */}
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white">
              <Sparkles size={20} />
            </span>
            <span className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">
              Nexus<span className="bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">HR</span>
            </span>
          </div>

          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">Welcome back 👋</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Sign in with your work email or employee ID.</p>

          <form onSubmit={submit} className="mt-8 space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Email or Employee ID</label>
              <input
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="you@nexushr.in or EMP001"
                autoFocus
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Password</label>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 pr-11 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500 transition hover:text-slate-600 cursor-pointer"
                >
                  {show ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="fade-up rounded-xl border border-rose-200 bg-rose-50 dark:bg-rose-500/15 px-4 py-2.5 text-[13px] font-semibold text-rose-600 dark:text-rose-400">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="group/btn relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-indigo-200 transition-all duration-300 hover:-translate-y-0.5 hover:from-indigo-700 hover:to-violet-700 hover:shadow-xl hover:shadow-indigo-300/60 active:translate-y-0 active:scale-[.98] disabled:opacity-60 cursor-pointer"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} className="transition-transform duration-300 group-hover/btn:translate-x-1" />}
              {loading ? "Signing in…" : "Sign In"}
              <span className="btn-shine" aria-hidden />
            </button>
          </form>

          <div className="mt-8">
            <p className="mb-3 text-center text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">Demo accounts — one-click sign in</p>
            <div className="stagger-children grid grid-cols-3 gap-2">
              {DEMO.map((d) => (
                <button
                  key={d.label}
                  onClick={() => { setIdentifier(d.id); setPassword(d.pwd); submit(undefined, d.id, d.pwd); }}
                  className="group chip-bounce rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 text-left hover:border-indigo-300 hover:shadow-lg hover:shadow-indigo-100 cursor-pointer"
                >
                  <span className="flex items-center gap-1.5 text-[13px] font-extrabold text-slate-800 dark:text-slate-100 transition-colors group-hover:text-indigo-700">
                    {d.icon} {d.label}
                  </span>
                  <span className="mt-0.5 block text-[11px] font-medium text-slate-400 dark:text-slate-500">{d.desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
