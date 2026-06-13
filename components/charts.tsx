"use client";

import React, { useEffect, useId, useState } from "react";
import { AnimatedValue } from "./ui";

/* Lightweight hand-rolled SVG charts with buttery entrance animations — no chart library. */

function useMounted() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(raf);
  }, []);
  return on;
}

/** Stable unique id for SVG defs so multiple charts on one page never collide. */
function useSvgId(prefix: string) {
  return `${prefix}-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
}

export function Sparkline({ data, height = 44, stroke = "#6366f1" }: { data: number[]; height?: number; stroke?: string }) {
  const gid = useSvgId("spark");
  const w = 160;
  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => [(i / Math.max(data.length - 1, 1)) * w, height - 4 - (v / max) * (height - 10)]);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${path} L${w},${height} L0,${height} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full" preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.30" />
          <stop offset="55%" stopColor={stroke} stopOpacity="0.10" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} className="fade-in-late" />
      <path d={path} fill="none" stroke={stroke} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="draw-path" />
      {last && (
        <>
          <circle cx={last[0]} cy={last[1]} r="3.5" fill={stroke} opacity="0.45" className="ping-dot" />
          <circle cx={last[0]} cy={last[1]} r="3" fill={stroke} className="pop-dot" style={{ animationDelay: "1.2s" }} />
        </>
      )}
    </svg>
  );
}

export function LineChart({
  data,
  height = 180,
  color = "#6366f1",
  suffix = "%",
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  suffix?: string;
}) {
  const gid = useSvgId("area");
  const w = 560;
  const pad = { l: 34, r: 12, t: 14, b: 26 };
  const max = Math.max(...data.map((d) => d.value), 10);
  const innerW = w - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const x = (i: number) => pad.l + (i / Math.max(data.length - 1, 1)) * innerW;
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;
  const path = data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(d.value).toFixed(1)}`).join(" ");
  const area = `${path} L${x(data.length - 1)},${pad.t + innerH} L${x(0)},${pad.t + innerH} Z`;
  const gridLines = [0.25, 0.5, 0.75, 1];
  const last = data.length - 1;
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.28" />
          <stop offset="55%" stopColor={color} stopOpacity="0.09" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>

      {gridLines.map((g, gi) => (
        <g key={g}>
          <line
            x1={pad.l} x2={w - pad.r} y1={y(max * g)} y2={y(max * g)}
            stroke="var(--chart-grid)" strokeDasharray="3 4" strokeWidth="1"
            className="grid-line" style={{ animationDelay: `${gi * 90}ms` }}
          />
          <text x={pad.l - 6} y={y(max * g) + 3.5} fontSize="9.5" fill="var(--chart-axis)" textAnchor="end" fontWeight={600}>
            {Math.round(max * g)}{suffix}
          </text>
        </g>
      ))}

      {/* soft gradient area — never a solid block */}
      <path d={area} fill={`url(#${gid})`} className="fade-in-late" />
      <path d={path} fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="draw-path" />

      {/* glowing comet travelling along the trend */}
      <g className="fade-in-late">
        <circle r="5.5" fill={color} opacity="0.22">
          <animateMotion dur="4.5s" begin="1.8s" repeatCount="indefinite" path={path} />
        </circle>
        <circle r="2.3" fill="#fff" stroke={color} strokeWidth="1.6">
          <animateMotion dur="4.5s" begin="1.8s" repeatCount="indefinite" path={path} />
        </circle>
      </g>

      {data.map((d, i) => (
        <g key={i}>
          {i === last && <circle cx={x(i)} cy={y(d.value)} r="4" fill={color} opacity="0.4" className="ping-dot" />}
          <circle
            cx={x(i)} cy={y(d.value)} r="3.2" fill="white" stroke={color} strokeWidth="2"
            className="pop-dot chart-dot" style={{ animationDelay: `${150 + (i / Math.max(last, 1)) * 1100}ms` }}
          >
            <title>{`${d.label}: ${d.value}${suffix}`}</title>
          </circle>
          {(data.length <= 12 || i % 2 === 0) && (
            <text x={x(i)} y={height - 8} fontSize="9.5" fill="var(--chart-axis)" textAnchor="middle" fontWeight={600}>
              {d.label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

export function BarChart({
  data,
  height = 190,
  color = "#8b5cf6",
  format = (v: number) => String(v),
}: {
  data: { label: string; value: number }[];
  height?: number;
  color?: string;
  format?: (v: number) => string;
}) {
  const gid = useSvgId("bar");
  const w = 560;
  const pad = { l: 10, r: 10, t: 24, b: 26 };
  const max = Math.max(...data.map((d) => d.value), 1);
  const innerW = w - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;
  const bw = Math.min(54, (innerW / Math.max(data.length, 1)) * 0.55);
  return (
    <svg viewBox={`0 0 ${w} ${height}`} className="w-full">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.95" />
          <stop offset="100%" stopColor={color} stopOpacity="0.45" />
        </linearGradient>
      </defs>
      {data.map((d, i) => {
        const cx = pad.l + (innerW / data.length) * (i + 0.5);
        const h = (d.value / max) * innerH;
        return (
          <g key={i}>
            <rect
              x={cx - bw / 2} y={pad.t + innerH - h} width={bw} height={Math.max(h, 2)} rx="7"
              fill={`url(#${gid})`} className="grow-bar bar-rect" style={{ animationDelay: `${i * 90}ms` }}
            >
              <title>{`${d.label}: ${format(d.value)}`}</title>
            </rect>
            <text x={cx} y={pad.t + innerH - h - 7} fontSize="10" fill="var(--chart-axis)" textAnchor="middle" fontWeight={700}
              className="row-enter" style={{ animationDelay: `${i * 90 + 500}ms` }}>
              {format(d.value)}
            </text>
            <text x={cx} y={height - 8} fontSize="10" fill="var(--chart-axis)" textAnchor="middle" fontWeight={600}>
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

const DONUT_COLORS = ["#6366f1", "#8b5cf6", "#ec4899", "#f59e0b", "#10b981", "#06b6d4"];

export function Donut({ data, size = 168 }: { data: { label: string; value: number }[]; size?: number }) {
  const mounted = useMounted();
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const R = 56;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <div className="flex flex-wrap items-center justify-center gap-5">
      <svg width={size} height={size} viewBox="0 0 140 140" className="donut-enter">
        <circle cx="70" cy="70" r={R} fill="none" stroke="var(--chart-track)" strokeWidth="17" />
        {data.map((d, i) => {
          const frac = d.value / total;
          const el = (
            <circle
              key={i}
              cx="70" cy="70" r={R} fill="none"
              stroke={DONUT_COLORS[i % DONUT_COLORS.length]}
              strokeWidth="17"
              strokeDasharray={mounted ? `${frac * C} ${C}` : `0 ${C}`}
              strokeDashoffset={-offset * C}
              strokeLinecap="butt"
              transform="rotate(-90 70 70)"
              className="donut-seg"
              style={{ transition: `stroke-dasharray 1s cubic-bezier(.22,1,.36,1) ${i * 140}ms, stroke-width .25s ease` }}
            >
              <title>{`${d.label}: ${d.value}`}</title>
            </circle>
          );
          offset += frac;
          return el;
        })}
        <text x="70" y="66" textAnchor="middle" fontSize="22" fontWeight="800" fill="var(--chart-ink)">
          <AnimatedValue value={Math.round(total)} />
        </text>
        <text x="70" y="84" textAnchor="middle" fontSize="9.5" fontWeight="600" fill="var(--chart-axis)">
          TOTAL
        </text>
      </svg>
      <ul className="space-y-1.5">
        {data.map((d, i) => (
          <li
            key={i}
            className="row-enter flex items-center gap-2 text-xs font-semibold text-slate-600 transition-transform duration-200 hover:translate-x-1"
            style={{ animationDelay: `${300 + i * 110}ms` }}
          >
            <span className="size-2.5 rounded-full transition-transform duration-200 hover:scale-150" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
            {d.label}
            <span className="text-slate-400">· {d.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HBarList({ data, color = "#6366f1", format = (v: number) => String(v) }: { data: { label: string; value: number }[]; color?: string; format?: (v: number) => string }) {
  const mounted = useMounted();
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <ul className="space-y-3">
      {data.map((d, i) => (
        <li key={i} className="group row-enter" style={{ animationDelay: `${i * 80}ms` }}>
          <div className="mb-1 flex items-center justify-between text-xs font-semibold">
            <span className="text-slate-600 transition-colors group-hover:text-indigo-600">{d.label}</span>
            <span className="text-slate-400">{format(d.value)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-full rounded-full transition-[width,filter] duration-1000 ease-[cubic-bezier(.22,1,.36,1)] group-hover:brightness-110"
              style={{
                width: mounted ? `${(d.value / max) * 100}%` : "0%",
                transitionDelay: `${i * 90}ms`,
                background: `linear-gradient(90deg, ${color}, ${color}99)`,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
