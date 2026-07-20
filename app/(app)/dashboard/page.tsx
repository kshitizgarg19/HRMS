"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  CalendarCheck2, Palmtree, Hourglass, Wallet, Users2, ClipboardCheck, Banknote, LogIn, LogOut as LogOutIcon,
  Cake, Award, PartyPopper, Megaphone, Activity, UserPlus, ListTodo, Receipt, ArrowRight, Sun,
} from "lucide-react";
import { api } from "@/lib/api";
import { useData } from "@/lib/swr";
import { fmtINR, fmtDate, fmtTime, MONTHS } from "@/lib/format";
import { Card, StatCard, Badge, Button, Avatar, EmptyState, PageLoader, useToast, cn } from "@/components/ui";
import { LineChart, Donut, HBarList, Sparkline } from "@/components/charts";
import type { SessionUser } from "@/lib/types";

interface Person { id: number; name: string; department: string | null; designation?: string | null; avatar_color: string | null; in_days: number | null; date: string | null; years?: number; leave_type?: string; join_date?: string }

interface DashData {
  today: string;
  me: SessionUser;
  checkin: { check_in: string | null; check_out: string | null; hours: number | null; status: string; mode: string | null } | null;
  announcements: { id: number; title: string; body: string; pinned: number; created_at: string; author_name: string }[];
  upcomingHolidays: { id: number; name: string; date: string; type: string }[];
  birthdays: Person[];
  anniversaries: Person[];
  onLeaveToday: Person[];
  mine: {
    attendancePct: number; presentDays: number; workingSoFar: number; avgHours: number;
    leaveBalance: number; myPending: number; openTasks: number;
    latestSlip: { id: number; month: number; year: number; net: number } | null;
    weekHours: { date: string; hours: number }[];
  };
  org: null | {
    headcount: number; onLeaveCount: number;
    pending: { leaves: number; timesheets: number; reimbursements: number; total: number };
    payroll: { generated: boolean; count: number; netTotal: number; estimated: number; month: number; year: number };
    trend: { date: string; pct: number }[];
    deptHeadcount: { label: string; value: number }[];
    leaveDist: { label: string; value: number }[];
    recentActivity: { kind: string; id: number; name: string; avatar_color: string | null; detail: string; status: string; created_at: string }[];
    newJoiners: { id: number; name: string; designation: string | null; department: string | null; join_date: string; avatar_color: string | null }[];
  };
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good Morning" : h < 17 ? "Good Afternoon" : "Good Evening";
}

