"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard, UserCircle2, CalendarCheck2, Clock4, Palmtree, Receipt, ListTodo, Wallet,
  Users2, PartyPopper, Megaphone, ClipboardCheck, UsersRound, Banknote, LogOut, Bell, Search,
  Menu, X, Sparkles, ChevronDown, KeyRound, BadgeCheck, CircleSlash, Settings2, Sun, Moon,
  ShieldCheck, Briefcase, UserRound, Plane,
  Landmark, FileText, Package, Building2, ShoppingCart, BarChart3, ClipboardList, FileMinus, CreditCard, ArrowLeft, RefreshCw,
  BookOpen, NotebookPen, Scale, Undo2, Target,
} from "lucide-react";
import { api } from "@/lib/api";
import { SWRProvider, prefetch, ROUTE_PREFETCH, clearDataCache } from "@/lib/swr";
import { useTheme } from "@/lib/theme";
import type { SessionUser } from "@/lib/types";
import { Avatar, Badge, ToastProvider, cn } from "./ui";

const MeCtx = createContext<SessionUser | null>(null);
export const useMe = () => useContext(MeCtx)!;

/** Per-role workspace identity — drives the prominent badge so it's always clear which console you're in. */
export const ROLE_META: Record<string, { workspace: string; short: string; icon: React.ReactNode; pill: string; dot: string }> = {
  ADMIN: {
    workspace: "Admin Console", short: "Admin", icon: <ShieldCheck size={14} />,
    pill: "bg-gradient-to-r from-indigo-600 to-violet-600 text-white ring-1 ring-inset ring-white/20 shadow-sm shadow-indigo-300/50 dark:shadow-none",
    dot: "bg-violet-300",
  },
  HR: {
    workspace: "HR Workspace", short: "HR", icon: <Briefcase size={14} />,
    pill: "bg-gradient-to-r from-emerald-600 to-teal-600 text-white ring-1 ring-inset ring-white/20 shadow-sm shadow-emerald-300/50 dark:shadow-none",
    dot: "bg-emerald-300",
  },
  EMPLOYEE: {
    workspace: "Employee Self-Service", short: "Employee", icon: <UserRound size={14} />,
    pill: "bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700",
    dot: "bg-slate-400",
  },
};

/** The prominent "which workspace am I in" badge shown in the top bar on every page. */
function RoleBadge({ role }: { role: string }) {
  const meta = ROLE_META[role] ?? ROLE_META.EMPLOYEE;
  return (
    <span className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold tracking-tight", meta.pill)}>
      <span className="grid place-items-center">{meta.icon}</span>
      <span className="hidden sm:inline">{meta.workspace}</span>
      <span className="sm:hidden">{meta.short}</span>
    </span>
  );
}

