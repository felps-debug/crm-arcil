"use client";

import { Search, X, Building2, User } from "lucide-react";
import { getInitials } from "@/lib/utils";
import { PeriodSelector } from "@/components/ui/period-selector";
import { LeadDrawer } from "@/components/ui/lead-drawer";
import { getLeadsBySearch } from "@/lib/supabase/queries";
import type { Lead } from "@/types";
import { useState, useEffect, useRef, useCallback } from "react";

interface HeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function Header({ title, subtitle, action }: HeaderProps) {
  const [query,       setQuery]       = useState("");
  const [results,     setResults]     = useState<Lead[]>([]);
  const [loading,     setLoading]     = useState(false);
  const [open,        setOpen]        = useState(false);
  const [selectedLead, setSelected]   = useState<Lead | null>(null);
  const inputRef    = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        inputRef.current && !inputRef.current.contains(e.target as Node)
      ) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  return (
    <>
      <div className="sticky top-0 z-30">
        <header
          className="h-16 flex items-center px-6 gap-4 header-glass"
          style={{
            borderBottom: "1px solid var(--border)",
          }}
        >
          {/* Title */}
          <div className="flex-1 min-w-0">
            <h1
              className="font-extrabold text-[var(--text-primary)] leading-none"
              style={{ fontSize: 18, letterSpacing: "-0.02em" }}
            >
              {title}
            </h1>
            {subtitle && (
              <p
                className="mt-1.5 font-medium"
                style={{ fontSize: 13, color: "var(--text-muted)" }}
              >
                {subtitle}
              </p>
            )}
          </div>

          {action}

          <PeriodSelector />

          <div className="flex items-center gap-1">
            {/* Search */}
            <div className="relative hidden md:flex items-center">
              <Search size={13} className="absolute left-3 pointer-events-none" style={{ color: "var(--text-muted)" }} />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => { if (results.length > 0) setOpen(true); }}
                placeholder="Buscar lead..."
                className="pl-8 pr-7 py-2 text-[13px] rounded-xl w-52 focus:outline-none focus:w-60 transition-all duration-200"
                style={{
                  background: "var(--bg-subtle)",
                  border: "1px solid var(--border)",
                  color: "var(--text-primary)",
                  fontFamily: "inherit",
                }}
                onMouseEnter={(e) => { (e.currentTarget.style.borderColor = "var(--border-strong)"); }}
                onMouseLeave={(e) => { (e.currentTarget.style.borderColor = "var(--border)"); }}
              />
              {query && (
                <button
                  onClick={() => { setQuery(""); setResults([]); setOpen(false); inputRef.current?.focus(); }}
                  aria-label="Limpar busca"
                  className="absolute right-2.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 rounded"
                  style={{ color: "var(--text-muted)" }}
                >
                  <X size={12} />
                </button>
              )}

              {/* Dropdown */}
              {open && (
                <div
                  ref={dropdownRef}
                  className="absolute top-full mt-1.5 left-0 w-72 rounded-xl overflow-hidden z-50"
                  style={{
                    background: "white",
                    border: "1px solid var(--border)",
                    boxShadow: "var(--shadow-lg)",
                  }}
                >
                  {loading ? (
                    <div className="px-4 py-3 text-[12px]" style={{ color: "var(--text-muted)" }}>
                      Buscando...
                    </div>
                  ) : results.length === 0 ? (
                    <div className="px-4 py-3 text-[12px]" style={{ color: "var(--text-muted)" }}>
                      Nenhum resultado
                    </div>
                  ) : (
                    <ul className="py-1">
                      {results.map((lead) => (
                        <li key={lead.id}>
                          <button
                            onMouseDown={() => { setSelected(lead); setOpen(false); setQuery(""); }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors duration-100"
                            style={{ background: "transparent" }}
                            onMouseEnter={(e) => { (e.currentTarget.style.background = "var(--bg-subtle)"); }}
                            onMouseLeave={(e) => { (e.currentTarget.style.background = "transparent"); }}
                          >
                            <div
                              className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                              style={{ background: "#2563eb" }}
                            >
                              <span className="text-white text-[9px] font-bold">
                                {getInitials(lead.name ?? "?")}
                              </span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p
                                className="text-[12.5px] font-semibold truncate flex items-center gap-1"
                                style={{ color: "var(--text-primary)" }}
                              >
                                <User size={10} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                                {lead.name ?? "Sem nome"}
                              </p>
                              {lead.company && (
                                <p
                                  className="text-[11px] truncate flex items-center gap-1 mt-0.5"
                                  style={{ color: "var(--text-muted)" }}
                                >
                                  <Building2 size={9} style={{ flexShrink: 0 }} />
                                  {lead.company}
                                </p>
                              )}
                            </div>
                            <span
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded font-data flex-shrink-0"
                              style={{
                                background: "var(--bg-subtle)",
                                color: "var(--text-secondary)",
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
              className="w-9 h-9 rounded-xl flex items-center justify-center ml-1 flex-shrink-0 ring-2 ring-white/80"
              style={{
                background: "linear-gradient(145deg,#2563eb,#1d4ed8)",
                boxShadow: "0 2px 8px rgba(37,99,235,0.35)",
              }}
            >
              <span className="text-white text-[10.5px] font-bold">{getInitials("Admin ARCIL")}</span>
            </div>
          </div>
        </header>

        {/* Accent rule */}
        <div
          className="h-[3px]"
          style={{ background: "linear-gradient(90deg, #2563eb, #7c3aed, #06b6d4, #2563eb)" }}
        />
      </div>

      <LeadDrawer lead={selectedLead} onClose={() => setSelected(null)} />
    </>
  );
}
