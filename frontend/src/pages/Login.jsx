import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import Logo from "../components/Logo";
import { useAuth } from "../auth";
import { formatErr } from "../api";
import { toast } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setErr("");
    try {
      const u = await login(email, password);
      toast.success(`Benvenuto ${u.name}`);
      nav(u.role === "admin" ? "/admin" : "/");
    } catch (e) {
      setErr(formatErr(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grain flex items-center justify-center p-6">
      <div className="relative z-10 w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <Logo size={112} className="mb-4" />
          <h1 className="font-display font-black text-4xl sm:text-5xl uppercase tracking-widest text-white">
            Metodo <span className="text-yellow-400">LAU</span>
          </h1>
          <p className="text-xs uppercase tracking-[0.35em] text-yellow-400/80 font-mono-num mt-2">
            Forgia il tuo corpo · Forgia la tua mente
          </p>
        </div>

        <form onSubmit={submit} className="lau-card p-6 sm:p-8 space-y-5 lau-in">
          <div>
            <label className="text-xs uppercase tracking-widest text-zinc-400 font-mono-num block mb-2">Email</label>
            <input
              type="email" required autoFocus
              value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="tuaemail@dominio.it"
              data-testid="login-email-input"
              className="w-full bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded-lg px-4 py-3 text-base text-white placeholder:text-zinc-600"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-zinc-400 font-mono-num block mb-2">Password</label>
            <input
              type="password" required
              value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              data-testid="login-password-input"
              className="w-full bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded-lg px-4 py-3 text-base text-white placeholder:text-zinc-600"
            />
          </div>
          {err && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2" data-testid="login-error">
              {err}
            </div>
          )}
          <button
            type="submit" disabled={loading}
            data-testid="login-submit-btn"
            className="lau-gold-btn w-full py-3 rounded-lg text-base"
          >
            {loading ? "Accesso..." : "Entra"}
          </button>
          <p className="text-xs text-zinc-500 text-center leading-relaxed">
            L'accesso è riservato agli atleti registrati dal Personal Trainer.<br/>
            Contatta il tuo trainer per ricevere le credenziali.
          </p>
        </form>
      </div>
    </div>
  );
}
