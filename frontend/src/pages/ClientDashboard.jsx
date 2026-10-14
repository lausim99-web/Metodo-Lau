import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import AppShell from "../components/AppShell";
import ContactCard from "../components/ContactCard";
import { api, API, getToken, formatErr } from "../api";
import { useAuth } from "../auth";
import { toast } from "sonner";
import PdfViewer from "../components/PdfViewer";
import { METRICS, delta } from "../metrics";
import { Dumbbell, Utensils, Image as ImageIcon, Activity, FileText, Download, Eye, Calendar, PlayCircle, Clock, X } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

const TABS = [
  { key: "workouts", label: "Schede", icon: Dumbbell },
  { key: "nutrition", label: "Alimentazione", icon: Utensils },
  { key: "photos", label: "Foto", icon: ImageIcon },
  { key: "progress", label: "Progressi", icon: Activity },
  { key: "sessions", label: "Sessioni", icon: Calendar },
];

function GuideLink({ url, kind }) {
  if (!url) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" data-testid={`guide-link-${kind}`}
       className="flex items-center gap-2 mb-4 text-sm text-yellow-400 hover:text-yellow-300 underline underline-offset-4">
      <PlayCircle size={16} /> Guarda il video: come aprire la scheda e usare la piattaforma
    </a>
  );
}

function daysLeft(iso) {
  if (!iso) return null;
  return Math.ceil((new Date(iso + "T00:00") - new Date().setHours(0, 0, 0, 0)) / 86400000);
}