type NavItem = { href: string; label: string; icon: React.ReactNode; roles?: string[] };
type NavGroup = { title: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    title: "Overview",
    items: [{ href: "/dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> }],
  },
  {
    title: "Self Service",
    items: [
      { href: "/profile", label: "My Profile", icon: <UserCircle2 size={18} /> },
      { href: "/attendance", label: "Attendance", icon: <CalendarCheck2 size={18} /> },
      { href: "/timesheet", label: "Timesheet", icon: <Clock4 size={18} /> },
      { href: "/leave", label: "Apply Leave", icon: <Palmtree size={18} /> },
      { href: "/duty", label: "On Duty", icon: <Plane size={18} /> },
      { href: "/reimbursement", label: "Reimbursement", icon: <Receipt size={18} /> },
      { href: "/tasks", label: "Tasks", icon: <ListTodo size={18} /> },
      { href: "/payroll", label: "My Payroll", icon: <Wallet size={18} /> },
    ],
  },
  {
    title: "Organization",
    items: [
      { href: "/directory", label: "Directory", icon: <Users2 size={18} /> },
      { href: "/holidays", label: "Holiday List", icon: <PartyPopper size={18} /> },
      { href: "/announcements", label: "Announcements", icon: <Megaphone size={18} /> },
    ],
  },
  {
    title: "Management",
    items: [
      { href: "/admin/approvals", label: "Approvals", icon: <ClipboardCheck size={18} />, roles: ["HR", "ADMIN"] },
      { href: "/admin/employees", label: "Employees", icon: <UsersRound size={18} />, roles: ["HR", "ADMIN"] },
      { href: "/admin/payroll", label: "Payroll Console", icon: <Banknote size={18} />, roles: ["HR", "ADMIN"] },
      { href: "/admin/settings", label: "Org Settings", icon: <Settings2 size={18} />, roles: ["ADMIN"] },
    ],
  },
  {
    title: "Apps",
    items: [
      { href: "/books", label: "CRM · Books", icon: <Landmark size={18} /> },
    ],
  },
];

/** The CRM / Books workspace has its OWN sidebar — switched in automatically on /books/* routes. */
const CRM_NAV: NavGroup[] = [
  {
    title: "",
    items: [{ href: "/dashboard", label: "Back to HRMS", icon: <ArrowLeft size={18} /> }],
  },
  {
    title: "Books",
    items: [
      { href: "/books", label: "Overview", icon: <Landmark size={18} />, roles: ["HR", "ADMIN"] },
      { href: "/books/items", label: "Items & Stock", icon: <Package size={18} />, roles: ["HR", "ADMIN"] },
      { href: "/books/banking", label: "Banking", icon: <Landmark size={18} />, roles: ["HR", "ADMIN"] },
      { href: "/books/reports", label: "Reports", icon: <BarChart3 size={18} />, roles: ["HR", "ADMIN"] },
    ],
  },
  {
    title: "Sales",
    items: [
      { href: "/books/leads", label: "Leads", icon: <Target size={18} /> },
      { href: "/books/customers", label: "Customers", icon: <Users2 size={18} /> },
      { href: "/books/quotes", label: "Quotations", icon: <FileText size={18} /> },
      { href: "/books/sales-orders", label: "Sales Orders", icon: <ClipboardList size={18} /> },
      { href: "/books/invoices", label: "Invoices", icon: <Receipt size={18} /> },
      { href: "/books/payments-received", label: "Payments Received", icon: <CreditCard size={18} /> },
      { href: "/books/recurring", label: "Recurring", icon: <RefreshCw size={18} />, roles: ["HR", "ADMIN"] },
      { href: "/books/credit-notes", label: "Credit Notes", icon: <FileMinus size={18} />, roles: ["HR", "ADMIN"] },
    ],
  },
  {
    title: "Purchases",
    items: [
      { href: "/books/vendors", label: "Vendors", icon: <Building2 size={18} />, roles: ["HR", "ADMIN"] },
      { href: "/books/purchase-orders", label: "Purchase Orders", icon: <ShoppingCart size={18} />, roles: ["HR", "ADMIN"] },
      { href: "/books/bills", label: "Bills", icon: <Receipt size={18} />, roles: ["HR", "ADMIN"] },
      { href: "/books/expenses", label: "Expenses", icon: <Wallet size={18} />, roles: ["HR", "ADMIN"] },
      { href: "/books/payments-made", label: "Payments Made", icon: <CreditCard size={18} />, roles: ["HR", "ADMIN"] },
      { href: "/books/vendor-credits", label: "Vendor Credits", icon: <Undo2 size={18} />, roles: ["HR", "ADMIN"] },
    ],
  },
  {
    title: "Accountant",
    items: [
      { href: "/books/accounts", label: "Chart of Accounts", icon: <BookOpen size={18} />, roles: ["HR", "ADMIN"] },
      { href: "/books/journals", label: "Manual Journals", icon: <NotebookPen size={18} />, roles: ["HR", "ADMIN"] },
      { href: "/books/trial-balance", label: "Trial Balance", icon: <Scale size={18} />, roles: ["HR", "ADMIN"] },
    ],
  },
  {
    title: "Settings",
    items: [
      { href: "/books/integrations", label: "Zoho Sync", icon: <RefreshCw size={18} />, roles: ["HR", "ADMIN"] },
    ],
  },
];

/** Animated sun ⇆ moon theme toggle. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      onClick={toggle}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle theme"
      className={cn(
        "group relative flex h-9 w-16 items-center rounded-full p-1 transition-colors duration-500 cursor-pointer ring-1",
        dark ? "bg-slate-800 ring-slate-700" : "bg-indigo-100/70 ring-indigo-200"
      )}
    >
      {/* track icons */}
      <Sun size={13} className={cn("absolute left-2 transition-opacity duration-300", dark ? "opacity-40 text-slate-500" : "opacity-0")} />
      <Moon size={12} className={cn("absolute right-2 transition-opacity duration-300", dark ? "opacity-0" : "opacity-50 text-indigo-400")} />
      {/* knob */}
      <span
        className={cn(
          "relative z-10 grid size-7 place-items-center rounded-full text-white shadow-md transition-all duration-500 ease-[cubic-bezier(.34,1.56,.64,1)]",
          dark ? "translate-x-7 bg-gradient-to-br from-indigo-500 to-violet-600" : "translate-x-0 bg-gradient-to-br from-amber-400 to-orange-500"
        )}
      >
        {dark ? <Moon size={14} /> : <Sun size={14} />}
      </span>
    </button>
  );
}

