import React, { useEffect, useState } from "react";
import { api, formatErr } from "../api";
import { toast } from "sonner";
import { CalendarSync, RefreshCw, Save, AlertTriangle } from "lucide-react";

export default function CalendarSyncCard() {
  const [url, setUrl] = useState("");
  const [info, setInfo] = useState({});
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const load = () => api.get("/admin/calendar").then((r) => { setInfo(r.data); setUrl(r.data.ics_url || ""); }).catch(() => {});
  useEffect(() => { load(); }, []);

  const save = async () => {
    setBusy(true);
    try { await api.put("/admin/calendar", { ics_url: url }); toast.success("Calendario salvato"); load(); }
    catch (e) { toast.error(formatErr(e)); }
    setBusy(false);
  };
  const sync = async () => {
    setBusy(true);
    try {
      const r = await api.post("/admin/calendar/sync");
      r.data.ok ? toast.success(`Sincronizzato: ${r.data.result}`) : toast.error(r.data.error);
      load();
    } catch (e) { toast.error(formatErr(e)); }
    setBusy(false);
  };

  return (
    <div className="lau-card p-5 space-y-3 lau-in" data-testid="calendar-sync-card">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-yellow-400">
          <CalendarSync size={18} />
          <h2 className="font-display font-bold uppercase tracking-wider text-white">Calendario Apple / Google</h2>
        </div>
        <button onClick={() => setOpen(!open)} data-testid="calendar-help-toggle" className="text-xs text-zinc-400 underline underline-offset-4">
          {open ? "Nascondi guida" : "Come collegarlo?"}
        </button>
      </div>
      <p className="text-xs text-zinc-400">Segna gli allenamenti sul tuo calendario con il nome dell'atleta nel titolo (es. "PT Mario Rossi"): ogni 30 minuti diventano sessioni nell'app e l'atleta riceve l'email.</p>
      {open && (
        <ol className="text-xs text-zinc-300 space-y-1 list-decimal pl-4 bg-[#0A0A0D] border border-[#262633] rounded p-3" data-testid="calendar-help">
          <li>Su iPhone apri <strong>Calendario</strong> → <strong>Calendari</strong> (in basso) → crea un calendario nuovo "Allenamenti PT" (consigliato).</li>
          <li>Tocca la <strong>(i)</strong> accanto a quel calendario → attiva <strong>Calendario pubblico</strong> → <strong>Condividi link</strong> → Copia.</li>
          <li>Incolla qui sotto il link (inizia con <code>webcal://</code>) e premi Salva, poi "Sincronizza ora".</li>
          <li>Da ora in poi scrivi nel titolo dell'evento il nome dell'atleta come registrato nell'app. Luogo e durata vengono letti dall'evento.</li>
        </ol>
      )}
      <div className="flex gap-2 flex-col sm:flex-row">
        <input placeholder="webcal://p01-caldav.icloud.com/published/2/..." value={url} onChange={(e) => setUrl(e.target.value)}
               data-testid="calendar-ics-input"
               className="flex-1 bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded px-3 py-2 text-sm text-white min-w-0" />
        <div className="flex gap-2">
          <button onClick={save} disabled={busy} data-testid="calendar-save-btn" className="lau-gold-btn px-4 py-2 rounded text-sm flex items-center gap-2 disabled:opacity-50">
            <Save size={14} /> Salva
          </button>
          <button onClick={sync} disabled={busy || !info.ics_url} data-testid="calendar-sync-btn"
                  className="px-4 py-2 rounded text-sm flex items-center gap-2 border border-[#262633] text-zinc-200 hover:border-yellow-500/60 disabled:opacity-50">
            <RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Sincronizza ora
          </button>
        </div>
      </div>
      {info.last_sync && (
        <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-num" data-testid="calendar-last-sync">
          Ultima sincronizzazione {new Date(info.last_sync).toLocaleString("it-IT")} · {info.last_result}
        </div>
      )}
      {info.unmatched?.length > 0 && (
        <div className="text-xs text-zinc-300 bg-[#0A0A0D] border border-amber-500/30 rounded p-3" data-testid="calendar-unmatched">
          <div className="flex items-center gap-1 text-amber-400 mb-1"><AlertTriangle size={12} /> Eventi non collegati a nessun atleta (controlla il nome nel titolo):</div>
          <ul className="space-y-0.5">{info.unmatched.map((u, i) => <li key={i}>• {u.date} — {u.summary || "(senza titolo)"}</li>)}</ul>
        </div>
      )}
    </div>
  );
}
