"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Eye, EyeOff, Loader2, ArrowRight, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { motion, AnimatePresence } from "framer-motion";
import { TurnstileWidget, type TurnstileWidgetHandle } from "@/components/ui/turnstile-widget";

type Tab = "login" | "signup";

// Only set once a Turnstile site key exists (team hasn't created one yet) —
// when unset, the widget is skipped entirely and signup behaves as before.
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

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

function EyeBtn({ show, toggle }: { show: boolean; toggle: () => void }) {
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={show ? "Ocultar senha" : "Mostrar senha"}
      className="text-white/25 hover:text-white/60 transition-colors duration-150 p-1"
    >
      {show ? <EyeOff size={14} strokeWidth={2} /> : <Eye size={14} strokeWidth={2} />}
    </button>
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
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileWidgetHandle>(null);

  function reset() {
    setEmail(""); setPw(""); setConfirmPw("");
    setError(""); setDone(false); setCaptchaToken(null);
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
    if (TURNSTILE_SITE_KEY && !captchaToken) {
      setError("Complete a verificação de segurança.");
      return;
    }
    setLoading(true); setError("");
    const { error: err } = await createClient().auth.signUp({
      email,
      password: pw,
      ...(TURNSTILE_SITE_KEY && captchaToken
        ? { options: { captchaToken } }
        : {}),
    });
    if (err) {
      setError(err.message);
      setLoading(false);
      // Turnstile tokens are single-use — reset so the user can retry.
      setCaptchaToken(null);
      turnstileRef.current?.reset();
    }
    else { setDone(true); setLoading(false); }
  }

  return (
    <div className="min-h-screen w-full lg:grid lg:grid-cols-[1.05fr_1fr]" style={{ background: "#030813" }}>
      {/* Painel da marca. Some abaixo de `lg`: num celular ele empurraria o
          formulário para fora da primeira tela, e entrar é o que importa ali. */}
      <aside
        className="relative hidden flex-col justify-between overflow-hidden p-12 lg:flex"
        style={{ background: "linear-gradient(155deg, #172959 0%, #0f1c3d 55%, #0a1229 100%)" }}
      >
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.022) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.022) 1px, transparent 1px)",
            backgroundSize: "72px 72px",
          }}
        />
        <div
          className="pointer-events-none absolute -left-24 -top-24 h-[420px] w-[420px] rounded-full"
          style={{ background: "radial-gradient(circle, rgba(78,167,255,0.18) 0%, transparent 70%)" }}
        />

        <Image
          src="/logo-arcil-full.png"
          alt="Grupo Arcil"
          width={420}
          height={132}
          priority
          className="relative z-10 h-auto w-[240px] object-contain"
        />

        <div className="relative z-10 max-w-[26rem]">
          <h1 className="text-[34px] font-extrabold leading-[1.12] tracking-tight text-white">
            A operação inteira em uma tela só.
          </h1>
          <p className="mt-4 text-[14px] leading-relaxed text-[#a8bfd4]">
            Leads, agentes de IA, cobranças, atendimento e estoque no mesmo lugar — atualizando em tempo real conforme a
            operação acontece.
          </p>
          <ul className="mt-8 space-y-3">
            {["Agentes de IA monitorados por segmento", "Cobrança acompanhada boleto a boleto", "Painel de TV para a visão do dia"].map(
              (line) => (
                <li key={line} className="flex items-center gap-3 text-[13px] font-medium text-[#d7e4f1]">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "#4ea7ff" }} />
                  {line}
                </li>
              )
            )}
          </ul>
        </div>

        <p className="relative z-10 text-[10px] font-bold uppercase tracking-[0.28em]" style={{ color: "rgba(168,191,212,0.45)" }}>
          Fluxo · Automações com IA
        </p>
      </aside>

      <div className="relative flex w-full items-center justify-center py-16 lg:py-0">
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
          className="rounded-2xl overflow-hidden border"
          style={{
            background: "#050b14",
            borderColor: "#1f2b3d",
            boxShadow: "0 4px 6px rgba(0,0,0,0.4), 0 24px 48px rgba(0,0,0,0.6)",
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
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="flex flex-col items-center gap-3"
            >
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center border"
                style={{ background: "#0b1528", borderColor: "#1f2b3d" }}
              >
                <Image src="/logo-icon.png" alt="Grupo Arcil" width={80} height={80} priority className="w-10 h-10 object-contain" />
              </div>
              <div className="text-center">
                <p className="text-[26px] font-extrabold leading-none tracking-tight" style={{ color: "#a9c9ff" }}>
                  ARCIL
                </p>
                <p
                  className="mt-2 text-[10px] font-bold"
                  style={{ color: "rgba(148,178,230,0.5)", letterSpacing: "0.32em" }}
                >
                  OPERACIONAL COMERCIAL
                </p>
              </div>
            </motion.div>

            {/* ── Divider ── */}
            <div
              style={{ height: 1, background: "rgba(255,255,255,0.05)" }}
            />

            {/* ── Tab switcher ── */}
            <div className="flex gap-0">
              {(["login", "signup"] as Tab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => switchTab(t)}
                  className="relative flex-1 pb-2.5 text-[12px] font-semibold transition-colors duration-150 hover:text-white"
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
                      style={{ height: 1, background: "#4c93ff" }}
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
                    whileHover={{ y: -1, boxShadow: "0 1px 0 rgba(255,255,255,0.12) inset, 0 6px 22px rgba(37,99,235,0.45)" }}
                    whileTap={{ scale: 0.987, y: 0 }}
                    className="w-full py-3 rounded-lg text-[13px] font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
                    style={{
                      background: "linear-gradient(180deg, #4c93ff 0%, #2f6fe0 100%)",
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

                        {TURNSTILE_SITE_KEY && (
                          <TurnstileWidget
                            ref={turnstileRef}
                            siteKey={TURNSTILE_SITE_KEY}
                            onVerify={(token) => { setCaptchaToken(token); setError(""); }}
                            onExpire={() => setCaptchaToken(null)}
                          />
                        )}

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
                          disabled={loading || (!!TURNSTILE_SITE_KEY && !captchaToken)}
                          whileHover={{ y: -1, boxShadow: "0 1px 0 rgba(255,255,255,0.12) inset, 0 6px 22px rgba(37,99,235,0.45)" }}
                          whileTap={{ scale: 0.987, y: 0 }}
                          className="w-full py-3 rounded-lg text-[13px] font-bold text-white flex items-center justify-center gap-2 disabled:opacity-50 transition-opacity"
                          style={{
                            background: "linear-gradient(180deg, #4c93ff 0%, #2f6fe0 100%)",
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
    </div>
  );
}
