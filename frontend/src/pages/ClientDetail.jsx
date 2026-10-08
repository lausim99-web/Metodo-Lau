import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AppShell from "../components/AppShell";
import { api, formatErr, API, getToken } from "../api";
import { toast } from "sonner";
import { ArrowLeft, Upload, FileText, Trash2, Image as ImageIcon, Activity, Dumbbell, Utensils, Plus, Eye, Calendar, MessageSquareHeart } from "lucide-react";

const TABS = [
  { key: "workouts", label: "Schede Allenamento", icon: Dumbbell },
  { key: "nutrition", label: "Alimentazione", icon: Utensils },
  { key: "photos", label: "Foto Prima/Dopo", icon: ImageIcon },
  { key: "progress", label: "Progressi & BIA", icon: Activity },
  { key: "sessions", label: "Sessioni PT", icon: Calendar },
];

function FileList({ items, kind, onDelete, viewToken }) {
  if (!items.length) return <div className="text-zinc-500 text-sm py-4 text-center">Nessun file caricato ancora.</div>;
  return (
    <ul className="space-y-2">
      {items.map((f, i) => (
        <li key={f.id} className="flex items-center gap-3 p-3 bg-[#0A0A0D] border border-[#262633] rounded-lg" data-testid={`${kind}-item-${i}`}>
          <FileText className="text-yellow-400 shrink-0" size={18} />
          <div className="flex-1 min-w-0">
            <div className="text-sm text-white truncate">{f.title || f.filename}</div>
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-num">
              {new Date(f.uploaded_at).toLocaleDateString("it-IT")} · {(f.size / 1024).toFixed(0)} KB
              {i === 0 && <span className="ml-2 text-yellow-400">· ATTUALE</span>}
            </div>
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
  const [busy, setBusy] = useState(false);
  const t = getToken();

  const load = async () => {
    const r = await api.get(kind === "workouts" ? `/admin/clients/${clientId}/workouts` : `/admin/clients/${clientId}/nutrition/list`);
    setItems(r.data);
  };
  useEffect(() => { load(); }, [clientId]);

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("title", title || "");
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
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input placeholder="Titolo (opz. es. Scheda A)" value={title} onChange={(e) => setTitle(e.target.value)}
                 data-testid={`${kind}-title`}
                 className="bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded px-3 py-2 text-sm text-white flex-1 min-w-0 sm:w-56" />
          <label className={`lau-gold-btn px-4 py-2 rounded text-sm cursor-pointer flex items-center gap-2 shrink-0 whitespace-nowrap ${busy ? "opacity-50 pointer-events-none" : ""}`} data-testid={`${kind}-upload-btn`}>
            <Upload size={16} /> {busy ? "..." : "Carica PDF"}
            <input type="file" accept="application/pdf" onChange={upload} className="hidden" data-testid={`${kind}-upload-input`} />
          </label>
        </div>
      </div>
      <FileList items={items} kind={kind} onDelete={del} viewToken={t} />
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
  const [f, setF] = useState({ date: "", weight_kg: "", bia_fat: "", bia_muscle: "", bia_water: "", bia_bmi: "", notes: "" });
  const load = async () => { const r = await api.get(`/admin/clients/${clientId}/progress`); setItems(r.data); };
  useEffect(() => { load(); }, [clientId]);

  const add = async (e) => {
    e.preventDefault();
    const body = { ...f };
    ["weight_kg","bia_fat","bia_muscle","bia_water","bia_bmi"].forEach((k) => {
      body[k] = body[k] === "" ? null : Number(body[k]);
    });
    try {
      await api.post(`/admin/clients/${clientId}/progress`, body);
      toast.success("Progresso salvato");
      setF({ date: "", weight_kg: "", bia_fat: "", bia_muscle: "", bia_water: "", bia_bmi: "", notes: "" });
      load();
    } catch (e) { toast.error(formatErr(e)); }
  };

  const del = async (id) => {
    if (!window.confirm("Eliminare questa voce?")) return;
    try { await api.delete(`/admin/progress/${id}`); load(); } catch (e) { toast.error(formatErr(e)); }
  };

  const Field = ({ k, ph, w = "" }) => (
    <input placeholder={ph} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })}
           data-testid={`progress-${k}`}
           className={`bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded px-3 py-2 text-sm text-white ${w}`} />
  );

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="lau-card p-5 space-y-3 lau-in">
        <div className="font-display font-bold uppercase text-white">Nuova rilevazione</div>
        <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-6">
          <input type="date" required value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })}
                 data-testid="progress-date"
                 className="bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded px-3 py-2 text-sm text-white" />
          <Field k="weight_kg" ph="Peso kg" />
          <Field k="bia_fat" ph="Grasso %" />
          <Field k="bia_muscle" ph="Muscolo %" />
          <Field k="bia_water" ph="Acqua %" />
          <Field k="bia_bmi" ph="BMI" />
        </div>
        <input placeholder="Note (BIA, misurazioni, sensazioni...)" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })}
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
                <th className="text-right px-2">Peso</th>
                <th className="text-right px-2">Grasso</th>
                <th className="text-right px-2">Muscolo</th>
                <th className="text-right px-2">Acqua</th>
                <th className="text-right px-2">BMI</th>
                <th className="text-left px-2">Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-b border-[#262633]/50 text-zinc-200" data-testid={`prog-row-${p.id}`}>
                  <td className="py-2 px-2 font-mono-num">{p.date}</td>
                  <td className="text-right px-2 font-mono-num">{p.weight_kg ?? "-"}</td>
                  <td className="text-right px-2 font-mono-num">{p.bia_fat ?? "-"}</td>
                  <td className="text-right px-2 font-mono-num">{p.bia_muscle ?? "-"}</td>
                  <td className="text-right px-2 font-mono-num">{p.bia_water ?? "-"}</td>
                  <td className="text-right px-2 font-mono-num">{p.bia_bmi ?? "-"}</td>
                  <td className="px-2 text-zinc-400 text-xs">{p.notes}</td>
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

function SessionsSection({ clientId }) {
  const [items, setItems] = useState([]);
  const [f, setF] = useState({ date: "", time: "", duration_min: 60, location: "", notes: "" });
  const load = async () => { const r = await api.get(`/admin/clients/${clientId}/sessions`); setItems(r.data); };
  useEffect(() => { load(); }, [clientId]);

  const add = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/admin/clients/${clientId}/sessions`, f);
      toast.success("Sessione creata — l'atleta riceverà il promemoria 24h prima");
      setF({ date: "", time: "", duration_min: 60, location: "", notes: "" });
      load();
    } catch (e) { toast.error(formatErr(e)); }
  };

  const del = async (id) => {
    if (!window.confirm("Eliminare questa sessione?")) return;
    try { await api.delete(`/admin/sessions/${id}`); toast.success("Sessione eliminata"); load(); }
    catch (e) { toast.error(formatErr(e)); }
  };

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="lau-card p-5 space-y-3 lau-in">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="font-display font-bold uppercase text-white">Nuova sessione privata</div>
          <div className="text-[10px] uppercase tracking-widest text-yellow-400 font-mono-num">Promemoria email 24h prima</div>
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
        <button type="submit" data-testid="session-submit" className="lau-gold-btn px-4 py-2 rounded text-sm flex items-center gap-2">
          <Plus size={16} /> Aggiungi sessione
        </button>
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
                <div key={s.id} className={`flex items-center gap-3 p-3 rounded-lg border ${past ? "border-[#262633] opacity-50" : "border-yellow-500/30 bg-yellow-400/5"}`}
                     data-testid={`session-${s.id}`}>
                  <Calendar size={18} className={past ? "text-zinc-500" : "text-yellow-400"} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-white font-mono-num">
                      {new Date(s.date + "T00:00").toLocaleDateString("it-IT", { weekday: "short", day: "2-digit", month: "short" })} · ore {s.time} · {s.duration_min}min
                      {s.location && <span className="text-zinc-400"> · {s.location}</span>}
                    </div>
                    <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-num mt-0.5">
                      {past ? "PASSATA" : tomorrow ? (s.reminder_sent ? "DOMANI · promemoria inviato ✓" : "DOMANI · promemoria in programma") : "PROGRAMMATA"}
                      {s.notes && <span className="normal-case tracking-normal text-zinc-500"> — {s.notes}</span>}
                    </div>
                  </div>
                  <button onClick={() => del(s.id)} className="p-2 text-zinc-400 hover:text-red-400" data-testid={`del-session-${s.id}`}>
                    <Trash2 size={16} />
                  </button>
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
  const [sendingFb, setSendingFb] = useState(false);

  const sendFeedback = async () => {
    if (!window.confirm(`Inviare ora a ${client.name} l'email di feedback con il pulsante WhatsApp?`)) return;
    setSendingFb(true);
    try { await api.post(`/admin/clients/${id}/feedback-email`); toast.success("Email di feedback inviata"); }
    catch (e) { toast.error(formatErr(e)); }
    setSendingFb(false);
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
        <button onClick={sendFeedback} disabled={sendingFb} data-testid="send-feedback-email-btn"
                title="Invia ora l'email 'Come sta andando il programma?' (quella automatica parte dopo 3 settimane)"
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-display font-bold uppercase tracking-wider border border-[#262633] text-zinc-200 hover:border-yellow-500/60 disabled:opacity-50">
          <MessageSquareHeart size={16} className="text-yellow-400" /> {sendingFb ? "Invio..." : "Invia email feedback"}
        </button>
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
