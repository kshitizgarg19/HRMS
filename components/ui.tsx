"use client";

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, AlertTriangle, CheckCircle2, Info, Loader2 } from "lucide-react";
import { initials, colorFor } from "@/lib/format";

export function cn(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ---------------- Count-up (buttery number animation) ---------------- */
function splitNumeric(v: string): { prefix: string; num: number; suffix: string; comma: boolean; decimals: number } | null {
  const m = v.match(/^([^\d-]*)(-?[\d,]+(?:\.\d+)?)([\s\S]*)$/);
  if (!m) return null;
  const raw = m[2];
  const num = parseFloat(raw.replace(/,/g, ""));
  if (isNaN(num)) return null;
  return { prefix: m[1], num, suffix: m[3], comma: raw.includes(","), decimals: raw.includes(".") ? (raw.split(".")[1] || "").length : 0 };
}

function useCountUp(target: number, duration = 950): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      setValue(target * (1 - Math.pow(1 - p, 3))); // ease-out cubic
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function AnimatedNumber({ text }: { text: string }) {
  const parts = splitNumeric(text);
  const current = useCountUp(parts?.num ?? 0);
  if (!parts) return <>{text}</>;
  const formatted = parts.comma
    ? Math.round(current).toLocaleString("en-IN")
    : current.toFixed(parts.decimals);
  return <>{parts.prefix}{formatted}{parts.suffix}</>;
}

export function AnimatedValue({ value }: { value: React.ReactNode }) {
  if (typeof value === "number") return <AnimatedNumber text={String(value)} />;
  if (typeof value === "string") return <AnimatedNumber text={value} />;
  return <>{value}</>;
}

/* ---------------- Buttons ---------------- */
type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "success" | "outline";
export function Button({
  variant = "primary",
  size = "md",
  loading,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}) {
  const variants: Record<BtnVariant, string> = {
    primary:
      "bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-200 hover:shadow-lg hover:shadow-indigo-300/60 hover:from-indigo-700 hover:to-violet-700 dark:shadow-indigo-950/60",
    secondary: "bg-indigo-50 text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300 dark:hover:bg-indigo-500/25",
    outline:
      "border border-slate-300 bg-white text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/40 hover:text-indigo-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-indigo-500/50 dark:hover:bg-slate-700 dark:hover:text-indigo-300",
    ghost: "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800",
    danger: "bg-rose-600 text-white shadow-md shadow-rose-200 hover:bg-rose-700 hover:shadow-lg dark:shadow-rose-950/60",
    success: "bg-emerald-600 text-white shadow-md shadow-emerald-200 hover:bg-emerald-700 hover:shadow-lg dark:shadow-emerald-950/60",
  };
  const sizes = { sm: "px-2.5 py-1.5 text-xs", md: "px-4 py-2 text-sm", lg: "px-5 py-2.5 text-sm" };
  const shiny = variant === "primary" || variant === "danger" || variant === "success";
  return (
    <button
      className={cn(
        "group/btn relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-xl font-semibold cursor-pointer",
        "transition-all duration-300 ease-out hover:-translate-y-px active:translate-y-0 active:scale-[.97]",
        "disabled:opacity-50 disabled:pointer-events-none",
        variants[variant],
        sizes[size],
        className
      )}
      disabled={loading || rest.disabled}
      {...rest}
    >
      {loading && <Loader2 size={15} className="animate-spin" />}
      {children}
      {shiny && <span className="btn-shine" aria-hidden />}
    </button>
  );
}

/* ---------------- Card ---------------- */
export function Card({
  title,
  icon,
  action,
  className,
  bodyClassName,
  children,
}: {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "card-glow rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_3px_rgba(15,23,42,.05)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20",
        className
      )}
    >
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
            {icon && <span className="text-indigo-600 transition-transform duration-300 hover:rotate-6 dark:text-indigo-400">{icon}</span>}
            {title}
          </h3>
          {action}
        </header>
      )}
      <div className={cn("p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

/* ---------------- Stat card ---------------- */
export function StatCard({
  label,
  value,
  icon,
  accent = "indigo",
  sub,
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  accent?: "indigo" | "emerald" | "rose" | "violet" | "amber" | "sky";
  sub?: React.ReactNode;
  onClick?: () => void;
}) {
  const accents = {
    indigo: "bg-indigo-50 text-indigo-600 border-indigo-500 dark:bg-indigo-500/15 dark:text-indigo-300",
    emerald: "bg-emerald-50 text-emerald-600 border-emerald-500 dark:bg-emerald-500/15 dark:text-emerald-300",
    rose: "bg-rose-50 text-rose-600 border-rose-500 dark:bg-rose-500/15 dark:text-rose-300",
    violet: "bg-violet-50 text-violet-600 border-violet-500 dark:bg-violet-500/15 dark:text-violet-300",
    amber: "bg-amber-50 text-amber-600 border-amber-500 dark:bg-amber-500/15 dark:text-amber-300",
    sky: "bg-sky-50 text-sky-600 border-sky-500 dark:bg-sky-500/15 dark:text-sky-300",
  };
  const chip = accents[accent];
  const border = accents[accent].split(" ")[2];
  return (
    <div
      onClick={onClick}
      className={cn(
        "group card-lift relative overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_1px_3px_rgba(15,23,42,.05)] dark:border-slate-800 dark:bg-slate-900 dark:shadow-black/20",
        onClick && "cursor-pointer"
      )}
    >
      <div className={cn("absolute inset-y-0 left-0 w-1 rounded-r transition-all duration-300 group-hover:w-1.5", border.replace("border-", "bg-"))} />
      <div className="pointer-events-none absolute -right-10 -top-10 size-28 rounded-full bg-gradient-to-br from-indigo-100/0 to-violet-100/0 blur-2xl transition-all duration-500 group-hover:from-indigo-100/80 group-hover:to-violet-100/60 dark:group-hover:from-indigo-500/20 dark:group-hover:to-violet-500/10" />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-1.5 truncate text-[26px] font-extrabold tracking-tight text-slate-900 dark:text-slate-50">
            <AnimatedValue value={value} />
          </p>
          {sub && <div className="mt-1 text-xs font-medium text-slate-400 dark:text-slate-500">{sub}</div>}
        </div>
        <span
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-xl transition-all duration-300 group-hover:scale-110 group-hover:-rotate-6 group-hover:shadow-md",
            chip
          )}
        >
          {icon}
        </span>
      </div>
    </div>
  );
}

