import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { VersiculoDoDia } from "./versiculo";

export function ConsolePage({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="console-grid-bg h-full overflow-y-auto bg-[var(--bg-base)] text-[var(--text-primary)]">
      <div className="flex w-full flex-col gap-5 px-6 py-4">
        <header className="flex min-h-[54px] flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] pb-4">
          <div>
            <h1 className="text-[22px] font-bold leading-tight tracking-normal text-[var(--text-primary)]">{title}</h1>
            {subtitle && <p className="mt-0.5 text-[12px] font-medium text-[var(--text-muted)]">{subtitle}</p>}
          </div>

          <VersiculoDoDia />

          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
        {children}
      </div>
    </div>
  );
}

export function ConsoleCard({
  children,
  className,
  pad = true,
}: {
  children: React.ReactNode;
  className?: string;
  pad?: boolean;
}) {
  return (
    <section
      className={cn(
        "rounded-[14px] border border-[var(--border)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)]",
        pad && "p-4",
        className
      )}
    >
      {children}
    </section>
  );
}

export function ConsoleMetric({
  label,
  value,
  helper,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: React.ReactNode;
  helper?: React.ReactNode;
  icon?: LucideIcon;
  tone?: "blue" | "green" | "amber" | "red" | "violet" | "slate";
}) {
  const tones = {
    blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
    green: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
    amber: "text-amber-400 bg-amber-500/10 border-amber-500/20",
    red: "text-red-400 bg-red-500/10 border-red-500/20",
    violet: "text-violet-400 bg-violet-500/10 border-violet-500/20",
    slate: "text-[var(--text-muted)] bg-[var(--bg-subtle)] border-[var(--border)]",
  };

  return (
    <ConsoleCard className="min-h-[128px]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">{label}</p>
          <div className="mt-5 font-data text-[30px] font-bold leading-none text-[var(--text-primary)]">{value}</div>
          {helper && <div className="mt-2 text-[11px] font-semibold text-[var(--emerald)]">{helper}</div>}
        </div>
        {Icon && (
          <div className={cn("grid h-8 w-8 place-items-center rounded-[6px] border", tones[tone])}>
            <Icon size={15} />
          </div>
        )}
      </div>
    </ConsoleCard>
  );
}

export function ConsoleStatus({
  children,
  tone = "slate",
}: {
  children: React.ReactNode;
  tone?: "green" | "amber" | "red" | "blue" | "violet" | "slate";
}) {
  // O texto usa as variáveis de acento em vez de `text-*-300` fixo: o tema claro
  // troca essas variáveis por tons escuros. Com a cor fixa, todo selo ficava em
  // ~1.9:1 sobre o fundo branco — ilegível justamente onde ele carrega o estado.
  const tones = {
    green: "border-emerald-500/25 bg-emerald-500/10 text-[var(--emerald)]",
    amber: "border-amber-500/25 bg-amber-500/10 text-[var(--amber)]",
    red: "border-red-500/25 bg-red-500/10 text-[var(--red)]",
    blue: "border-blue-500/25 bg-blue-500/10 text-[var(--blue)]",
    violet: "border-violet-500/25 bg-violet-500/10 text-[var(--violet)]",
    slate: "border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--text-secondary)]",
  };
  return (
    <span className={cn("inline-flex items-center rounded-[4px] border px-2 py-0.5 text-[10px] font-bold uppercase", tones[tone])}>
      {children}
    </span>
  );
}

export function ConsoleButton({
  children,
  icon: Icon,
  active,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { icon?: LucideIcon; active?: boolean }) {
  return (
    <button
      {...props}
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border px-4 text-[12px] font-bold transition-colors",
        active
          ? "border-blue-500 bg-blue-500 text-white"
          : "border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-blue-500/50 hover:text-[var(--text-primary)]",
        className
      )}
    >
      {Icon && <Icon size={14} />}
      {children}
    </button>
  );
}

export function ConsoleInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-10 rounded-[999px] border border-[var(--border)] bg-[var(--bg-inset)] px-5 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-blue-500/60",
        props.className
      )}
    />
  );
}

export function ConsoleTable({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-[12px]">
        <thead>
          <tr className="border-b border-[var(--border)] bg-[var(--bg-inset)]">
            {headers.map((header) => (
              <th key={header} className="whitespace-nowrap px-3 py-2 text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function ConsoleLoading() {
  return (
    <ConsoleCard className="flex h-40 items-center justify-center">
      <Loader2 className="animate-spin text-blue-400" size={20} />
    </ConsoleCard>
  );
}

export function ConsoleError({ message }: { message: string }) {
  return (
    <ConsoleCard className="flex items-center gap-3 border-red-500/30 bg-red-500/5 text-red-300">
      <AlertTriangle size={18} />
      <span className="text-sm font-semibold">{message}</span>
    </ConsoleCard>
  );
}
