import React, { useState } from "react";
import Logo from "../components/Logo";
import { useAuth } from "../auth";
import { api, formatErr } from "../api";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";

export default function ForcePassword() {
  const { user, setUser, logout } = useAuth();
  const [f, setF] = useState({ current_password: "", new_password: "", confirm: "" });
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (f.new_password !== f.confirm) return toast.error("Le password non coincidono");
    if (f.new_password.length < 6) return toast.error("Minimo 6 caratteri");
    if (f.new_password === f.current_password) return toast.error("Scegli una password diversa da quella provvisoria");
    setBusy(true);
    try {
      await api.post("/me/password", { current_password: f.current_password, new_password: f.new_password });
      toast.success("Password impostata, benvenuto!");
      setUser({ ...user, must_change_password: false });
    } catch (e) { toast.error(formatErr(e)); }
    setBusy(false);
  };

  const field = (k, label, testid) => (
    <div>
      <label className="text-xs uppercase tracking-widest text-zinc-400 font-mono-num block mb-2">{label}</label>
      <input type="password" required value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} data-testid={testid}
             className="w-full bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded-lg px-4 py-3 text-base text-white" />
    </div>
  );

  return (
    <div className="min-h-screen grain flex items-center justify-center p-6">
      <div className="relative z-10 w-full max-w-md">
        <div className="flex flex-col items-center mb-6">
          <Logo size={88} className="mb-3" />
          <h1 className="font-display font-black text-3xl uppercase tracking-widest text-white text-center">Ciao, {user?.name?.split(" ")[0]}</h1>
          <p className="text-sm text-zinc-400 text-center mt-2">Prima di vedere la tua scheda, scegli una password personale al posto di quella provvisoria.</p>
        </div>
        <form onSubmit={submit} className="lau-card p-6 sm:p-8 space-y-4 lau-in" data-testid="force-password-form">
          <div className="flex items-center gap-2 text-yellow-400">
            <KeyRound size={18} />
            <h2 className="font-display font-bold uppercase tracking-wider text-white">Imposta la tua password</h2>
          </div>
          {field("current_password", "Password provvisoria (ricevuta via email)", "force-pwd-current")}
          {field("new_password", "Nuova password", "force-pwd-new")}
          {field("confirm", "Conferma nuova password", "force-pwd-confirm")}
          <button disabled={busy} data-testid="force-pwd-submit" className="lau-gold-btn w-full py-3 rounded-lg text-base">
            {busy ? "Salvo..." : "Salva e continua"}
          </button>
          <button type="button" onClick={logout} data-testid="force-pwd-logout" className="w-full text-xs text-zinc-500 hover:text-zinc-300 py-1">Esci</button>
        </form>
      </div>
    </div>
  );
}