/* ---------------- Badge ---------------- */
const BADGE_TONES: Record<string, string> = {
  Pending: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
  Approved: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
  Rejected: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30",
  Cancelled: "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-700/50 dark:text-slate-400 dark:ring-slate-600",
  Present: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
  Absent: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30",
  Leave: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30",
  "Half Day": "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
  Holiday: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30",
  Active: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
  "On Notice": "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
  Exited: "bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-700/50 dark:text-slate-400 dark:ring-slate-600",
  Paid: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
  Generated: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30",
  "To Do": "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-700/50 dark:text-slate-300 dark:ring-slate-600",
  "In Progress": "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30",
  Done: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
  Urgent: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-500/30",
  High: "bg-orange-50 text-orange-700 ring-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:ring-orange-500/30",
  Medium: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-500/30",
  Low: "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-700/50 dark:text-slate-300 dark:ring-slate-600",
  ADMIN: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30",
  HR: "bg-pink-50 text-pink-700 ring-pink-200 dark:bg-pink-500/15 dark:text-pink-300 dark:ring-pink-500/30",
  EMPLOYEE: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30",
  Public: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-500/30",
  Optional: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-500/30",
  WFH: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-500/30",
  WFO: "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:ring-emerald-500/30",
};
export function Badge({ children, tone, className }: { children: React.ReactNode; tone?: string; className?: string }) {
  const key = tone ?? (typeof children === "string" ? children : "");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold ring-1 transition-transform duration-200 hover:scale-105",
        BADGE_TONES[key] || "bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-700/50 dark:text-slate-300 dark:ring-slate-600",
        className
      )}
    >
      {children}
    </span>
  );
}

