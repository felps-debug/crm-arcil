"use client";

import { useState } from "react";
import { Eye, EyeOff, Loader2, Wind, ArrowRight, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";

type Tab = "login" | "signup";

/* ─── Focused Input ───────────────────────────────────────────────── */
interface FieldProps {
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete?: string;
  required?: boolean;
  right?: React.ReactNode;
}

function Field({ label, type, value, onChange, autoComplete, required, right }: FieldProps) {
  const [focused, setFocused] = useState(false);
  const filled = value.length > 0;

  return (
    <div className="space-y-1.5">
      <label
        className="block text-[11px] font-semibold uppercase tracking-widest transition-colors duration-150"
        style={{ color: focused ? "rgba(96,165,250,0.9)" : "rgba(248,250,252,0.35)" }}
      >
        {label}
      </label>
      <div
        className="relative flex items-center rounded-lg overflow-hidden transition-all duration-150"
        style={{
          background: focused || filled ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.025)",
          boxShadow: focused
            ? "0 0 0 1px rgba(37,99,235,0.7), inset 0 1px 0 rgba(255,255,255,0.04)"
            : "0 0 0 1px rgba(255,255,255,0.07), inset 0 1px 0 rgba(255,255,255,0.03)",
        }}
      >
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          autoComplete={autoComplete}
          required={required}
          className="w-full px-4 py-3 bg-transparent text-[13.5px] font-medium text-white placeholder:text-white/20 focus:outline-none"
          style={{ letterSpacing: "0.01em" }}
        />
        {right && (
          <div className="absolute right-3.5">{right}</div>
        )}
      </div>
    </div>
  );
}

