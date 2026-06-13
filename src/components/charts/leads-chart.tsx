"use client";

import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";
import { motion } from "framer-motion";
import { useTheme } from "@/hooks/use-theme";

/* ── Custom Glass Tooltip ── */
function GlassTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number; color: string; dataKey: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="backdrop-blur-xl rounded-xl shadow-[var(--shadow-xl)] px-4 py-3"
         style={{ background: "var(--bg-surface)", border: "1px solid var(--border)" }}>
      <p className="text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-muted)" }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-[13px] font-bold tabular-nums" style={{ color: "var(--text-primary)" }}>{p.value}</span>
        </div>
      ))}
    </div>
  );
}

/* ── LeadsAreaChart ── */
interface LeadsAreaChartProps {
  data: { month: string; count: number }[];
}

export function LeadsAreaChart({ data }: LeadsAreaChartProps) {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const formatted = data.map(d => ({
    name: d.month.replace(/^\d{4}-/, ""),
    leads: d.count,
  }));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={formatted}>
          <defs>
            <linearGradient id="leadGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={isDark ? 0.25 : 0.35} />
              <stop offset="50%" stopColor="#3b82f6" stopOpacity={isDark ? 0.08 : 0.1} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "rgba(148,163,184,0.1)" : "#f1f5f9"} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: isDark ? "#64748b" : "#94a3b8" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: isDark ? "#64748b" : "#94a3b8" }} axisLine={false} tickLine={false} />
          <Tooltip content={<GlassTooltip />} cursor={{ stroke: "#3b82f6", strokeDasharray: "4 4" }} />
          <Area
            type="monotone"
            dataKey="leads"
            stroke="#3b82f6"
            strokeWidth={2.5}
            fill="url(#leadGrad)"
            dot={{ r: 3, fill: isDark ? "#1e293b" : "#fff", stroke: "#3b82f6", strokeWidth: 2 }}
            activeDot={{ r: 5, fill: "#3b82f6", stroke: isDark ? "#1e293b" : "#fff", strokeWidth: 3 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </motion.div>
  );
}