/* ---------------- Form fields ---------------- */
export function Field({ label, required, hint, children, className }: { label: string; required?: boolean; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-slate-400 dark:text-slate-500">{hint}</span>}
    </label>
  );
}

const inputCls =
  "w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 outline-none transition-all duration-300 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 focus:shadow-[0_4px_20px_-6px_rgba(99,102,241,.35)] hover:border-slate-400 disabled:bg-slate-50 disabled:text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-500/20 dark:hover:border-slate-600 dark:disabled:bg-slate-800/50 dark:disabled:text-slate-500 [color-scheme:light] dark:[color-scheme:dark]";

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(inputCls, props.className)} />;
}
export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(inputCls, "cursor-pointer", props.className)} />;
}
export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cn(inputCls, "resize-none", props.className)} />;
}

/* ---------------- Modal ---------------- */
export function Modal({
  open,
  onClose,
  title,
  subtitle,
  width = "max-w-lg",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  subtitle?: string;
  width?: string;
  children: React.ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    document.body.style.overflow = "hidden"; // lock background scroll while open
    return () => {
      window.removeEventListener("keydown", fn);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open || !mounted) return null;

  // Rendered through a portal to <body> so it always covers the true viewport —
  // immune to ancestor transforms (page transitions) that would otherwise trap a fixed element.
  return createPortal(
    <div
      className="modal-backdrop fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-slate-950/50 p-4 backdrop-blur-xl sm:items-center sm:p-6 dark:bg-black/65"
      onMouseDown={onClose}
    >
      <div
        className={cn(
          "modal-panel relative flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-3xl bg-white shadow-[0_40px_90px_-25px_rgba(2,6,23,0.55)] ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10",
          width
        )}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-100 px-6 py-4 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition-all duration-200 hover:rotate-90 hover:bg-slate-100 hover:text-slate-600 cursor-pointer dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
      </div>
    </div>,
    document.body
  );
}

export function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  danger,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} title={title} width="max-w-md">
      <div className="flex items-start gap-3">
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", danger ? "bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400" : "bg-indigo-50 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-400")}>
          <AlertTriangle size={18} />
        </span>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">{message}</p>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

/* ---------------- Tabs ---------------- */
export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: React.ReactNode }[];
  active: string;
  onChange: (k: string) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "rounded-lg px-3.5 py-1.5 text-[13px] font-semibold transition-all duration-300 cursor-pointer",
            active === t.key
              ? "scale-[1.03] bg-white text-indigo-700 shadow-md shadow-indigo-100 dark:bg-slate-700 dark:text-indigo-300 dark:shadow-black/30"
              : "text-slate-500 hover:scale-[1.02] hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Table ---------------- */