/* ─── Page ────────────────────────────────────────────────────────── */
export default function LoginPage() {
  const [tab, setTab] = useState<Tab>("login");
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  function reset() {
    setEmail(""); setPw(""); setConfirmPw("");
    setError(""); setDone(false);
  }

  function switchTab(t: Tab) { setTab(t); reset(); }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const { error: err } = await createClient().auth.signInWithPassword({ email, password: pw });
    if (err) { setError(err.message); setLoading(false); }
    else window.location.href = "/";
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (pw !== confirmPw) { setError("As senhas não coincidem."); return; }
    if (pw.length < 6) { setError("Mínimo 6 caracteres."); return; }
    setLoading(true); setError("");
    const { error: err } = await createClient().auth.signUp({ email, password: pw });
    if (err) { setError(err.message); setLoading(false); }
    else { setDone(true); setLoading(false); }
  }

  const EyeBtn = ({ show, toggle }: { show: boolean; toggle: () => void }) => (
    <button
      type="button"
      onClick={toggle}
      aria-label={show ? "Ocultar senha" : "Mostrar senha"}
      className="text-white/25 hover:text-white/60 transition-colors duration-150 p-1"
    >
      {show ? <EyeOff size={14} strokeWidth={2} /> : <Eye size={14} strokeWidth={2} />}
    </button>
  );

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center"
      style={{ background: "#030813" }}
    >
      {/* Subtle top spotlight — enterprise restraint, not consumer glow */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 pointer-events-none"
        style={{
          width: 1000,
          height: 600,
          background:
            "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(37,99,235,0.09) 0%, transparent 100%)",
        }}
      />

      {/* Micro grid */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.012) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.012) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      {/* Card */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 w-full mx-4"
        style={{ maxWidth: 400 }}
      >
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            background: "linear-gradient(180deg, #0b1528 0%, #080f1f 100%)",
            boxShadow:
              "0 0 0 1px rgba(255,255,255,0.07), 0 4px 6px rgba(0,0,0,0.4), 0 24px 48px rgba(0,0,0,0.6)",
          }}
        >
          {/* Top rule — single blue accent line */}
          <div
            style={{
              height: 1,
              background:
                "linear-gradient(90deg, transparent 0%, rgba(37,99,235,0.8) 50%, transparent 100%)",
            }}
          />

          <div className="px-9 pt-9 pb-8 space-y-7">

            {/* ── Logo ── */}
            <div className="flex flex-col items-center gap-3.5">
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center"
                style={{
                  background: "linear-gradient(145deg, #1d4ed8, #1e40af)",
                  boxShadow: "0 8px 24px rgba(29,78,216,0.4), inset 0 1px 0 rgba(255,255,255,0.12)",
                }}
              >
                <Wind size={22} className="text-white" strokeWidth={2.2} />
              </div>
              <div className="text-center">
                <p
                  className="text-white font-black text-xl leading-none"
                  style={{ letterSpacing: "0.12em" }}
                >
                  ARCIL
                </p>
                <p
                  className="text-[9px] font-bold mt-1.5"
                  style={{ color: "rgba(96,165,250,0.4)", letterSpacing: "0.3em" }}
                >
                  CRM
                </p>
              </div>
            </div>

            {/* ── Divider ── */}
            <div
              style={{ height: 1, background: "rgba(255,255,255,0.05)" }}
            />

            {/* ── Tab switcher ── */}
            <div className="flex gap-0">
              {(["login", "signup"] as Tab[]).map((t, i) => (
                <button
                  key={t}
                  onClick={() => switchTab(t)}
                  className="relative flex-1 pb-2.5 text-[12px] font-semibold transition-colors duration-150"
                  style={{
                    color: tab === t ? "#F8FAFC" : "rgba(248,250,252,0.3)",
                    borderBottom: `1px solid ${tab === t ? "transparent" : "rgba(255,255,255,0.07)"}`,
                  }}
                >
                  {t === "login" ? "Entrar" : "Criar conta"}
                  {tab === t && (
                    <motion.div
                      layoutId="tab-line"
                      className="absolute bottom-0 left-0 right-0"
                      style={{ height: 1, background: "#2563eb" }}
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                </button>
              ))}
            </div>

            {/* ── Form area ── */}
            <AnimatePresence mode="wait">
              {tab === "login" ? (
                <motion.form
                  key="login"
                  onSubmit={handleLogin}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ duration: 0.16 }}
                  className="space-y-4"
                >
                  <Field
                    label="E-mail"
                    type="email"
                    value={email}
                    onChange={setEmail}
                    autoComplete="email"
                    required
                  />
                  <Field
                    label="Senha"
                    type={showPw ? "text" : "password"}
                    value={pw}
                    onChange={setPw}
                    autoComplete="current-password"
                    required
                    right={<EyeBtn show={showPw} toggle={() => setShowPw(!showPw)} />}
                  />

                  <AnimatePresence>
                    {error && (
                      <motion.p
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="text-[11.5px] font-medium overflow-hidden"
                        style={{ color: "#f87171" }}
                      >
                        {error}
                      </motion.p>
                    )}
                  </AnimatePresence>

                  <motion.button
                    type="submit"
                    disabled={loading}
                    whileTap={{ scale: 0.987 }}
                    className="w-full py-3 rounded-lg text-[13px] font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
                    style={{
                      background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)",
                      boxShadow: "0 1px 0 rgba(255,255,255,0.1) inset, 0 4px 16px rgba(37,99,235,0.35)",
                    }}
                  >
                    {loading ? (
                      <><Loader2 size={14} className="animate-spin" />Entrando...</>
                    ) : (
                      <>Entrar <ArrowRight size={13} strokeWidth={2.5} /></>
                    )}
                  </motion.button>
                </motion.form>

              ) : (
                <motion.div
                  key="signup"
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  transition={{ duration: 0.16 }}
                >
                  <AnimatePresence mode="wait">
                    {done ? (
                      <motion.div
                        key="success"
                        initial={{ opacity: 0, scale: 0.97 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ type: "spring", stiffness: 300, damping: 25 }}
                        className="flex flex-col items-center gap-4 py-8 text-center"
                      >
                        <motion.div
                          initial={{ scale: 0 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 400, damping: 20, delay: 0.08 }}
                          className="w-12 h-12 rounded-xl flex items-center justify-center"
                          style={{
                            background: "rgba(5,150,105,0.12)",
                            boxShadow: "0 0 0 1px rgba(5,150,105,0.25)",
                          }}
                        >
                          <CheckCircle2 size={22} style={{ color: "#34d399" }} />
                        </motion.div>
                        <div className="space-y-1">
                          <p className="text-white font-bold text-sm">Conta criada</p>
                          <p
                            className="text-[11.5px] leading-relaxed"
                            style={{ color: "rgba(248,250,252,0.35)" }}
                          >
                            Verifique seu e-mail para confirmar
                          </p>
                        </div>
                        <button
                          onClick={() => switchTab("login")}
                          className="text-[12px] font-semibold flex items-center gap-1 transition-colors duration-150"
                          style={{ color: "#60a5fa" }}
                        >
                          Ir para o login <ArrowRight size={11} />
                        </button>
                      </motion.div>

                    ) : (
                      <motion.form
                        key="form"
                        onSubmit={handleSignup}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-4"
                      >
                        <Field
                          label="E-mail"
                          type="email"
                          value={email}
                          onChange={setEmail}
                          autoComplete="email"
                          required
                        />
                        <Field
                          label="Senha"
                          type={showPw ? "text" : "password"}
                          value={pw}
                          onChange={setPw}
                          autoComplete="new-password"
                          required
                          right={<EyeBtn show={showPw} toggle={() => setShowPw(!showPw)} />}
                        />
                        <Field
                          label="Confirmar senha"
                          type={showConfirm ? "text" : "password"}
                          value={confirmPw}
                          onChange={setConfirmPw}
                          autoComplete="new-password"
                          required
                          right={<EyeBtn show={showConfirm} toggle={() => setShowConfirm(!showConfirm)} />}
                        />

                        <AnimatePresence>
                          {error && (
                            <motion.p
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              exit={{ opacity: 0, height: 0 }}
                              className="text-[11.5px] font-medium overflow-hidden"
                              style={{ color: "#f87171" }}
                            >
                              {error}
                            </motion.p>
                          )}
                        </AnimatePresence>

                        <motion.button
                          type="submit"
                          disabled={loading}
                          whileTap={{ scale: 0.987 }}
                          className="w-full py-3 rounded-lg text-[13px] font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
                          style={{
                            background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)",
                            boxShadow: "0 1px 0 rgba(255,255,255,0.1) inset, 0 4px 16px rgba(37,99,235,0.35)",
                          }}
                        >
                          {loading ? (
                            <><Loader2 size={14} className="animate-spin" />Criando...</>
                          ) : (
                            <>Criar conta <ArrowRight size={13} strokeWidth={2.5} /></>
                          )}
                        </motion.button>
                      </motion.form>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Footer ── */}
          <div
            className="px-9 py-4 flex items-center justify-center"
            style={{ borderTop: "1px solid rgba(255,255,255,0.04)" }}
          >
            <p
              className="text-[9.5px] font-semibold uppercase"
              style={{ color: "rgba(255,255,255,0.12)", letterSpacing: "0.25em" }}
            >
              Fluxo · Automações com IA
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
