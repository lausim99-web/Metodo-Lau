import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AppShell from "../components/AppShell";
import { api, formatErr, API, getToken } from "../api";
import { toast } from "sonner";
import { ArrowLeft, Upload, FileText, Trash2, Image as ImageIcon, Activity, Dumbbell, Utensils, Plus, Eye, Calendar, MessageSquareHeart, Clock, Gift, Pencil, AlertTriangle } from "lucide-react";
import { METRICS, METRIC_KEYS, emptyProgress } from "../metrics";

const TABS = [
  { key: "workouts", label: "Schede Allenamento", icon: Dumbbell },
  { key: "nutrition", label: "Alimentazione", icon: Utensils },
  { key: "photos", label: "Foto Prima/Dopo", icon: ImageIcon },
  { key: "progress", label: "Progressi & BIA", icon: Activity },
  { key: "sessions", label: "Sessioni PT", icon: Calendar },
];

function FileList({ items, kind, onDelete, onExpiry, viewToken }) {
  if (!items.length) return <div className="text-zinc-500 text-sm py-4 text-center">Nessun file caricato ancora.</div>;
  return (
    <ul className="space-y-2">
      {items.map((f, i) => (
        <li key={f.id} className="flex items-center gap-3 p-3 bg-[#0A0A0D] border border-[#262633] rounded-lg flex-wrap" data-testid={`${kind}-item-${i}`}>
          <FileText className="text-yellow-400 shrink-0" size={18} />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white truncate">{f.title || f.filename}</div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-num">
              {new Date(f.uploaded_at).toLocaleDateString("it-IT")} · {(f.size / 1024).toFixed(0)} KB
              {i === 0 && <span className="ml-2 text-yellow-400">· ATTUALE</span>}
            </div>
            {i === 0 && f.expires_at && (
              <label className="flex items-center gap-2 mt-1.5 text-[10px] uppercase tracking-widest text-zinc-400 font-mono-num">
                <Clock size={11} className="text-yellow-400" /> Scade il
                <input type="date" defaultValue={f.expires_at} onChange={(e) => e.target.value && onExpiry(f.id, e.target.value)}
                       data-testid={`${kind}-expiry-date`}
                       className="bg-transparent border border-[#262633] focus:border-yellow-500 outline-none rounded px-2 py-0.5 text-xs text-white [color-scheme:dark]" />
              </label>
            )}
          </div>
          <a href={`${API}/files/${kind}/${f.id}?auth=${encodeURIComponent(viewToken || "")}`} target="_blank" rel="noreferrer"
             className="p-2 text-zinc-300 hover:text-yellow-400" title="Apri">
            <Eye size={16} />
          </a>
          <button onClick={() => onDelete(f.id)} className="p-2 text-zinc-400 hover:text-red-400" title="Elimina" data-testid={`${kind}-del-${i}`}>
            <Trash2 size={16} />
          </button>
        </li>
      ))}
    </ul>
  );
}

