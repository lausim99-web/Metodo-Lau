import React, { useState } from "react";
import { Eye, EyeOff, Mail, Lock, ArrowRight, Check } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { formatErr } from "../api";
import { toast } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [forgot, setForgot] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setErr("");
    try {
      const u = await login(email, password, remember);
      toast.success(`Benvenuto ${u.role === "admin" ? "Personal Trainer" : ""} ${u.name.split(" ")[0]}`);
      nav(u.role === "admin" ? "/admin" : "/", { replace: true });
    } catch (e2) {
      setErr(formatErr(e2));
    } finally {
      setLoading(false);
    }
  };

  const field = "w-full bg-black/70 border-2 border-yellow-500/70 focus:border-yellow-400 focus:shadow-[0_0_0_3px_rgba(245,197,24,0.15)] outline-none rounded-xl pl-11 pr-4 py-3.5 text-base text-white placeholder:text-zinc-500 transition";

  return (
    <div className="lau-login min-h-screen flex items-center justify-center px-4 py-8 sm:py-12">
      <div className="relative z-10 w-full max-w-[440px] flex flex-col items-center">
        <img src="/logo-full.png" alt="METODOLAU" data-testid="login-logo"
             className="w-[min(78vw,340px)] drop-shadow-[0_18px_40px_rgba(245,197,24,0.25)] lau-in" />
        <p className="mt-3 mb-7 text-center text-[10px] sm:text-xs uppercase tracking-[0.22em] sm:tracking-[0.32em] text-yellow-400 font-mono-num whitespace-nowrap" data-testid="login-tagline">
          Forgia il tuo corpo - Forgia la tua mente
        </p>

        <form onSubmit={submit} data-testid="login-form"
              className="w-full rounded-2xl border border-yellow-500/50 bg-[#0c0c0f]/85 backdrop-blur-md shadow-[0_0_60px_rgba(245,197,24,0.12),inset_0_1px_0_rgba(255,255,255,0.04)] p-6 sm:p-8 space-y-5 lau-in">
          <div>
            <label className="text-xs uppercase tracking-[0.25em] text-white font-mono-num block mb-2">Email</label>
            <div className="relative">
              <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-yellow-400 pointer-events-none" />
              <input type="email" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)}
                     placeholder="tua@email.it" data-testid="login-email-input" className={field} />
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.25em] text-white font-mono-num block mb-2">Password</label>
            <div className="relative">
              <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-yellow-400 pointer-events-none" />
              <input type={showPw ? "text" : "password"} required value={password} onChange={(e) => setPassword(e.target.value)}
                     placeholder="••••••••" data-testid="login-password-input" className={`${field} pr-12`} />
              <button type="button" onClick={() => setShowPw(!showPw)} data-testid="login-password-toggle"
                      aria-label={showPw ? "Nascondi password" : "Mostra password"}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-yellow-400 p-1">
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none" data-testid="login-remember-label">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)}
                   data-testid="login-remember-checkbox" className="sr-only peer" />
            <span className="w-7 h-7 rounded-md bg-yellow-400 flex items-center justify-center text-black peer-[&:not(:checked)]:bg-transparent peer-[&:not(:checked)]:border-2 peer-[&:not(:checked)]:border-yellow-500/70 peer-[&:not(:checked)]:text-transparent transition">
              <Check size={18} strokeWidth={3} />
            </span>
            <span className="text-base text-white">Rimani collegato <span className="text-zinc-400 text-sm">(30 giorni)</span></span>
          </label>

          {err && (
            <div className="text-sm text-red-300 bg-red-500/10 border border-red-500/40 rounded-lg px-3 py-2" data-testid="login-error">{err}</div>
          )}

          <button type="submit" disabled={loading} data-testid="login-submit-btn"
                  className="w-full py-4 rounded-full bg-yellow-400 hover:bg-yellow-300 active:scale-[0.99] text-black font-display font-black text-xl uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-[0_10px_30px_rgba(245,197,24,0.35)] transition disabled:opacity-60">
            {loading ? "Accesso..." : <>Entra <ArrowRight size={24} strokeWidth={3} /></>}
          </button>

          <div className="text-center space-y-2 pt-1">
            <button type="button" onClick={() => setForgot(!forgot)} data-testid="login-forgot-btn"
                    className="text-sm text-zinc-200 hover:text-yellow-400 underline-offset-4 hover:underline">
              Password dimenticata?
            </button>
            {forgot && (
              <p className="text-xs text-yellow-200/90 bg-yellow-400/10 border border-yellow-500/30 rounded-lg px-3 py-2" data-testid="login-forgot-help">
                Scrivi al tuo Personal Trainer: può reimpostarti la password in un attimo.
              </p>
            )}
            <p className="text-xs text-zinc-400 leading-relaxed" data-testid="login-help">
              L'accesso è riservato agli utenti registrati dal Personal Trainer.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
}