function BrandMark() {
  return (
    <Link href="/dashboard" className="group flex items-center gap-2.5 px-1">
      <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 text-white shadow-md shadow-indigo-300/50 transition-all duration-500 group-hover:rotate-[15deg] group-hover:scale-110 group-hover:shadow-lg group-hover:shadow-violet-300 dark:shadow-indigo-950">
        <Sparkles size={18} />
      </span>
      <span className="leading-tight">
        <span className="block text-[17px] font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
          Nexus<span className="brand-gradient-text">HR</span>
        </span>
        <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">People Platform</span>
      </span>
    </Link>
  );
}

function SidebarNav({ nav, me, onNavigate }: { nav: NavGroup[]; me: SessionUser; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {nav.map((group, gi) => {
        const items = group.items.filter(
          (i) => !i.roles || i.roles.includes(me.role) || (i.href === "/admin/approvals" && me.is_hod)
        );
        if (!items.length) return null;
        return (
          <div key={group.title || gi}>
            {group.title && <p className="mb-1.5 px-3 text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">{group.title}</p>}
            <ul className="space-y-0.5">
              {items.map((item) => {
                const isRoot = item.href === "/dashboard" || item.href === "/books";
                const active = pathname === item.href || (!isRoot && pathname.startsWith(item.href + "/"));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={onNavigate}
                      onMouseEnter={() => prefetch(ROUTE_PREFETCH[item.href])}
                      onFocus={() => prefetch(ROUTE_PREFETCH[item.href])}
                      className={cn(
                        "group nav-item relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-semibold",
                        active
                          ? "bg-gradient-to-r from-indigo-50 to-violet-50 text-indigo-700 shadow-sm shadow-indigo-100 dark:from-indigo-500/15 dark:to-violet-500/10 dark:text-indigo-300 dark:shadow-none"
                          : "text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
                      )}
                    >
                      {active && <span className="nav-indicator absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-gradient-to-b from-indigo-600 to-violet-600" />}
                      <span className={cn("transition-all duration-300 group-hover:scale-110", active ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300")}>
                        {item.icon}
                      </span>
                      {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

/** Native-style bottom tab bar (phones only). 4 role-aware tabs + a More button that opens the full drawer. */
function MobileBottomNav({ me, onMore }: { me: SessionUser; onMore: () => void }) {
  const pathname = usePathname();
  const inCrm = pathname.startsWith("/books");
  const isMgmt = me.role !== "EMPLOYEE";
  const items: NavItem[] = inCrm
    ? (isMgmt
        ? [
            { href: "/books", label: "Books", icon: <Landmark size={21} /> },
            { href: "/books/invoices", label: "Invoices", icon: <Receipt size={21} /> },
            { href: "/books/quotes", label: "Quotes", icon: <FileText size={21} /> },
            { href: "/books/items", label: "Items", icon: <Package size={21} /> },
          ]
        : [
            { href: "/books/quotes", label: "Quotes", icon: <FileText size={21} /> },
            { href: "/dashboard", label: "HRMS", icon: <ArrowLeft size={21} /> },
          ])
    : [
        { href: "/dashboard", label: "Home", icon: <LayoutDashboard size={21} /> },
        { href: "/attendance", label: "Attendance", icon: <CalendarCheck2 size={21} /> },
        isMgmt
          ? { href: "/admin/approvals", label: "Approvals", icon: <ClipboardCheck size={21} /> }
          : { href: "/leave", label: "Leave", icon: <Palmtree size={21} /> },
        { href: "/duty", label: "On Duty", icon: <Plane size={21} /> },
      ];
  const isActive = (href: string) => href === "/dashboard" || href === "/books" ? pathname === href : (pathname === href || pathname.startsWith(href + "/"));
  return (
    <nav className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/90 backdrop-blur-xl lg:hidden dark:border-slate-800 dark:bg-slate-900/90">
      <div className="mx-auto grid max-w-md" style={{ gridTemplateColumns: `repeat(${items.length + 1}, minmax(0, 1fr))` }}>
        {items.map((it) => {
          const active = isActive(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              onTouchStart={() => prefetch(ROUTE_PREFETCH[it.href])}
              className={cn(
                "relative flex flex-col items-center gap-1 py-2.5 text-[10px] font-bold transition-colors active:scale-95",
                active ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400 dark:text-slate-500"
              )}
            >
              {active && <span className="absolute top-0 h-0.5 w-9 rounded-full bg-gradient-to-r from-indigo-600 to-violet-600" />}
              {it.icon}
              <span className="leading-none">{it.label}</span>
            </Link>
          );
        })}
        <button
          onClick={onMore}
          className="flex flex-col items-center gap-1 py-2.5 text-[10px] font-bold text-slate-400 transition-colors active:scale-95 dark:text-slate-500"
        >
          <Menu size={21} />
          <span className="leading-none">More</span>
        </button>
      </div>
    </nav>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<{ id: string; kind: string; text: string; href: string }[]>([]);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const load = () => api<{ items: typeof items }>("/api/notifications").then((d) => setItems(d.items)).catch(() => {});
    load();
    // LIVE: refresh the bell every 15s (only while the tab is visible)
    const t = setInterval(() => { if (!document.hidden) load(); }, 15000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const iconFor = (kind: string) =>
    kind === "approval" ? <ClipboardCheck size={15} className="text-amber-500" />
    : kind === "ok" ? <BadgeCheck size={15} className="text-emerald-500" />
    : kind === "no" ? <CircleSlash size={15} className="text-rose-500" />
    : <Megaphone size={15} className="text-indigo-500" />;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="bell-hover relative grid size-10 place-items-center rounded-xl text-slate-500 transition-all duration-200 hover:bg-slate-100 hover:text-indigo-600 cursor-pointer dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-indigo-400"
      >
        <Bell size={19} />
        {items.length > 0 && (
          <span className="absolute right-2 top-2 grid size-4 animate-pulse place-items-center rounded-full bg-rose-500 text-[9px] font-bold text-white ring-2 ring-white dark:ring-slate-900">
            {Math.min(items.length, 9)}
          </span>
        )}
      </button>
      {open && (
        <div className="fade-up absolute right-0 top-12 z-40 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800 dark:shadow-black/40">
          <p className="border-b border-slate-100 px-4 py-3 text-xs font-extrabold uppercase tracking-wider text-slate-400 dark:border-slate-700 dark:text-slate-500">Notifications</p>
          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-400 dark:text-slate-500">All caught up 🎉</li>}
            {items.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => { setOpen(false); router.push(n.href); }}
                  className="flex w-full items-start gap-2.5 px-4 py-3 text-left transition hover:bg-slate-50 cursor-pointer dark:hover:bg-slate-700/50"
                >
                  <span className="mt-0.5 shrink-0">{iconFor(n.kind)}</span>
                  <span className="text-[13px] font-medium leading-snug text-slate-700 dark:text-slate-200">{n.text}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ProfileMenu({ me }: { me: SessionUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" });
    clearDataCache();
    window.location.href = "/login";
  };

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2.5 rounded-xl p-1.5 pr-2.5 transition hover:bg-slate-100 cursor-pointer dark:hover:bg-slate-800">
        <Avatar name={me.name} size={34} />
        <span className="hidden text-left sm:block">
          <span className="block max-w-[140px] truncate text-[13px] font-bold text-slate-800 dark:text-slate-100">{me.name}</span>
          <span className="block text-[10.5px] font-semibold text-slate-400 dark:text-slate-500">{me.emp_code}</span>
        </span>
        <ChevronDown size={15} className="hidden text-slate-400 sm:block" />
      </button>
      {open && (
        <div className="fade-up absolute right-0 top-13 z-40 w-60 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800 dark:shadow-black/40">
          <div className="border-b border-slate-100 px-4 py-3.5 dark:border-slate-700">
            <p className="truncate text-sm font-bold text-slate-800 dark:text-slate-100">{me.name}</p>
            <p className="truncate text-xs text-slate-400 dark:text-slate-500">{me.email}</p>
            <Badge tone={me.role} className="mt-2">{me.role}</Badge>
          </div>
          <button onClick={() => { setOpen(false); router.push("/profile"); }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 cursor-pointer dark:text-slate-300 dark:hover:bg-slate-700/50">
            <UserCircle2 size={16} className="text-slate-400" /> My Profile
          </button>
          <button onClick={() => { setOpen(false); router.push("/profile?tab=security"); }} className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 cursor-pointer dark:text-slate-300 dark:hover:bg-slate-700/50">
            <KeyRound size={16} className="text-slate-400" /> Change Password
          </button>
          <button onClick={logout} className="flex w-full items-center gap-2.5 border-t border-slate-100 px-4 py-2.5 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 cursor-pointer dark:border-slate-700 dark:text-rose-400 dark:hover:bg-rose-500/10">
            <LogOut size={16} /> Sign Out
          </button>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<SessionUser | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [q, setQ] = useState("");
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    api<{ user: SessionUser }>("/api/auth/me")
      .then((d) => setMe(d.user))
      .catch(() => { window.location.href = "/login"; });
  }, []);

  // Zoho auto-pull: entering the CRM (as HR/Admin) kicks a throttled background pull — the server
  // no-ops unless connected, auto-sync is on, and the last pull is stale, so this is cheap to fire.
  useEffect(() => {
    if (!me || me.role === "EMPLOYEE" || !pathname.startsWith("/books")) return;
    api("/api/books/integration", { method: "POST", body: JSON.stringify({ action: "autopull" }) }).catch(() => {});
  }, [me, pathname]);

  if (!me) {
    return (
      <div className="relative grid min-h-screen place-items-center overflow-hidden bg-slate-50 dark:bg-slate-950">
        <div className="aurora opacity-40" />
        <div className="fade-up relative flex flex-col items-center gap-4">
          <span className="pulse-glow grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 text-white shadow-xl shadow-indigo-300/50">
            <Sparkles size={26} />
          </span>
          <p className="text-sm font-bold text-slate-500 dark:text-slate-400">
            Loading <span className="brand-gradient-text font-extrabold">NexusHR</span>…
          </p>
          <div className="shimmer h-1.5 w-44 rounded-full" />
        </div>
      </div>
    );
  }

  const inCrm = pathname.startsWith("/books");
  const nav = inCrm ? CRM_NAV : NAV;

  return (
    <MeCtx.Provider value={me}>
      <SWRProvider userId={me.id}>
      <ToastProvider>
        <div className="min-h-screen app-canvas">
          {/* Desktop sidebar */}
          <aside className="glass-panel fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200/70 lg:flex dark:border-slate-800/70">
            <div className="border-b border-slate-100 px-4 py-4 dark:border-slate-800"><BrandMark /></div>
            <SidebarNav nav={nav} me={me} />
            <div className="border-t border-slate-100 p-3 dark:border-slate-800">
              <div className="flex items-center gap-2.5 rounded-xl bg-slate-50 p-2.5 dark:bg-slate-800">
                <Avatar name={me.name} size={34} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-bold text-slate-800 dark:text-slate-100">{me.name}</span>
                  <Badge tone={me.role} className="mt-0.5">{me.role}</Badge>
                </span>
              </div>
            </div>
          </aside>

          {/* Mobile drawer */}
          {mobileOpen && (
            <div className="fixed inset-0 z-40 lg:hidden">
              <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm dark:bg-black/60" onClick={() => setMobileOpen(false)} />
              <aside className="glass-panel absolute inset-y-0 left-0 flex w-72 flex-col shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 dark:border-slate-800">
                  <BrandMark />
                  <button onClick={() => setMobileOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 cursor-pointer dark:hover:bg-slate-800"><X size={18} /></button>
                </div>
                <SidebarNav nav={nav} me={me} onNavigate={() => setMobileOpen(false)} />
              </aside>
            </div>
          )}

          {/* Main column */}
          <div className="lg:pl-64">
            <header className="glass-panel sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/70 px-4 sm:px-6 dark:border-slate-800/70">
              <Link href="/dashboard" aria-label="NexusHR home" className="flex shrink-0 items-center lg:hidden">
                <span className="grid size-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-500 text-white shadow-sm shadow-indigo-300/50 dark:shadow-none">
                  <Sparkles size={18} />
                </span>
              </Link>
              {inCrm ? (
                <span className="flex items-center gap-1.5 rounded-full bg-gradient-to-r from-violet-600 to-fuchsia-600 px-3 py-1.5 text-[12px] font-bold tracking-tight text-white ring-1 ring-inset ring-white/20">
                  <Landmark size={14} /> <span className="hidden sm:inline">CRM · Books</span><span className="sm:hidden">CRM</span>
                </span>
              ) : (
                <RoleBadge role={me.role} />
              )}
              <form
                className="relative hidden flex-1 max-w-md transition-all duration-500 ease-[cubic-bezier(.22,1,.36,1)] focus-within:max-w-xl md:block"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (q.trim()) router.push(`/directory?q=${encodeURIComponent(q.trim())}`);
                }}
              >
                <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search people, departments…"
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-10 pr-4 text-sm outline-none transition focus:border-indigo-400 focus:bg-white focus:ring-4 focus:ring-indigo-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-500 dark:focus:bg-slate-800 dark:focus:ring-indigo-500/20"
                />
              </form>
              <div className="ml-auto flex items-center gap-1.5">
                <span className="mr-1 hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500 xl:flex dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400">
                  📅 {new Date().toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" })}
                </span>
                <ThemeToggle />
                <NotificationBell />
                <ProfileMenu me={me} />
              </div>
            </header>
            <main key={pathname} className="page-enter mx-auto max-w-[1400px] p-4 pb-[calc(4.75rem+env(safe-area-inset-bottom))] sm:p-6 sm:pb-[calc(4.75rem+env(safe-area-inset-bottom))] lg:pb-6">{children}</main>
          </div>
          <MobileBottomNav me={me} onMore={() => setMobileOpen(true)} />
        </div>
      </ToastProvider>
      </SWRProvider>
    </MeCtx.Provider>
  );
}