export default function DashboardPage() {
  const { data, reload } = useData<DashData>("/api/dashboard");
  const [acting, setActing] = useState(false);
  const toast = useToast();

  if (!data) return <PageLoader />;
  const { me, mine, org, checkin } = data;
  const isMgmt = !!org;

  const punch = async (action: "in" | "out") => {
    setActing(true);
    try {
      await api("/api/attendance", { method: "POST", body: JSON.stringify({ action }) });
      toast.push("success", action === "in" ? "Checked in — have a great day!" : "Checked out. See you tomorrow!");
      await reload();
    } catch (e) {
      toast.push("error", e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setActing(false);
    }
  };

  return (
    <div className="fade-up space-y-6">
      {/* ---------- Hero ---------- */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-950 via-indigo-900 to-violet-900 p-6 text-white shadow-xl shadow-indigo-200 sm:p-8">
        <div className="aurora" />
        <div className="float-a absolute -right-20 -top-24 size-72 rounded-full bg-violet-500/25 blur-3xl" />
        <div className="float-b absolute -bottom-28 left-1/3 size-72 rounded-full bg-fuchsia-500/15 blur-3xl" />
        <div className="float-y absolute right-24 top-8 hidden size-28 rounded-full border border-white/10 md:block" />
        <div className="float-b absolute right-40 top-20 hidden size-14 rounded-full border border-white/10 md:block" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div>
            <span className="mb-2.5 inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.16em] text-indigo-100 ring-1 ring-white/20">
              {me.role === "ADMIN" ? "🛡️ Admin Console" : me.role === "HR" ? "💼 HR Workspace" : "👤 Employee Dashboard"}
            </span>
            <p className="hero-shimmer text-2xl font-extrabold tracking-tight sm:text-3xl">
              {greeting()}, {me.name.split(" ")[0]} 👋
            </p>
            <p className="mt-1.5 text-sm text-indigo-200">
              {isMgmt ? "Here's what's happening across your organization today." : "Here's your day at a glance."}
            </p>
            <div className="stagger-children mt-4 flex flex-wrap gap-2">
              <Link href="/leave"><span className="chip-bounce inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-bold ring-1 ring-white/20 hover:bg-white/25"><Palmtree size={13}/> Apply Leave</span></Link>
              <Link href="/timesheet"><span className="chip-bounce inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-bold ring-1 ring-white/20 hover:bg-white/25"><ListTodo size={13}/> Log Timesheet</span></Link>
              <Link href="/reimbursement"><span className="chip-bounce inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-bold ring-1 ring-white/20 hover:bg-white/25"><Receipt size={13}/> New Claim</span></Link>
              {isMgmt && (
                <Link href="/admin/approvals"><span className="chip-bounce pulse-glow inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 px-3.5 py-1.5 text-xs font-bold text-amber-200 ring-1 ring-amber-300/30 hover:bg-amber-400/35"><ClipboardCheck size={13}/> {org.pending.total} approvals waiting</span></Link>
              )}
            </div>
          </div>

          {/* Check-in widget */}
          <div className="rounded-2xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur">
            <p className="flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-[0.14em] text-indigo-200">
              <Sun size={13} /> {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
            </p>
            <div className="mt-3 flex items-center gap-3">
              {checkin?.status === "Leave" ? (
                <Badge tone="Leave">On approved leave today</Badge>
              ) : (
                <>
                  <div className="text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">In</p>
                    <p className="text-base font-extrabold">{fmtTime(checkin?.check_in)}</p>
                  </div>
                  <div className="h-8 w-px bg-white/20" />
                  <div className="text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-300">Out</p>
                    <p className="text-base font-extrabold">{fmtTime(checkin?.check_out)}</p>
                  </div>
                  <div className="ml-2">
                    {!checkin?.check_in ? (
                      <button onClick={() => punch("in")} disabled={acting} className="inline-flex items-center gap-1.5 rounded-xl bg-white dark:bg-slate-900 px-4 py-2.5 text-xs font-extrabold text-indigo-700 dark:text-indigo-300 shadow transition hover:bg-indigo-50 active:scale-95 disabled:opacity-60 cursor-pointer">
                        <LogIn size={14} /> Check In
                      </button>
                    ) : !checkin?.check_out ? (
                      <button onClick={() => punch("out")} disabled={acting} className="inline-flex items-center gap-1.5 rounded-xl bg-rose-500 px-4 py-2.5 text-xs font-extrabold text-white shadow transition hover:bg-rose-600 active:scale-95 disabled:opacity-60 cursor-pointer">
                        <LogOutIcon size={14} /> Check Out
                      </button>
                    ) : (
                      <Badge tone="Approved">{checkin.hours}h day complete ✓</Badge>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ---------- Stat cards ---------- */}
      <div className="stagger-children grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isMgmt ? (
          <>
            <StatCard label="Total Employees" value={org.headcount} icon={<Users2 size={20} />} accent="indigo" sub="Active workforce" />
            <StatCard label="On Leave Today" value={org.onLeaveCount} icon={<Palmtree size={20} />} accent="emerald" sub={`${data.onLeaveToday.length ? data.onLeaveToday.map((p) => p.name.split(" ")[0]).slice(0, 3).join(", ") : "Everyone's in"}`} />
            <StatCard label="Pending Approvals" value={org.pending.total} icon={<Hourglass size={20} />} accent="rose" sub={`${org.pending.leaves} leave · ${org.pending.timesheets} timesheet · ${org.pending.reimbursements} claims`} />
            <StatCard
              label={`Payroll — ${MONTHS[org.payroll.month - 1].slice(0, 3)} ${org.payroll.year}`}
              value={org.payroll.generated ? fmtINR(org.payroll.netTotal) : fmtINR(org.payroll.estimated)}
              icon={<Banknote size={20} />}
              accent="violet"
              sub={org.payroll.generated ? `${org.payroll.count} payslips generated ✓` : "Estimated — not run yet"}
            />
          </>
        ) : (
          <>
            <StatCard label="Attendance This Month" value={`${mine.attendancePct}%`} icon={<CalendarCheck2 size={20} />} accent="indigo" sub={`${mine.presentDays}/${mine.workingSoFar} working days`} />
            <StatCard label="Leave Balance" value={`${mine.leaveBalance} days`} icon={<Palmtree size={20} />} accent="emerald" sub="Across paid leave types" />
            <StatCard label="My Pending Requests" value={mine.myPending} icon={<Hourglass size={20} />} accent="amber" sub="Leave · claims · timesheets" />
            <StatCard
              label="Last Net Pay"
              value={mine.latestSlip ? fmtINR(mine.latestSlip.net) : "—"}
              icon={<Wallet size={20} />}
              accent="violet"
              sub={mine.latestSlip ? `${MONTHS[mine.latestSlip.month - 1]} ${mine.latestSlip.year}` : "No payslips yet"}
            />
          </>
        )}
      </div>

      {/* ---------- Charts (management) / My week (employee) ---------- */}
      {isMgmt ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Card title="Attendance Trend" icon={<Activity size={16} />} className="xl:col-span-7"
            action={<span className="text-xs font-semibold text-slate-400 dark:text-slate-500">last 10 working days</span>}>
            <LineChart data={org.trend.map((t) => ({ label: t.date.slice(8) + "/" + t.date.slice(5, 7), value: t.pct }))} />
          </Card>
          <Card title="Leave Mix (YTD)" icon={<Palmtree size={16} />} className="xl:col-span-5">
            {org.leaveDist.length ? (
              <Donut data={org.leaveDist.map((l) => ({ label: l.label, value: Math.round(l.value * 10) / 10 }))} />
            ) : (
              <EmptyState title="No approved leaves yet this year" />
            )}
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
          <Card title="My Week" icon={<Activity size={16} />} className="xl:col-span-7"
            action={<span className="text-xs font-semibold text-slate-400 dark:text-slate-500">avg {mine.avgHours}h/day this month</span>}>
            <Sparkline data={mine.weekHours.map((w) => w.hours)} height={64} />
            <div className="mt-2 flex justify-between text-[10px] font-bold text-slate-400 dark:text-slate-500">
              {mine.weekHours.map((w) => (
                <span key={w.date}>{new Date(w.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "narrow" })}</span>
              ))}
            </div>
          </Card>
          <Card title="Open Tasks" icon={<ListTodo size={16} />} className="xl:col-span-5"
            action={<Link href="/tasks" className="flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-300 hover:text-indigo-700">View all <ArrowRight size={12} /></Link>}>
            <p className="text-4xl font-extrabold tracking-tight text-slate-900 dark:text-slate-100">{mine.openTasks}</p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">task{mine.openTasks === 1 ? "" : "s"} assigned to you {mine.openTasks ? "— go crush them 💪" : "— all clear! 🎉"}</p>
          </Card>
        </div>
      )}

      {/* ---------- Widgets ---------- */}
      <div className="stagger-children grid grid-cols-1 gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card title="Upcoming Birthdays" icon={<Cake size={16} />}>
          {data.birthdays.length === 0 && <EmptyState title="No birthdays in the next month" />}
          <ul className="space-y-3">
            {data.birthdays.map((p) => (
              <li key={p.id} className="flex items-center gap-3">
                <Avatar name={p.name} color={p.avatar_color} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{p.name}</p>
                  <p className="truncate text-xs text-slate-400 dark:text-slate-500">{p.department || "—"}</p>
                </div>
                <Badge tone={p.in_days === 0 ? "Approved" : "EMPLOYEE"}>
                  {p.in_days === 0 ? "🎂 Today!" : `🎂 ${fmtDate(p.date).slice(0, 6)}`}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Work Anniversaries" icon={<Award size={16} />}>
          {data.anniversaries.length === 0 && <EmptyState title="No anniversaries coming up" />}
          <ul className="space-y-3">
            {data.anniversaries.map((p) => (
              <li key={p.id} className="flex items-center gap-3">
                <Avatar name={p.name} color={p.avatar_color} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{p.name}</p>
                  <p className="truncate text-xs text-slate-400 dark:text-slate-500">{p.years} year{p.years === 1 ? "" : "s"} · {p.department || "—"}</p>
                </div>
                <Badge tone={p.in_days === 0 ? "Approved" : "ADMIN"}>
                  {p.in_days === 0 ? "🎉 Today!" : `🎉 ${fmtDate(p.date).slice(0, 6)}`}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Upcoming Holidays" icon={<PartyPopper size={16} />}
          action={<Link href="/holidays" className="flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-300 hover:text-indigo-700">Calendar <ArrowRight size={12} /></Link>}>
          {data.upcomingHolidays.length === 0 && <EmptyState title="No holidays coming up" />}
          <ul className="space-y-3">
            {data.upcomingHolidays.map((h) => (
              <li key={h.id} className="flex items-center gap-3 rounded-xl border border-slate-100 dark:border-slate-800 bg-gradient-to-r from-violet-50/60 to-fuchsia-50/40 dark:from-violet-500/10 dark:to-fuchsia-500/5 p-3">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-white dark:bg-slate-900 text-center shadow-sm ring-1 ring-violet-100 dark:ring-violet-500/20">
                  <span>
                    <span className="block text-base font-extrabold leading-none text-violet-700 dark:text-violet-300">{h.date.slice(8)}</span>
                    <span className="block text-[9px] font-bold uppercase text-slate-400 dark:text-slate-500">{MONTHS[Number(h.date.slice(5, 7)) - 1].slice(0, 3)}</span>
                  </span>
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{h.name}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{new Date(h.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long" })}</p>
                </div>
                <Badge tone={h.type}>{h.type}</Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Who's Out Today" icon={<Palmtree size={16} />}>
          {data.onLeaveToday.length === 0 && <EmptyState title="Full house — nobody is on leave 🙌" />}
          <ul className="space-y-3">
            {data.onLeaveToday.map((p) => (
              <li key={p.id} className="flex items-center gap-3">
                <Avatar name={p.name} color={p.avatar_color} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{p.name}</p>
                  <p className="truncate text-xs text-slate-400 dark:text-slate-500">{p.leave_type}</p>
                </div>
                <Badge tone="Leave">till {fmtDate((p as Person & { to_date?: string }).to_date || null).slice(0, 6)}</Badge>
              </li>
            ))}
          </ul>
        </Card>

        {isMgmt ? (
          <>
            <Card title="Recent Activity" icon={<Activity size={16} />}>
              <ul className="space-y-3.5">
                {org.recentActivity.map((a, i) => (
                  <li key={`${a.kind}-${a.id}-${i}`} className="flex items-start gap-3">
                    <Avatar name={a.name} color={a.avatar_color} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] leading-snug text-slate-700 dark:text-slate-200">
                        <span className="font-bold text-slate-900 dark:text-slate-100">{a.name}</span>{" "}
                        {a.kind === "leave" ? "requested" : a.kind === "reimbursement" ? "claimed" : "logged"}{" "}
                        <span className="font-semibold text-slate-600 dark:text-slate-300">{a.detail}</span>
                      </p>
                    </div>
                    <Badge tone={a.status}>{a.status}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="New Joiners (90 days)" icon={<UserPlus size={16} />}>
              {org.newJoiners.length === 0 && <EmptyState title="No recent joiners" />}
              <ul className="space-y-3">
                {org.newJoiners.map((p) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <Avatar name={p.name} color={p.avatar_color} size={36} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{p.name}</p>
                      <p className="truncate text-xs text-slate-400 dark:text-slate-500">{p.designation || "—"} · {p.department || "—"}</p>
                    </div>
                    <span className="text-xs font-semibold text-slate-400 dark:text-slate-500">{fmtDate(p.join_date)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </>
        ) : (
          <Card title="Announcements" icon={<Megaphone size={16} />} className="lg:col-span-2 xl:col-span-2"
            action={<Link href="/announcements" className="flex items-center gap-1 text-xs font-bold text-indigo-600 dark:text-indigo-300 hover:text-indigo-700">All <ArrowRight size={12} /></Link>}>
            <ul className="space-y-4">
              {data.announcements.map((a) => (
                <li key={a.id} className={cn("rounded-xl border p-4", a.pinned ? "border-amber-200 bg-amber-50/50 dark:border-amber-500/30 dark:bg-amber-500/10" : "border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40")}>
                  <p className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
                    {a.pinned ? "📌" : "📣"} {a.title}
                  </p>
                  <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">{a.body}</p>
                  <p className="mt-2 text-[11px] font-semibold text-slate-400 dark:text-slate-500">{a.author_name}</p>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {isMgmt && (
          <Card title="Team by Department" icon={<Users2 size={16} />}>
            <HBarList data={org.deptHeadcount as { label: string; value: number }[]} />
          </Card>
        )}
      </div>
    </div>
  );
}