function PdfUploadSection({ clientId, kind, label }) {
  const [items, setItems] = useState([]);
  const [title, setTitle] = useState("");
  const [weeks, setWeeks] = useState("8");
  const [customDate, setCustomDate] = useState("");
  const [busy, setBusy] = useState(false);
  const t = getToken();

  const load = async () => {
    const r = await api.get(kind === "workouts" ? `/admin/clients/${clientId}/workouts` : `/admin/clients/${clientId}/nutrition/list`);
    setItems(r.data);
  };
  useEffect(() => { load(); }, [clientId]);

  const setExpiry = async (id, date) => {
    try {
      await api.patch(kind === "workouts" ? `/admin/workouts/${id}/expiry` : `/admin/nutrition/${id}/expiry`, { expires_at: date });
      toast.success("Scadenza aggiornata"); load();
    } catch (e) { toast.error(formatErr(e)); }
  };

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (weeks === "custom" && !customDate) { toast.error("Scegli la data di scadenza"); e.target.value = ""; return; }
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", title || "");
    if (weeks === "custom") fd.append("expires_at", customDate); else fd.append("weeks", weeks);
    try {
      await api.post(kind === "workouts" ? `/admin/clients/${clientId}/workouts` : `/admin/clients/${clientId}/nutrition`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(`${label} caricata`);
      setTitle("");
      load();
    } catch (e) { toast.error(formatErr(e)); }
    setBusy(false);
    e.target.value = "";
  };

  const del = async (id) => {
    if (!window.confirm("Eliminare questo file? Rimarrà l'ultimo caricato come attuale.")) return;
    try {
      await api.delete(kind === "workouts" ? `/admin/workouts/${id}` : `/admin/nutrition/${id}`);
      toast.success("File eliminato"); load();
    } catch (e) { toast.error(formatErr(e)); }
  };

  return (
    <div className="lau-card p-5 lau-in">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div>
          <div className="font-display font-bold text-lg uppercase text-white">{label}</div>
          <div className="text-xs text-zinc-400">Le versioni precedenti restano nello storico.</div>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          <select value={weeks} onChange={(e) => setWeeks(e.target.value)} data-testid={`${kind}-weeks-select`}
                  className="bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded px-2 py-2 text-sm text-white">
            {Array.from({ length: 12 }, (_, i) => i + 1).map((w) => (
              <option key={w} value={w}>Scade tra {w} {w === 1 ? "settimana" : "settimane"}{w === 8 ? " (default)" : ""}</option>
            ))}
            <option value="custom">Data personalizzata…</option>
          </select>
          {weeks === "custom" && (
            <input type="date" value={customDate} onChange={(e) => setCustomDate(e.target.value)} data-testid={`${kind}-custom-date`}
                   min={new Date().toISOString().slice(0, 10)}
                   className="bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded px-2 py-2 text-sm text-white [color-scheme:dark]" />
          )}
          <input placeholder="Titolo (opz. es. Scheda A)" value={title} onChange={(e) => setTitle(e.target.value)}
                 data-testid={`${kind}-title`}
                 className="bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded px-3 py-2 text-sm text-white flex-1 min-w-0 sm:w-56" />
          <label className={`lau-gold-btn px-4 py-2 rounded text-sm cursor-pointer flex items-center gap-2 shrink-0 whitespace-nowrap ${busy ? "opacity-50 pointer-events-none" : ""}`} data-testid={`${kind}-upload-btn`}>
            <Upload size={16} /> {busy ? "..." : "Carica PDF"}
            <input type="file" accept="application/pdf" onChange={upload} className="hidden" data-testid={`${kind}-upload-input`} />
          </label>
        </div>
      </div>
      <FileList items={items} kind={kind} onDelete={del} onExpiry={setExpiry} viewToken={t} />
    </div>
  );
}

