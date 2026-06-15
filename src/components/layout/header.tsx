"use client";

import { Search, X, Building2, User } from "lucide-react";
import { getInitials } from "@/lib/utils";
import { PeriodSelector } from "@/components/ui/period-selector";
import { LeadDrawer } from "@/components/ui/lead-drawer";
import { getLeadsBySearch } from "@/lib/supabase/queries";
import { useCurrentUser } from "@/hooks/use-current-user";
import type { Lead } from "@/types";
import { useState, useEffect, useRef, useCallback } from "react";

interface HeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function Header({ title, subtitle, action }: HeaderProps) {
  const [query,        setQuery]    = useState("");
  const [results,      setResults]  = useState<Lead[]>([]);
  const [loading,      setLoading]  = useState(false);
  const [open,         setOpen]     = useState(false);
  const [selectedLead, setSelected] = useState<Lead | null>(null);
  const inputRef    = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { profile } = useCurrentUser();
  const displayName = profile?.full_name ?? profile?.email ?? "";
  const initials = displayName ? getInitials(displayName) : "?";

  const search = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setOpen(false); return; }
    setLoading(true);
    const data = await getLeadsBySearch(q);
    setResults(data);
    setOpen(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 320);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, search]);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node) &&
        inputRef.current  && !inputRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <>
      <header
        className="sticky top-0 z-30 h-14 flex items-center px-4 sm:px-6 gap-3 sm:gap-4 header-glass"
        style={{ borderBottom: "1px solid var(--border-strong)" }}
      >
        {/* Title */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-3">
            <h1
              className="font-bold text-[var(--text-primary)] leading-none"
              style={{ fontSize: 17, letterSpacing: "-0.02em" }}
            >
              {title}
            </h1>
            {subtitle && (
              <span className="text-xs font-medium text-[var(--text-muted)] hidden sm:inline">
                {subtitle}
              </span>
            )}
          </div>
        </div>

        {action}

        <div className="hidden sm:block"><PeriodSelector /></div>

        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative hidden md:flex items-center">
            <Search
              size={13}
              className="absolute left-3 pointer-events-none text-[var(--text-muted)]"
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "rgba(37,99,235,0.5)";
                if (results.length > 0) setOpen(true);
              }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-strong)"; }}
              placeholder="Buscar lead..."
              aria-label="Buscar lead"
              className="pl-8 pr-7 py-1.5 text-[13px] rounded-lg w-48 focus:outline-none focus:w-56 transition-all duration-200"
              style={{
                background: "var(--bg-subtle)",
                border: "1px solid var(--border-strong)",
                color: "var(--text-primary)",
                fontFamily: "inherit",
              }}
            />
            {query && (
              <button
                onClick={() => { setQuery(""); setResults([]); setOpen(false); inputRef.current?.focus(); }}
                aria-label="Limpar busca"
                className="absolute right-2 text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors focus-visible:outline-none rounded"
              >
                <X size={12} />
              </button>
            )}

            {/* Search dropdown */}
            {open && (
              <div
                ref={dropdownRef}
                role="listbox"
                className="absolute top-full mt-1.5 left-0 w-72 rounded-xl overflow-hidden z-50"
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--border-strong)",
                  boxShadow: "var(--shadow-lg)",
                }}
              >
                {loading ? (
                  <div className="px-4 py-3 text-xs text-[var(--text-muted)]">Buscando...</div>
                ) : results.length === 0 ? (
                  <div className="px-4 py-3 text-xs text-[var(--text-muted)]">Nenhum resultado</div>
                ) : (
                  <ul className="py-1">
                    {results.map((lead) => (
                      <li key={lead.id}>
                        <button
                          onMouseDown={() => { setSelected(lead); setOpen(false); setQuery(""); }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[var(--bg-subtle)] focus-visible:outline-none focus-visible:bg-[var(--bg-subtle)]"
                        >
                          <div
                            className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                            style={{ background: "#2563eb" }}
                          >
                            <span className="text-white text-[9px] font-bold">
                              {getInitials(lead.name ?? "?")}
                            </span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12.5px] font-semibold truncate flex items-center gap-1 text-[var(--text-primary)]">
                              <User size={10} className="text-[var(--text-muted)] shrink-0" />
                              {lead.name ?? "Sem nome"}
                            </p>
                            {lead.company && (
                              <p className="text-[11px] truncate flex items-center gap-1 mt-0.5 text-[var(--text-muted)]">
                                <Building2 size={9} className="shrink-0" />
                                {lead.company}
                              </p>
                            )}
                          </div>
                          <span
                            className="text-[10px] font-medium px-1.5 py-0.5 rounded font-data shrink-0 text-[var(--text-secondary)]"
                            style={{
                              background: "var(--bg-subtle)",
                              border: "1px solid var(--border)",
                            }}
                          >
                            {lead.lead_score ?? 0}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* Avatar */}
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(145deg,#2563eb,#1d4ed8)",
              boxShadow: "0 2px 6px rgba(37,99,235,0.3)",
            }}
          >
            <span className="text-white text-[10px] font-bold">{initials}</span>
          </div>
        </div>
      </header>

      <LeadDrawer lead={selectedLead} onClose={() => setSelected(null)} />
    </>
  );
}