function PdfList({ endpoint, kind, guide }) {
  const [items, setItems] = useState([]);
  const [viewing, setViewing] = useState(null);
  const t = getToken();

  useEffect(() => { api.get(endpoint).then((r) => setItems(r.data)).catch(() => setItems([])); }, [endpoint]);

  const fileUrl = (f, dl) => `${API}/files/${kind}/${f.id}?auth=${encodeURIComponent(t || "")}${dl ? "&download=1" : ""}`;
  // apre il PDF dentro l'app (visore integrato con pulsante Chiudi)
  const open = (f) => setViewing(f);
  const download = async (f) => {
    const name = f.filename || "scheda.pdf";
    try {
      const r = await fetch(fileUrl(f, true), { credentials: "include", headers: t ? { Authorization: `Bearer ${t}` } : {} });
      if (!r.ok) throw new Error("download");
      const blob = await r.blob();
      const file = new File([blob], name, { type: "application/pdf" });
      // In modalità app installata (PWA) il download classico non funziona: usa la condivisione nativa
      // (Salva su File / Apri con Acrobat)
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === "AbortError") return; }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch {
      toast.error("Download non riuscito, riprova");
    }
  };

  if (!items.length) return (
    <div>
      <GuideLink url={guide} kind={kind} />
      <div className="lau-card p-8 text-center">
        <FileText className="mx-auto text-yellow-400 mb-3" size={40} />
        <p className="text-lg text-white font-bold">Nessun file disponibile</p>
        <p className="text-sm text-zinc-400 mt-2">Il tuo PT non ha ancora caricato nulla.</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      {viewing && <PdfViewer url={fileUrl(viewing, false)} title={viewing.title || viewing.filename} onClose={() => setViewing(null)} onDownload={() => download(viewing)} />}
      <GuideLink url={guide} kind={kind} />
      {items.map((f, i) => {
        const dl = i === 0 ? daysLeft(f.expires_at) : null;
        return (
        <div key={f.id} className={`lau-card p-4 lau-in ${i === 0 ? "border-yellow-500/40" : ""}`} data-testid={`me-${kind}-${i}`}>
          <div className="flex items-center gap-3 flex-wrap">
            <FileText className={i === 0 ? "text-yellow-400" : "text-zinc-500"} />
            <div className="flex-1 min-w-0">
              <div className="font-display font-bold text-white uppercase truncate">{f.title || f.filename}</div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-mono-num">
                {new Date(f.uploaded_at).toLocaleDateString("it-IT")}
                {i === 0 && <span className="ml-2 text-yellow-400">· ATTUALE</span>}
                {i > 0 && <span className="ml-2 text-zinc-500">· STORICO</span>}
              </div>
              {dl != null && (
                <div className={`flex items-center gap-1 text-[10px] uppercase tracking-widest font-mono-num mt-1 ${dl <= 7 ? "text-red-400" : "text-zinc-500"}`} data-testid={`me-${kind}-expiry`}>
                  <Clock size={10} /> {dl > 0 ? `Scade tra ${dl} giorni` : dl === 0 ? "Scade oggi" : "Scaduta — chiedi l'aggiornamento al PT"}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button onClick={() => open(f)} className="lau-gold-btn px-3 py-2 rounded text-xs flex items-center gap-1" data-testid={`me-${kind}-open-${i}`}>
                <Eye size={14} /> Apri
              </button>
              <button onClick={() => download(f)} title="Scarica (poi apri con Adobe Acrobat)"
                      className="px-3 py-2 rounded text-xs flex items-center gap-1 border border-[#262633] text-zinc-200 hover:border-yellow-500/60" data-testid={`me-${kind}-download-${i}`}>
                <Download size={14} /> Scarica
              </button>
            </div>
          </div>
        </div>
      ); })}
    </div>
  );
}

function PhotosTab() {
  const [items, setItems] = useState([]);
  const [blobs, setBlobs] = useState({});
  const [big, setBig] = useState(null);
  const t = getToken();

  useEffect(() => { api.get("/me/photos").then((r) => setItems(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    items.forEach((p) => {
      if (blobs[p.id]) return;
      fetch(`${API}/files/photos/${p.id}`, { credentials: "include", headers: t ? { Authorization: `Bearer ${t}` } : {} })
        .then((r) => r.blob()).then((b) => setBlobs((prev) => ({ ...prev, [p.id]: URL.createObjectURL(b) })))
        .catch(() => {});
    });
    // eslint-disable-next-line
  }, [items]);

  if (!items.length) return (
    <div className="lau-card p-8 text-center">
      <ImageIcon className="mx-auto text-yellow-400 mb-3" size={40} />
      <p className="text-lg text-white font-bold">Nessuna foto ancora</p>
      <p className="text-sm text-zinc-400 mt-2">Il PT caricherà qui le tue foto di riferimento (prima/dopo).</p>
    </div>
  );

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {items.map((p) => (
          <button key={p.id} onClick={() => blobs[p.id] && setBig(p)} className="relative border border-[#262633] rounded-lg overflow-hidden bg-[#0A0A0D] text-left" data-testid={`me-photo-${p.id}`}>
            {blobs[p.id] ? (
              <img src={blobs[p.id]} alt={p.tag} className="w-full h-40 object-cover" />
            ) : <div className="w-full h-40 bg-zinc-800 animate-pulse" />}
            <div className="absolute top-1 left-1 text-[9px] uppercase font-mono-num px-2 py-0.5 rounded bg-yellow-400 text-black font-bold">
              {p.tag}
            </div>
            <div className="text-[10px] p-2 text-zinc-400 font-mono-num">
              {p.photo_date || new Date(p.uploaded_at).toLocaleDateString("it-IT")}
              {p.notes && <div className="text-xs text-zinc-200 normal-case tracking-normal font-sans mt-1 line-clamp-3" data-testid={`me-photo-notes-${p.id}`}>{p.notes}</div>}
            </div>
          </button>
        ))}
      </div>
      {big && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col items-center justify-center p-4" onClick={() => setBig(null)} data-testid="photo-lightbox">
          <button onClick={() => setBig(null)} data-testid="photo-lightbox-close" aria-label="Chiudi"
                  className="absolute top-4 right-4 lau-gold-btn w-11 h-11 rounded-full flex items-center justify-center shadow-xl"
                  style={{ top: "max(1rem, env(safe-area-inset-top))" }}>
            <X size={22} />
          </button>
          <img src={blobs[big.id]} alt="preview" className="max-w-full max-h-[70vh] rounded" />
          <div className="mt-3 text-center max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="text-[10px] uppercase tracking-widest text-yellow-400 font-mono-num">{big.tag} · {big.photo_date || new Date(big.uploaded_at).toLocaleDateString("it-IT")}</div>
            {big.notes && <div className="text-sm text-zinc-100 mt-1" data-testid="photo-lightbox-notes">{big.notes}</div>}
          </div>
          <div className="absolute bottom-4 text-[10px] uppercase tracking-widest text-zinc-500 font-mono-num">Tocca la X o la foto per chiudere</div>
        </div>,
        document.body
      )}
    </>
  );
}

function ProgressTab() {
  const [items, setItems] = useState([]);
  const [metric, setMetric] = useState("weight_kg");
  useEffect(() => { api.get("/me/progress").then((r) => setItems(r.data)).catch(() => {}); }, []);
  if (!items.length) return (
    <div className="lau-card p-8 text-center">
      <Activity className="mx-auto text-yellow-400 mb-3" size={40} />
      <p className="text-lg text-white font-bold">Nessuna rilevazione ancora</p>
      <p className="text-sm text-zinc-400 mt-2">Il PT registrerà qui peso, BIA e check periodici.</p>
    </div>
  );
  const latest = items[0];
  const prev = items[1];
  const shown = METRICS.filter((m) => items.some((p) => p[m.k] != null));
  const activeMetric = METRICS.find((m) => m.k === metric) || shown[0] || METRICS[0];
  // build ascending chronological data for chart, keeping only entries where metric is present
  const chartData = [...items]
    .slice()
    .reverse()
    .filter((p) => p[activeMetric.k] != null)
    .map((p) => ({ date: p.date, value: Number(p[activeMetric.k]) }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {(shown.length ? shown : METRICS.slice(0, 1)).map((m) => {
          const d = delta(latest[m.k], prev?.[m.k]);
          return (
          <button key={m.k} onClick={() => setMetric(m.k)} data-testid={`metric-${m.k}`}
                  className={`lau-card p-3 text-center lau-in transition ${activeMetric.k === m.k ? "border-yellow-500/70" : ""}`}>
            <div className="text-[10px] uppercase tracking-widest font-mono-num" style={{ color: m.color }}>{m.label}</div>
            <div className="font-display font-black text-2xl text-white">
              {latest[m.k] ?? "-"}<span className="text-sm text-zinc-400 ml-1">{latest[m.k] != null ? m.unit : ""}</span>
            </div>
            {d && <div className="text-[10px] font-mono-num text-zinc-400" data-testid={`metric-delta-${m.k}`}>{d === "=" ? "invariato" : `${d} vs prec.`}</div>}
          </button>
        ); })}
      </div>

      <div className="lau-card p-4" data-testid="progress-chart">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.25em] font-mono-num" style={{ color: activeMetric.color }}>Andamento</div>
            <div className="font-display font-bold uppercase text-white">{activeMetric.label} <span className="text-zinc-500 text-sm">({activeMetric.unit || "—"})</span></div>
          </div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-num">
            {chartData.length} rilevazion{chartData.length === 1 ? "e" : "i"}
          </div>
        </div>
        {chartData.length < 2 ? (
          <div className="h-48 flex items-center justify-center text-sm text-zinc-500 text-center px-4">
            Servono almeno 2 rilevazioni con questo dato per vedere la curva.
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
                <CartesianGrid stroke="#262633" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="#6B7280" fontSize={11} tickFormatter={(d) => {
                  try { return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "short" }); } catch { return d; }
                }} />
                <YAxis stroke="#6B7280" fontSize={11} domain={["auto", "auto"]} />
                <Tooltip
                  contentStyle={{ background: "#121218", border: "1px solid #262633", borderRadius: 8, color: "#fff" }}
                  labelStyle={{ color: "#F5C518", fontFamily: "JetBrains Mono, monospace", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}
                  formatter={(v) => [`${v}${activeMetric.unit ? " " + activeMetric.unit : ""}`, activeMetric.label]}
                />
                <Line type="monotone" dataKey="value" stroke={activeMetric.color} strokeWidth={2.5}
                      dot={{ r: 4, fill: activeMetric.color, stroke: "#0A0A0D", strokeWidth: 2 }}
                      activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="lau-card p-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-widest text-yellow-400 font-mono-num border-b border-[#262633]">
              <th className="text-left py-2 px-2">Data</th>
              {shown.map((m) => <th key={m.k} className="text-right px-2 whitespace-nowrap">{m.short}</th>)}
              <th className="text-left px-2">Note</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-b border-[#262633]/50 text-zinc-200">
                <td className="py-2 px-2 font-mono-num whitespace-nowrap">{p.date}</td>
                {shown.map((m) => <td key={m.k} className="text-right px-2 font-mono-num">{p[m.k] ?? "-"}</td>)}
                <td className="px-2 text-zinc-400 text-xs min-w-[10rem]">{p.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SessionsTab() {
  const [items, setItems] = useState([]);
  useEffect(() => { api.get("/me/sessions").then((r) => setItems(r.data)).catch(() => {}); }, []);
  if (!items.length) return (
    <div className="lau-card p-8 text-center">
      <Calendar className="mx-auto text-yellow-400 mb-3" size={40} />
      <p className="text-lg text-white font-bold">Nessuna sessione programmata</p>
      <p className="text-sm text-zinc-400 mt-2">Quando il PT fissa un allenamento privato apparirà qui — e ti arriveranno due email: 24 ore prima e 1 ora prima.</p>
    </div>
  );
  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  return (
    <div className="space-y-3">
      {items.map((s) => {
        const isToday = s.date === today;
        const isTomorrow = s.date === tomorrow;
        return (
          <div key={s.id} className={`lau-card p-5 lau-in ${isToday ? "border-yellow-500/70" : ""}`} data-testid={`me-session-${s.id}`}>
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-yellow-400/10 border border-yellow-500/40 flex flex-col items-center justify-center shrink-0">
                <div className="font-display font-black text-xl text-yellow-400 leading-none">{s.date.slice(8)}</div>
                <div className="text-[9px] uppercase tracking-widest text-zinc-400 font-mono-num">
                  {new Date(s.date + "T00:00").toLocaleDateString("it-IT", { month: "short" })}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-display font-black text-lg uppercase text-white">Ore {s.time}</span>
                  {isToday && <span className="text-[10px] uppercase tracking-widest font-mono-num px-2 py-0.5 rounded bg-yellow-400 text-black font-bold">OGGI</span>}
                  {isTomorrow && <span className="text-[10px] uppercase tracking-widest font-mono-num px-2 py-0.5 rounded bg-yellow-400/15 text-yellow-400 border border-yellow-500/30">DOMANI</span>}
                </div>
                <div className="text-xs text-zinc-400 mt-1">
                  {new Date(s.date + "T00:00").toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "long" })} · {s.duration_min} minuti
                  {s.location && <> · {s.location}</>}
                </div>
                {s.notes && <div className="text-xs text-zinc-500 italic mt-1">"{s.notes}"</div>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function ClientDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState("workouts");
  const [badges, setBadges] = useState({ workouts: 0, nutrition: 0 });
  const [guides, setGuides] = useState({});
  useEffect(() => { api.get("/contacts").then((r) => setGuides(r.data)).catch(() => {}); }, []);

  const loadBadges = async () => {
    try {
      const r = await api.get("/me/notifications");
      setBadges(r.data);
    } catch {}
  };

  useEffect(() => {
    loadBadges();
    const iv = setInterval(loadBadges, 30000);
    return () => clearInterval(iv);
  }, []);

  const openTab = async (key) => {
    setTab(key);
    if (key === "workouts" || key === "nutrition") {
      try {
        await api.post(`/me/notifications/seen/${key}`);
        setBadges((b) => ({ ...b, [key]: 0 }));
      } catch {}
    }
  };

  return (
    <AppShell title={`Ciao, ${user?.name?.split(" ")[0] || "Atleta"}`}>
      <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar pt-2 -mt-2 px-2 -mx-2" data-testid="main-tabs">
        {TABS.map((t) => {
          const Icon = t.icon; const active = tab === t.key;
          const count = badges[t.key] || 0;
          return (
            <button key={t.key} onClick={() => openTab(t.key)} data-testid={`tab-${t.key}`}
                    className={`relative shrink-0 flex items-center gap-2 px-5 py-3 rounded-lg font-display font-bold uppercase tracking-wider text-sm transition border ${
                      active ? "bg-yellow-400 text-black border-yellow-400" : "border-[#262633] text-zinc-300 hover:border-yellow-500/50"
                    }`}>
              <Icon size={16} /> {t.label}
              {count > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center" data-testid={`badge-${t.key}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {tab === "workouts" && <PdfList endpoint="/me/workouts" kind="workouts" guide={guides.guide_video} />}
      {tab === "nutrition" && <PdfList endpoint="/me/nutrition/list" kind="nutrition" guide={guides.guide_video} />}
      {tab === "photos" && <PhotosTab />}
      {tab === "progress" && <ProgressTab />}
      {tab === "sessions" && <SessionsTab />}
      <div className="mt-6">
        <ContactCard />
      </div>
    </AppShell>
  );
}