export function DataTable<T>({
  columns,
  rows,
  keyFor,
  empty,
}: {
  columns: { key: string; header: React.ReactNode; className?: string; render: (row: T, i: number) => React.ReactNode }[];
  rows: T[];
  keyFor: (row: T, i: number) => string | number;
  empty?: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700">
            {columns.map((c) => (
              <th key={c.key} className={cn("px-3 py-2.5 text-[11px] font-extrabold uppercase tracking-wider text-slate-400 dark:text-slate-500", c.className)}>
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-12">
                {empty || <EmptyState title="Nothing here yet" />}
              </td>
            </tr>
          )}
          {rows.map((r, i) => (
            <tr
              key={keyFor(r, i)}
              className="row-enter border-b border-slate-100 transition-colors duration-200 last:border-0 hover:bg-indigo-50/40 dark:border-slate-800 dark:hover:bg-slate-800/50"
              style={{ animationDelay: `${Math.min(i, 14) * 45}ms` }}
            >
              {columns.map((c) => (
                <td key={c.key} className={cn("px-3 py-3 text-sm text-slate-700 dark:text-slate-300", c.className)}>
                  {c.render(r, i)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- Avatar ---------------- */
export function Avatar({ name, color, size = 36, src }: { name: string; color?: string | null; size?: number; src?: string | null }) {
  void src;
  return (
    <span
      className="grid shrink-0 select-none place-items-center rounded-full font-bold text-white ring-2 ring-white/60 transition-transform duration-300 hover:scale-110 dark:ring-white/10"
      style={{ width: size, height: size, fontSize: size * 0.36, background: `linear-gradient(135deg, ${color || colorFor(name)}, ${color || colorFor(name)}cc)` }}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

export function PersonCell({ name, sub, color }: { name: string; sub?: string | null; color?: string | null }) {
  return (
    <span className="flex items-center gap-2.5">
      <Avatar name={name} color={color} size={32} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-slate-800 dark:text-slate-100">{name}</span>
        {sub && <span className="block truncate text-xs text-slate-400 dark:text-slate-500">{sub}</span>}
      </span>
    </span>
  );
}

/* ---------------- Empty / loading ---------------- */
export function EmptyState({ title, hint, icon }: { title: string; hint?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <span className="float-y grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-slate-100 to-indigo-50 text-slate-400 dark:from-slate-800 dark:to-slate-800 dark:text-slate-500">
        {icon || <Info size={20} />}
      </span>
      <p className="text-sm font-semibold text-slate-500 dark:text-slate-400">{title}</p>
      {hint && <p className="max-w-sm text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  );
}

export function Spinner() {
  return <Loader2 size={28} className="animate-spin text-indigo-500" />;
}

/** Shimmer skeleton — feels faster than a spinner. */
export function PageLoader() {
  return (
    <div className="fade-up space-y-4 py-2">
      <div className="shimmer h-24 rounded-3xl" />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="shimmer h-28 rounded-2xl" style={{ animationDelay: `${i * 80}ms` }} />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="shimmer h-64 rounded-2xl" />
        <div className="shimmer h-64 rounded-2xl" />
      </div>
    </div>
  );
}

/* ---------------- Page header ---------------- */
export function PageHeader({ title, subtitle, icon, actions }: { title: string; subtitle?: string; icon?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {icon && (
          <span className="group grid size-11 place-items-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-200 transition-all duration-300 hover:-rotate-6 hover:scale-105 hover:shadow-xl hover:shadow-indigo-300/60 dark:shadow-indigo-950/60">
            {icon}
          </span>
        )}
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-slate-50">{title}</h1>
          {subtitle && <p className="text-[13px] text-slate-500 dark:text-slate-400">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------------- Progress ---------------- */
export function ProgressBar({ value, max = 100, color = "bg-indigo-500", className }: { value: number; max?: number; color?: string; className?: string }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setWidth(pct));
    return () => cancelAnimationFrame(raf);
  }, [pct]);
  return (
    <div className={cn("h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800", className)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-1000 ease-[cubic-bezier(.22,1,.36,1)]", color)}
        style={{ width: `${width}%` }}
      />
    </div>
  );
}

/* ---------------- Toasts ---------------- */
type Toast = { id: number; kind: "success" | "error" | "info"; text: string };
const ToastCtx = createContext<{ push: (kind: Toast["kind"], text: string) => void }>({ push: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);
  const push = useCallback((kind: Toast["kind"], text: string) => {
    const id = ++idRef.current;
    setToasts((t) => [...t, { id, kind, text }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed bottom-5 right-5 z-[100] flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "toast-enter pointer-events-auto flex items-start gap-2.5 rounded-2xl border bg-white/95 p-3.5 shadow-xl shadow-slate-900/10 backdrop-blur dark:bg-slate-800/95 dark:shadow-black/40",
              t.kind === "success" && "border-emerald-200 dark:border-emerald-500/30",
              t.kind === "error" && "border-rose-200 dark:border-rose-500/30",
              t.kind === "info" && "border-indigo-200 dark:border-indigo-500/30"
            )}
          >
            {t.kind === "success" && <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-500" />}
            {t.kind === "error" && <AlertTriangle size={17} className="mt-0.5 shrink-0 text-rose-500" />}
            {t.kind === "info" && <Info size={17} className="mt-0.5 shrink-0 text-indigo-500" />}
            <p className="text-[13px] font-medium leading-snug text-slate-700 dark:text-slate-200">{t.text}</p>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
