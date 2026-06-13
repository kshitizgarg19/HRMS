"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Users2, Search, Mail, Phone, MapPin, CalendarDays } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/format";
import { Avatar, Badge, Card, PageHeader, PageLoader, Select } from "@/components/ui";

interface DirEmployee {
  id: number;
  emp_code: string;
  name: string;
  designation: string | null;
  department: string | null;
  email: string;
  phone: string | null;
  city: string | null;
  work_location: string | null;
  join_date: string | null;
  status: string;
  avatar_color: string | null;
}

function DirectoryInner() {
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") || "");
  const [dept, setDept] = useState("");
  const [data, setData] = useState<{ rows: DirEmployee[]; departments: string[] } | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      api<{ rows: DirEmployee[]; departments: string[] }>(`/api/employees?q=${encodeURIComponent(q)}&department=${encodeURIComponent(dept)}`)
        .then(setData)
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q, dept]);

  if (!data) return <PageLoader />;

  return (
    <div className="fade-up">
      <PageHeader title="Employee Directory" subtitle={`${data.rows.length} colleagues`} icon={<Users2 size={20} />} />

      <Card className="mb-5" bodyClassName="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, role, email…"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-700 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100"
            />
          </div>
          <Select value={dept} onChange={(e) => setDept(e.target.value)} className="!w-auto">
            <option value="">All departments</option>
            {data.departments.map((d) => <option key={d}>{d}</option>)}
          </Select>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {data.rows.map((e) => (
          <div key={e.id} className="group rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
            <div className="flex items-center gap-3.5">
              <Avatar name={e.name} color={e.avatar_color} size={52} />
              <div className="min-w-0">
                <p className="truncate text-[15px] font-extrabold text-slate-900 dark:text-slate-100">{e.name}</p>
                <p className="truncate text-[13px] font-medium text-slate-500 dark:text-slate-400">{e.designation || "—"}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <Badge tone="EMPLOYEE">{e.department || "—"}</Badge>
                  <span className="text-[10px] font-bold text-slate-300">{e.emp_code}</span>
                </div>
              </div>
            </div>
            <ul className="mt-4 space-y-1.5 border-t border-slate-100 dark:border-slate-800 pt-3.5 text-[12.5px] font-medium text-slate-500 dark:text-slate-400">
              <li className="flex items-center gap-2 truncate"><Mail size={13} className="shrink-0 text-slate-300" /> {e.email}</li>
              <li className="flex items-center gap-2"><Phone size={13} className="shrink-0 text-slate-300" /> {e.phone || "—"}</li>
              <li className="flex items-center gap-2"><MapPin size={13} className="shrink-0 text-slate-300" /> {e.work_location || e.city || "—"}</li>
              <li className="flex items-center gap-2"><CalendarDays size={13} className="shrink-0 text-slate-300" /> Joined {fmtDate(e.join_date)}</li>
            </ul>
          </div>
        ))}
        {data.rows.length === 0 && (
          <p className="col-span-full py-10 text-center text-sm text-slate-400 dark:text-slate-500">No employees match your search.</p>
        )}
      </div>
    </div>
  );
}

export default function DirectoryPage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <DirectoryInner />
    </Suspense>
  );
}