function PhotosSection({ clientId }) {
  const [items, setItems] = useState([]);
  const [tag, setTag] = useState("prima");
  const [date, setDate] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [blobs, setBlobs] = useState({});
  const t = getToken();

  const load = async () => {
    const r = await api.get(`/admin/clients/${clientId}/photos`); setItems(r.data);
  };
  useEffect(() => { load(); }, [clientId]);

  useEffect(() => {
    items.forEach((p) => {
      if (blobs[p.id]) return;
      fetch(`${API}/files/photos/${p.id}`, { credentials: "include", headers: t ? { Authorization: `Bearer ${t}` } : {} })
        .then((r) => r.blob())
        .then((b) => setBlobs((prev) => ({ ...prev, [p.id]: URL.createObjectURL(b) })))
        .catch(() => {});
    });
  }, [items]);

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file); fd.append("tag", tag); fd.append("photo_date", date || ""); fd.append("notes", notes || "");
    try {
      await api.post(`/admin/clients/${clientId}/photos`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Foto caricata");
      setNotes(""); load();
    } catch (e) { toast.error(formatErr(e)); }
    setBusy(false); e.target.value = "";
  };

  const del = async (id) => {
    if (!window.confirm("Eliminare la foto?")) return;
    try { await api.delete(`/admin/photos/${id}`); toast.success("Foto eliminata"); load(); }
    catch (e) { toast.error(formatErr(e)); }
  };

  return (
    <div className="lau-card p-5 lau-in">
      <div className="grid gap-2 sm:grid-cols-[auto_auto_1fr_auto] items-center mb-4">
        <select value={tag} onChange={(e) => setTag(e.target.value)} data-testid="photo-tag"
                className="bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded px-3 py-2 text-sm text-white">
          <option value="prima">PRIMA</option>
          <option value="dopo">DOPO</option>
          <option value="check">CHECK</option>
        </select>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} data-testid="photo-date"
               className="bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded px-3 py-2 text-sm text-white" />
        <input placeholder="Note (opz.)" value={notes} onChange={(e) => setNotes(e.target.value)}
               className="bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded px-3 py-2 text-sm text-white" />
        <label className={`lau-gold-btn px-4 py-2 rounded text-sm cursor-pointer flex items-center gap-2 ${busy ? "opacity-50 pointer-events-none" : ""}`} data-testid="photo-upload-btn">
          <Upload size={16} /> {busy ? "..." : "Foto"}
          <input type="file" accept="image/*" onChange={upload} className="hidden" data-testid="photo-upload-input" />
        </label>
      </div>
      {items.length === 0 ? (
        <div className="text-zinc-500 text-sm py-4 text-center">Nessuna foto ancora caricata.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {items.map((p) => (
            <div key={p.id} className="relative group border border-[#262633] rounded-lg overflow-hidden bg-[#0A0A0D]" data-testid={`photo-${p.id}`}>
              {blobs[p.id] ? (
                <img src={blobs[p.id]} alt={p.tag} className="w-full h-40 object-cover" />
              ) : (
                <div className="w-full h-40 bg-zinc-800 animate-pulse" />
              )}
              <div className="absolute top-1 left-1 text-[9px] uppercase font-mono-num px-2 py-0.5 rounded bg-yellow-400 text-black font-bold">
                {p.tag}
              </div>
              <button onClick={() => del(p.id)} className="absolute top-1 right-1 p-1 rounded bg-black/70 text-red-400 opacity-0 group-hover:opacity-100 transition">
                <Trash2 size={12} />
              </button>
              <div className="text-[10px] p-2 text-zinc-400 font-mono-num">
                {p.photo_date || new Date(p.uploaded_at).toLocaleDateString("it-IT")}
                {p.notes && <div className="text-xs text-zinc-200 normal-case tracking-normal font-sans mt-1 line-clamp-3" data-testid={`photo-notes-${p.id}`}>{p.notes}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProgressSection({ clientId }) {
  const [items, setItems] = useState([]);
  const [f, setF] = useState(emptyProgress());
  const load = async () => { const r = await api.get(`/admin/clients/${clientId}/progress`); setItems(r.data); };
  useEffect(() => { load(); }, [clientId]);

  const add = async (e) => {
    e.preventDefault();
    const body = { ...f };
    METRIC_KEYS.forEach((k) => {
      body[k] = body[k] === "" ? null : Number(String(body[k]).replace(",", "."));
    });
    try {
      await api.post(`/admin/clients/${clientId}/progress`, body);
      toast.success("Progresso salvato");
      setF(emptyProgress());
      load();
    } catch (e) { toast.error(formatErr(e)); }
  };

  const del = async (id) => {
    if (!window.confirm("Eliminare questa voce?")) return;
    try { await api.delete(`/admin/progress/${id}`); load(); } catch (e) { toast.error(formatErr(e)); }
  };

  const groups = [...new Set(METRICS.map((m) => m.group))];

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="lau-card p-5 space-y-4 lau-in">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="font-display font-bold uppercase text-white">Nuova rilevazione</div>
          <input type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })}
                 data-testid="progress-date"
                 className="bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded px-3 py-2 text-sm text-white [color-scheme:dark]" />
        </div>
        {groups.map((g) => (
          <div key={g}>
            <div className="text-[10px] uppercase tracking-widest text-yellow-400 font-mono-num mb-2">{g}</div>
            <div className="grid gap-2 grid-cols-2 sm:grid-cols-3 md:grid-cols-5">
              {METRICS.filter((m) => m.group === g).map((m) => (
                <label key={m.k} className="flex items-center gap-2 bg-[#0A0A0D] border border-[#262633] focus-within:border-yellow-500 rounded px-3">
                  <span className="text-xs text-zinc-400 whitespace-nowrap">{m.label}</span>
                  <input inputMode="decimal" placeholder={m.unit} value={f[m.k]} onChange={(e) => setF({ ...f, [m.k]: e.target.value })}
                         data-testid={`progress-${m.k}`}
                         className="flex-1 min-w-0 bg-transparent outline-none py-2 text-sm text-white text-right font-mono-num" />
                </label>
              ))}
            </div>
          </div>
        ))}
        <input placeholder="Note / Conclusione (es. Molto bene, mi raccomando le proteine)" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })}
               data-testid="progress-notes"
               className="w-full bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded px-3 py-2 text-sm text-white" />
        <button type="submit" data-testid="progress-submit" className="lau-gold-btn px-4 py-2 rounded text-sm flex items-center gap-2">
          <Plus size={16} /> Aggiungi
        </button>
      </form>

      <div className="lau-card p-4 overflow-x-auto">
        {items.length === 0 ? (
          <div className="text-zinc-500 text-sm py-4 text-center">Nessuna rilevazione ancora.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-widest text-yellow-400 font-mono-num border-b border-[#262633]">
                <th className="text-left py-2 px-2">Data</th>
                {METRICS.map((m) => <th key={m.k} className="text-right px-2 whitespace-nowrap">{m.short}</th>)}
                <th className="text-left px-2">Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-b border-[#262633]/50 text-zinc-200" data-testid={`prog-row-${p.id}`}>
                  <td className="py-2 px-2 font-mono-num whitespace-nowrap">{p.date}</td>
                  {METRICS.map((m) => <td key={m.k} className="text-right px-2 font-mono-num">{p[m.k] ?? "-"}</td>)}
                  <td className="px-2 text-zinc-400 text-xs min-w-[10rem]">{p.notes}</td>
                  <td><button onClick={() => del(p.id)} className="text-zinc-400 hover:text-red-400 px-2"><Trash2 size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function LoyaltyCard({ clientId, info, onNotify, busy }) {
  if (!info) return null;
  const pct = Math.round(((info.completed % info.every) / info.every) * 100);
  return (
    <div className="lau-card p-5 lau-in border-yellow-500/30" data-testid="loyalty-card">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.35em] text-yellow-400 font-mono-num flex items-center gap-1"><Gift size={12} /> Fedeltà · solo PT</div>
          <div className="font-display font-black text-2xl text-white mt-1" data-testid="loyalty-completed">
            {info.completed} <span className="text-sm text-zinc-400 font-normal">lezioni private svolte</span>
          </div>
          <div className="text-xs text-zinc-400 mt-1">
            {info.available > 0
              ? <span className="text-green-400 font-bold" data-testid="loyalty-available">{info.available} {info.available === 1 ? "lezione gratuita disponibile" : "lezioni gratuite disponibili"}</span>
              : <>Mancano <span className="text-white font-bold">{info.to_next}</span> lezioni alla prossima gratis</>}
            {info.used > 0 && <span className="text-zinc-500"> · {info.used} gratis già usate</span>}
          </div>
        </div>
        <button onClick={onNotify} disabled={busy} data-testid="free-lesson-email-btn"
                title="Puoi regalare una lezione in qualsiasi momento: l'atleta riceve l'email con il pulsante WhatsApp"
                className={`px-4 py-2 rounded-lg text-xs flex items-center gap-2 disabled:opacity-50 ${info.available > 0 ? "lau-gold-btn" : "border border-yellow-500/50 text-yellow-300 hover:bg-yellow-400/10"}`}>
          <Gift size={14} /> Regala lezione gratis
        </button>
      </div>
      <div className="mt-3 h-2 rounded-full bg-[#0A0A0D] border border-[#262633] overflow-hidden">
        <div className="h-full bg-yellow-400 transition-all" style={{ width: `${info.available > 0 ? 100 : pct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] font-mono-num text-zinc-500 mt-1"><span>{info.completed % info.every}/{info.every}</span><span>Lezione gratis</span></div>
      <div className={`mt-3 flex items-start gap-2 text-xs rounded-lg p-3 border ${info.cancellations_6m >= 2 ? "border-red-500/50 bg-red-500/10 text-red-200" : "border-[#262633] bg-[#0A0A0D] text-zinc-400"}`} data-testid="loyalty-cancellations">
        <AlertTriangle size={14} className={`shrink-0 mt-0.5 ${info.cancellations_6m >= 2 ? "text-red-400" : "text-yellow-400"}`} />
        <div>
          <strong className={info.cancellations_6m >= 2 ? "text-red-300" : "text-white"}>{info.cancellations_6m} {info.cancellations_6m === 1 ? "disdetta" : "disdette"} negli ultimi 6 mesi</strong>
          {info.cancellations_6m >= 2 && <span> — dalla prossima disdetta la lezione è <strong>a pagamento</strong>.</span>}
          {info.cancellation_dates?.length > 0 && <div className="text-[10px] font-mono-num mt-1 opacity-80">Lezioni disdette: {info.cancellation_dates.join(" · ")}</div>}
          <div className="text-[10px] mt-1 opacity-80">{info.policy}</div>
        </div>
      </div>
    </div>
  );
}

function SessionsSection({ clientId }) {
  const [items, setItems] = useState([]);
  const [loyalty, setLoyalty] = useState(null);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({ date: "", time: "", duration_min: 60, location: "", notes: "", is_free: false });
  const load = async () => {
    const [r, l] = await Promise.all([api.get(`/admin/clients/${clientId}/sessions`), api.get(`/admin/clients/${clientId}/loyalty`)]);
    setItems(r.data); setLoyalty(l.data);
  };
  useEffect(() => { load(); }, [clientId]);

  const notify = async () => {
    if (!window.confirm("Regalare una lezione gratuita? L'atleta riceve subito l'email con il pulsante WhatsApp per fissarla.")) return;
    setBusy(true);
    try { await api.post(`/admin/clients/${clientId}/free-lesson-email`); toast.success("Email inviata all'atleta"); }
    catch (e) { toast.error(formatErr(e)); }
    setBusy(false);
  };

  const add = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/admin/clients/${clientId}/sessions`, f);
      toast.success("Sessione creata — l'atleta riceve subito l'email e i promemoria 24h e 1h prima");
      setF({ date: "", time: "", duration_min: 60, location: "", notes: "", is_free: false });
      load();
    } catch (e) { toast.error(formatErr(e)); }
  };

  const [editing, setEditing] = useState(null);

  const del = async (id, past) => {
    if (!window.confirm(past ? "Eliminare questa sessione passata?" : "Annullare questa sessione? L'atleta riceverà l'email di annullamento.")) return;
    const byAthlete = !past && window.confirm("È stata DISDETTA DALL'ATLETA?\n\nOK = sì, conta ai fini della regola (2 disdette in 6 mesi, dalla terza si paga)\nAnnulla = no, l'ho annullata io");
    try { await api.delete(`/admin/sessions/${id}?by_athlete=${byAthlete ? 1 : 0}`); toast.success(past ? "Sessione eliminata" : "Sessione annullata — email inviata all'atleta"); load(); }
    catch (e) { toast.error(formatErr(e)); }
  };

  const move = async (e, s) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    try {
      await api.patch(`/admin/sessions/${s.id}`, { date: fd.get("date"), time: fd.get("time"), location: fd.get("location") || "" });
      toast.success("Sessione spostata — l'atleta riceve l'email con il nuovo orario");
      setEditing(null); load();
    } catch (e2) { toast.error(formatErr(e2)); }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <LoyaltyCard clientId={clientId} info={loyalty} onNotify={notify} busy={busy} />
      <form onSubmit={add} className="lau-card p-5 space-y-3 lau-in">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="font-display font-bold uppercase text-white">Nuova sessione privata</div>
          <div className="text-[10px] uppercase tracking-widest text-yellow-400 font-mono-num">Email subito + promemoria 24h e 1h prima</div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-num block mb-1">Data</label>
            <input type="date" required min={today} value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })}
                   data-testid="session-date"
                   className="w-full bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded px-3 py-2 text-sm text-white" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-num block mb-1">Ora</label>
            <input type="time" required value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })}
                   data-testid="session-time"
                   className="w-full bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded px-3 py-2 text-sm text-white" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-num block mb-1">Durata (min)</label>
            <input type="number" min="15" step="15" value={f.duration_min} onChange={(e) => setF({ ...f, duration_min: Number(e.target.value) || 60 })}
                   data-testid="session-duration"
                   className="w-full bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded px-3 py-2 text-sm text-white" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-num block mb-1">Luogo (opz.)</label>
            <input placeholder="Palestra, studio..." value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })}
                   data-testid="session-location"
                   className="w-full bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded px-3 py-2 text-sm text-white" />
          </div>
        </div>
        <input placeholder="Note per l'atleta (opz. — cosa portare, focus della sessione...)" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })}
               data-testid="session-notes"
               className="w-full bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded px-3 py-2 text-sm text-white" />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <button type="submit" data-testid="session-submit" className="lau-gold-btn px-4 py-2 rounded text-sm flex items-center gap-2">
            <Plus size={16} /> Aggiungi sessione
          </button>
          <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
            <input type="checkbox" checked={f.is_free} onChange={(e) => setF({ ...f, is_free: e.target.checked })} data-testid="session-is-free" className="w-4 h-4 accent-yellow-400" />
            <Gift size={14} className="text-yellow-400" /> Lezione gratuita (premio fedeltà, non conta nel conteggio)
          </label>
        </div>
      </form>

      <div className="lau-card p-4">
        {items.length === 0 ? (
          <div className="text-zinc-500 text-sm py-4 text-center">Nessuna sessione programmata.</div>
        ) : (
          <div className="space-y-2">
            {items.map((s) => {
              const past = s.date < today;
              const tomorrow = s.date === new Date(Date.now() + 86400000).toISOString().slice(0, 10);
              return (
                <div key={s.id}>
                <div className={`flex items-center gap-3 p-3 rounded-lg border ${past ? "border-[#262633] opacity-50" : "border-yellow-500/30 bg-yellow-400/5"}`}
                     data-testid={`session-${s.id}`}>
                  <Calendar size={18} className={past ? "text-zinc-500" : "text-yellow-400"} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white font-mono-num">
                      {new Date(s.date + "T00:00").toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" })} · ore {s.time} · {s.duration_min}min
                      {s.location && <span className="text-zinc-400"> · {s.location}</span>}
                      {s.is_free && <span className="ml-2 text-[10px] uppercase tracking-widest text-green-400 font-mono-num" data-testid={`session-free-${s.id}`}>· Gratis</span>}
                    </div>
                    <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-num mt-0.5">
                      {past ? "PASSATA" : tomorrow ? (s.reminder_sent ? "DOMANI · promemoria inviato ✓" : "DOMANI · promemoria in programma") : "PROGRAMMATA"}
                      {s.notes && <span className="normal-case tracking-normal text-zinc-500"> — {s.notes}</span>}
                    </div>
                  </div>
                  <button onClick={() => setEditing(editing === s.id ? null : s.id)} disabled={past} className="p-2 text-zinc-400 hover:text-yellow-400 disabled:opacity-30" title="Sposta" data-testid={`move-session-${s.id}`}>
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => del(s.id, past)} className="p-2 text-zinc-400 hover:text-red-400" data-testid={`del-session-${s.id}`}>
                    <Trash2 size={16} />
                  </button>
                </div>
                {editing === s.id && (
                  <form onSubmit={(e) => move(e, s)} className="flex flex-wrap items-center gap-2 p-3 -mt-1 rounded-b-lg border border-t-0 border-yellow-500/30 bg-[#0A0A0D]" data-testid={`move-form-${s.id}`}>
                    <span className="text-[10px] uppercase tracking-widest text-yellow-400 font-mono-num">Sposta a</span>
                    <input type="date" name="date" required defaultValue={s.date} min={today} data-testid={`move-date-${s.id}`}
                           className="bg-[#121218] border border-[#262633] focus:border-yellow-500 outline-none rounded px-2 py-1.5 text-sm text-white [color-scheme:dark]" />
                    <input type="time" name="time" required defaultValue={s.time} data-testid={`move-time-${s.id}`}
                           className="bg-[#121218] border border-[#262633] focus:border-yellow-500 outline-none rounded px-2 py-1.5 text-sm text-white [color-scheme:dark]" />
                    <input name="location" placeholder="Luogo" defaultValue={s.location || ""} data-testid={`move-location-${s.id}`}
                           className="bg-[#121218] border border-[#262633] focus:border-yellow-500 outline-none rounded px-2 py-1.5 text-sm text-white flex-1 min-w-[8rem]" />
                    <button type="submit" className="lau-gold-btn px-3 py-1.5 rounded text-xs" data-testid={`move-submit-${s.id}`}>Conferma</button>
                    <button type="button" onClick={() => setEditing(null)} className="text-xs text-zinc-400 px-2">Annulla</button>
                  </form>
                )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ClientDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [client, setClient] = useState(null);
  const [tab, setTab] = useState("workouts");
  const [sending, setSending] = useState(false);

  const sendMail = async (path, label) => {
    if (!window.confirm(`Inviare ora a ${client.name} l'email ${label} con il pulsante WhatsApp?`)) return;
    setSending(true);
    try { await api.post(`/admin/clients/${id}/${path}`); toast.success("Email inviata"); }
    catch (e) { toast.error(formatErr(e)); }
    setSending(false);
  };

  useEffect(() => { api.get(`/admin/clients/${id}`).then((r) => setClient(r.data)).catch((e) => toast.error(formatErr(e))); }, [id]);

  if (!client) return <AppShell><div className="text-zinc-400 text-center py-10">Caricamento...</div></AppShell>;

  return (
    <AppShell>
      <button onClick={() => nav("/admin")} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-yellow-400 mb-4" data-testid="back-to-admin">
        <ArrowLeft size={16} /> Torna agli atleti
      </button>
      <div className="mb-6 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] uppercase tracking-[0.35em] text-yellow-400 font-mono-num">Atleta</div>
          <h1 className="font-display font-black text-3xl sm:text-4xl uppercase text-white">{client.name}</h1>
          <div className="text-sm text-zinc-400">{client.email}</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => sendMail("feedback-email", "di feedback (3 settimane)")} disabled={sending} data-testid="send-feedback-email-btn"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-display font-bold uppercase tracking-wider border border-[#262633] text-zinc-200 hover:border-yellow-500/60 disabled:opacity-50">
            <MessageSquareHeart size={16} className="text-yellow-400" /> Email feedback
          </button>
          <button onClick={() => sendMail("expired-email", "di scheda scaduta (rinnovo)")} disabled={sending} data-testid="send-expired-email-btn"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-display font-bold uppercase tracking-wider border border-[#262633] text-zinc-200 hover:border-yellow-500/60 disabled:opacity-50">
            <Clock size={16} className="text-yellow-400" /> Email scadenza
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar">
        {TABS.map((t) => {
          const Icon = t.icon; const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} data-testid={`admin-tab-${t.key}`}
                    className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg font-display font-bold uppercase tracking-wider text-xs sm:text-sm transition border ${
                      active ? "bg-yellow-400 text-black border-yellow-400" : "border-[#262633] text-zinc-300 hover:border-yellow-500/50"
                    }`}>
              <Icon size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "workouts" && <PdfUploadSection clientId={id} kind="workouts" label="Scheda Allenamento (PDF)" />}
      {tab === "nutrition" && <PdfUploadSection clientId={id} kind="nutrition" label="Piano Alimentare (PDF)" />}
      {tab === "photos" && <PhotosSection clientId={id} />}
      {tab === "progress" && <ProgressSection clientId={id} />}
      {tab === "sessions" && <SessionsSection clientId={id} />}
    </AppShell>
  );
}
