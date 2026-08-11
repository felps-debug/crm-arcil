import type { LucideIcon } from "lucide-react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

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
          <div className="relative pl-4">
            <span className="absolute left-0 top-1 h-3 w-1 rounded-full bg-[var(--blue)]" aria-hidden="true" />
            <h1 className="text-[22px] font-bold leading-tight tracking-[-0.02em] text-[var(--text-primary)]">{title}</h1>
            {subtitle && <p className="mt-0.5 text-[12px] font-medium text-[var(--text-muted)]">{subtitle}</p>}
          </div>
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
        "rounded-[12px] border border-[var(--border)] bg-[var(--bg-surface)] shadow-[var(--shadow-card)]",
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
    blue: "text-[var(--blue)] bg-[var(--bg-subtle)] border-[var(--border)]",
    green: "text-[var(--emerald)] bg-[var(--bg-subtle)] border-[var(--border)]",
    amber: "text-[var(--amber)] bg-[var(--bg-subtle)] border-[var(--border)]",
    red: "text-[var(--red)] bg-[var(--bg-subtle)] border-[var(--border)]",
    violet: "text-[var(--violet)] bg-[var(--bg-subtle)] border-[var(--border)]",
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
  const tones = {
    green: "border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--emerald)]",
    amber: "border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--amber)]",
    red: "border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--red)]",
    blue: "border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--blue)]",
    violet: "border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--violet)]",
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
    "inline-flex h-10 items-center justify-center gap-2 rounded-[8px] border px-4 text-[12px] font-bold transition-all",
        active
          ? "border-[var(--sidebar-active)] bg-[var(--sidebar-active)] text-white"
          : "border-[var(--border)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:border-[var(--blue)] hover:text-[var(--text-primary)]",
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
        "h-10 rounded-[8px] border border-[var(--border)] bg-[var(--bg-inset)] px-4 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--blue)] focus:ring-2 focus:ring-[var(--blue)]/15",
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
      <Loader2 className="animate-spin text-[var(--blue)]" size={20} />
    </ConsoleCard>
  );
}

export function ConsoleError({ message }: { message: string }) {
  return (
      <ConsoleCard className="flex items-center gap-3 border-[var(--border)] bg-[var(--bg-subtle)] text-[var(--red)]">
      <AlertTriangle size={18} />
      <span className="text-sm font-semibold">{message}</span>
    </ConsoleCard>
  );
}
