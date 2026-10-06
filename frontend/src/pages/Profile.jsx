import React, { useState } from "react";
import AppShell from "../components/AppShell";
import { useAuth } from "../auth";
import { api, formatErr } from "../api";
import { toast } from "sonner";
import { KeyRound, User, Mail } from "lucide-react";

export default function Profile() {
  const { user, setUser } = useAuth();
  const [f, setF] = useState({ current_password: "", new_password: "", confirm: "" });
  const [em, setEm] = useState({ new_email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [busyEm, setBusyEm] = useState(false);

  const submitEmail = async (e) => {
    e.preventDefault();
    setBusyEm(true);
    try {
      const r = await api.post("/me/email", em);
      setUser({ ...user, email: r.data.email });
      toast.success("Email aggiornata — usala al prossimo accesso");
      setEm({ new_email: "", password: "" });
    } catch (e) { toast.error(formatErr(e)); }
    setBusyEm(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (f.new_password !== f.confirm) return toast.error("Le password non coincidono");
    if (f.new_password.length < 6) return toast.error("Minimo 6 caratteri");
    setBusy(true);
    try {
      await api.post("/me/password", { current_password: f.current_password, new_password: f.new_password });
      toast.success("Password aggiornata");
      setF({ current_password: "", new_password: "", confirm: "" });
    } catch (e) { toast.error(formatErr(e)); }
    setBusy(false);
  };

  return (
    <AppShell title="Profilo">
      <div className="max-w-xl space-y-6">
        <div className="lau-card p-5 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-yellow-400/15 border border-yellow-500/40 flex items-center justify-center">
            <User className="text-yellow-400" />
          </div>
          <div>
            <div className="font-display font-black text-xl uppercase text-white">{user?.name}</div>
            <div className="text-xs text-zinc-400">{user?.email}</div>
            <div className="text-[10px] uppercase tracking-widest text-yellow-400 font-mono-num mt-1">
              {user?.role === "admin" ? "Personal Trainer" : "Atleta"}
            </div>
          </div>
        </div>

        <form onSubmit={submit} className="lau-card p-5 space-y-4">
          <div className="flex items-center gap-2 text-yellow-400">
            <KeyRound size={18} />
            <h2 className="font-display font-bold uppercase tracking-wider text-white">Cambia Password</h2>
          </div>
          {["current_password", "new_password", "confirm"].map((k, i) => (
            <div key={k}>
              <label className="text-xs uppercase tracking-widest text-zinc-400 font-mono-num block mb-2">
                {k === "current_password" ? "Password attuale" : k === "new_password" ? "Nuova password" : "Conferma nuova password"}
              </label>
              <input
                type="password" required minLength={k === "current_password" ? 1 : 6}
                value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}
                data-testid={`pwd-${k}`}
                className="w-full bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded-lg px-4 py-3 text-base text-white"
              />
            </div>
          ))}
          <button disabled={busy} data-testid="pwd-submit" className="lau-gold-btn w-full py-3 rounded-lg">
            {busy ? "Aggiorno..." : "Aggiorna Password"}
          </button>
        </form>

        <form onSubmit={submitEmail} className="lau-card p-5 space-y-4">
          <div className="flex items-center gap-2 text-yellow-400">
            <Mail size={18} />
            <h2 className="font-display font-bold uppercase tracking-wider text-white">Cambia Email</h2>
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-zinc-400 font-mono-num block mb-2">Nuova email</label>
            <input type="email" required value={em.new_email} onChange={(e) => setEm({ ...em, new_email: e.target.value })}
                   data-testid="email-new" className="w-full bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded-lg px-4 py-3 text-base text-white" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-widest text-zinc-400 font-mono-num block mb-2">Password attuale (conferma)</label>
            <input type="password" required value={em.password} onChange={(e) => setEm({ ...em, password: e.target.value })}
                   data-testid="email-password" className="w-full bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded-lg px-4 py-3 text-base text-white" />
          </div>
          <button disabled={busyEm} data-testid="email-submit" className="lau-gold-btn w-full py-3 rounded-lg">
            {busyEm ? "Aggiorno..." : "Aggiorna Email"}
          </button>
        </form>
      </div>
    </AppShell>
  );
}
