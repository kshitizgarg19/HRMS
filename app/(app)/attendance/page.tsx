"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarCheck2, ChevronLeft, ChevronRight, Clock4, Home, Building2, Users2 } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, fmtTime, todayStr, MONTHS } from "@/lib/format";
import { Badge, Card, DataTable, PageHeader, PageLoader, PersonCell, Tabs, cn } from "@/components/ui";
import { useMe } from "@/components/shell";
import type { AttendanceRecord, Holiday } from "@/lib/types";

const CELL: Record<string, string> = {
  Present: "bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/25",
  "Half Day": "bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/25",
  Leave: "bg-sky-100 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/25",
  Absent: "bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/25",
  Holiday: "bg-violet-100 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/25",
  Weekend: "bg-slate-50 text-slate-300 ring-slate-100 dark:bg-slate-800/40 dark:text-slate-600 dark:ring-slate-800",
  Future: "bg-white text-slate-300 ring-slate-100 dark:bg-slate-900 dark:text-slate-600 dark:ring-slate-800",
  None: "bg-slate-100 text-slate-400 ring-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:ring-slate-700",
};

function MyAttendance() {
  const [month, setMonth] = useState(todayStr().slice(0, 7));
  const [data, setData] = useState<{ rows: AttendanceRecord[]; holidays: Holiday[] } | null>(null);

  useEffect(() => {
    api<{ rows: AttendanceRecord[]; holidays: Holiday[] }>(`/api/attendance?month=${month}`).then(setData).catch(() => {});
  }, [month]);

  const shift = (n: number) => {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  const { cells, summary } = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    const first = new Date(y, m - 1, 1);
    const daysInMonth = new Date(y, m, 0).getDate();
    const today = todayStr();
    const byDate = new Map((data?.rows || []).map((r) => [r.date, r]));
    const holidaysBy = new Map((data?.holidays || []).map((h) => [h.date, h]));
    const cells: { date: string; day: number; kind: string; title: string }[] = [];
    for (let i = 0; i < first.getDay(); i++) cells.push({ date: `pad-${i}`, day: 0, kind: "pad", title: "" });
    const summary = { present: 0, leave: 0, absent: 0, half: 0, hours: 0, hoursDays: 0, wfh: 0 };
    for (let d = 1; d <= daysInMonth; d++) {
      const date = `${month}-${String(d).padStart(2, "0")}`;
      const dow = new Date(y, m - 1, d).getDay();
      const rec = byDate.get(date);
      const hol = holidaysBy.get(date);
      let kind = "None";
      let title = "No record";
      if (rec) {
        kind = rec.status;
        title = rec.status + (rec.check_in ? ` · ${fmtTime(rec.check_in)} → ${fmtTime(rec.check_out)}` : "");
        if (rec.status === "Present") summary.present++;
        if (rec.status === "Half Day") { summary.half++; summary.present++; }
        if (rec.status === "Leave") summary.leave++;
        if (rec.status === "Absent") summary.absent++;
        if (rec.hours) { summary.hours += rec.hours; summary.hoursDays++; }
        if (rec.mode === "WFH") summary.wfh++;
      } else if (hol) {
        kind = "Holiday";
        title = hol.name;
      } else if (dow === 0 || dow === 6) {
        kind = "Weekend";
        title = "Weekend";
      } else if (date > today) {
        kind = "Future";
        title = "";
      }
      cells.push({ date, day: d, kind, title });
    }
    return { cells, summary };
  }, [month, data]);

  if (!data) return <PageLoader />;

  const stats = [
    { label: "Present", value: summary.present, cls: "text-emerald-600 dark:text-emerald-300" },
    { label: "On Leave", value: summary.leave, cls: "text-sky-600" },
    { label: "Absent", value: summary.absent, cls: "text-rose-600 dark:text-rose-400" },
    { label: "Half Days", value: summary.half, cls: "text-amber-600 dark:text-amber-300" },
    { label: "Avg Hours", value: summary.hoursDays ? (summary.hours / summary.hoursDays).toFixed(1) + "h" : "—", cls: "text-indigo-600 dark:text-indigo-300" },
    { label: "WFH Days", value: summary.wfh, cls: "text-violet-600" },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <Card className="xl:col-span-7" title={`${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`} icon={<CalendarCheck2 size={16} />}
        action={
          <span className="flex items-center gap-1">
            <button onClick={() => shift(-1)} className="rounded-lg p-1.5 text-slate-400 dark:text-slate-500 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"><ChevronLeft size={16} /></button>
            <button onClick={() => shift(1)} className="rounded-lg p-1.5 text-slate-400 dark:text-slate-500 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200 cursor-pointer"><ChevronRight size={16} /></button>
          </span>
        }>
        <div className="grid grid-cols-7 gap-1.5">
          {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
            <span key={i} className="py-1 text-center text-[10px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500">{d}</span>
          ))}
          {cells.map((c) =>
            c.kind === "pad" ? (
              <span key={c.date} />
            ) : (
              <span
                key={c.date}
                title={`${fmtDate(c.date)} — ${c.title}`}
                className={cn(
                  "grid aspect-square place-items-center rounded-xl text-[13px] font-bold ring-1 transition hover:scale-105",
                  CELL[c.kind] || CELL.None,
                  c.date === todayStr() && "outline outline-2 outline-indigo-500"
                )}
              >
                {c.day}
              </span>
            )
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-3 border-t border-slate-100 dark:border-slate-800 pt-4">
          {(["Present", "Half Day", "Leave", "Absent", "Holiday", "Weekend"] as const).map((k) => (
            <span key={k} className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <span className={cn("size-3 rounded ring-1", CELL[k])} /> {k}
            </span>
          ))}
        </div>
      </Card>

      <div className="space-y-4 xl:col-span-5">
        <div className="grid grid-cols-3 gap-3">
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-center shadow-sm">
              <p className={cn("text-2xl font-extrabold tracking-tight", s.cls)}>{s.value}</p>
              <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">{s.label}</p>
            </div>
          ))}
        </div>
        <Card title="Recent Punches" icon={<Clock4 size={16} />}>
          <ul className="space-y-2.5">
            {data.rows.filter((r) => r.check_in).slice(0, 7).map((r) => (
              <li key={r.id} className="flex items-center justify-between rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 px-3.5 py-2.5">
                <span className="text-[13px] font-bold text-slate-700 dark:text-slate-200">{fmtDate(r.date)}</span>
                <span className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {r.mode === "WFH" ? <Home size={13} className="text-violet-500" /> : <Building2 size={13} className="text-emerald-500" />}
                  {fmtTime(r.check_in)} → {fmtTime(r.check_out)}
                  <Badge>{r.hours ? `${r.hours}h` : "—"}</Badge>
                </span>
              </li>
            ))}
            {data.rows.filter((r) => r.check_in).length === 0 && <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">No punches this month</p>}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function TeamAttendance() {
  const [date, setDate] = useState(todayStr());
  const [data, setData] = useState<{ date: string; working: number; team: (AttendanceRecord & { name: string; emp_code: string; department: string; designation: string; avatar_color: string; present_month: number })[] } | null>(null);

  const load = useCallback(() => {
    api<typeof data>(`/api/attendance?view=team&date=${date}`).then((d) => setData(d)).catch(() => {});
  }, [date]);
  useEffect(() => { load(); }, [load]);

  if (!data) return <PageLoader />;

  const presentCount = data.team.filter((t) => t.status === "Present" || t.status === "Half Day").length;

  return (
    <Card
      title={`Team attendance — ${fmtDate(date)}`}
      icon={<Users2 size={16} />}
      action={
        <span className="flex items-center gap-3">
          <span className="text-xs font-bold text-slate-400 dark:text-slate-500">{presentCount}/{data.team.length} present</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border border-slate-300 dark:border-slate-700 px-2.5 py-1.5 text-xs font-semibold outline-none focus:border-indigo-500" />
        </span>
      }
    >
      <DataTable
        rows={data.team}
        keyFor={(r) => r.id}
        columns={[
          { key: "emp", header: "Employee", render: (r) => <PersonCell name={r.name} sub={`${r.emp_code} · ${r.department || "—"}`} color={r.avatar_color} /> },
          { key: "status", header: "Status", render: (r) => <Badge tone={r.status || "None"}>{r.status || "No record"}</Badge> },
          { key: "in", header: "Check In", render: (r) => <span className="font-semibold">{fmtTime(r.check_in)}</span> },
          { key: "out", header: "Check Out", render: (r) => <span className="font-semibold">{fmtTime(r.check_out)}</span> },
          { key: "hours", header: "Hours", render: (r) => (r.hours ? `${r.hours}h` : "—") },
          { key: "mode", header: "Mode", render: (r) => (r.mode ? <Badge tone={r.mode}>{r.mode}</Badge> : "—") },
          {
            key: "month",
            header: "Month",
            render: (r) => (
              <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                {r.present_month}/{data.working} days
                <span className="ml-1.5 text-slate-300">·</span>
                <span className={cn("ml-1.5", data.working && r.present_month / data.working >= 0.9 ? "text-emerald-600 dark:text-emerald-300" : "text-amber-600 dark:text-amber-300")}>
                  {data.working ? Math.round((r.present_month / data.working) * 100) : 0}%
                </span>
              </span>
            ),
          },
        ]}
      />
    </Card>
  );
}

export default function AttendancePage() {
  const me = useMe();
  const [tab, setTab] = useState("mine");
  return (
    <div className="fade-up">
      <PageHeader
        title="Attendance"
        subtitle="Track your presence, punches and team availability"
        icon={<CalendarCheck2 size={20} />}
        actions={me.role !== "EMPLOYEE" ? <Tabs tabs={[{ key: "mine", label: "My Attendance" }, { key: "team", label: "Team" }]} active={tab} onChange={setTab} /> : undefined}
      />
      {tab === "mine" ? <MyAttendance /> : <TeamAttendance />}
    </div>
  );
}
