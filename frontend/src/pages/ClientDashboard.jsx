import React, { useEffect, useState } from "react";
import AppShell from "../components/AppShell";
import ContactCard from "../components/ContactCard";
import { api, API, getToken, formatErr } from "../api";
import { useAuth } from "../auth";
import { Dumbbell, Utensils, Image as ImageIcon, Activity, FileText, Download, Eye } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";

const TABS = [
  { key: "workouts", label: "Schede", icon: Dumbbell },
  { key: "nutrition", label: "Alimentazione", icon: Utensils },
  { key: "photos", label: "Foto", icon: ImageIcon },
  { key: "progress", label: "Progressi", icon: Activity },
];

function PdfList({ endpoint, kind }) {
  const [items, setItems] = useState([]);
  const t = getToken();

  useEffect(() => { api.get(endpoint).then((r) => setItems(r.data)).catch(() => setItems([])); }, [endpoint]);

  const open = async (f) => {
    // apre il PDF direttamente in una nuova scheda (Acrobat / lettore PDF del browser)
    window.open(`${API}/files/${kind}/${f.id}?auth=${encodeURIComponent(t || "")}`, "_blank");
  };

  if (!items.length) return (
    <div className="lau-card p-8 text-center">
      <FileText className="mx-auto text-yellow-400 mb-3" size={40} />
      <p className="text-lg text-white font-bold">Nessun file disponibile</p>
      <p className="text-sm text-zinc-400 mt-2">Il tuo PT non ha ancora caricato nulla.</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {items.map((f, i) => (
        <div key={f.id} className={`lau-card p-4 lau-in ${i === 0 ? "border-yellow-500/40" : ""}`} data-testid={`me-${kind}-${i}`}>
          <div className="flex items-center gap-3">
            <FileText className={i === 0 ? "text-yellow-400" : "text-zinc-500"} />
            <div className="flex-1 min-w-0">
              <div className="font-display font-bold text-white uppercase truncate">{f.title || f.filename}</div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-400 font-mono-num">
                {new Date(f.uploaded_at).toLocaleDateString("it-IT")}
                {i === 0 && <span className="ml-2 text-yellow-400">· ATTUALE</span>}
                {i > 0 && <span className="ml-2 text-zinc-500">· STORICO</span>}
              </div>
            </div>
            <button onClick={() => open(f)} className="lau-gold-btn px-3 py-2 rounded text-xs flex items-center gap-1" data-testid={`me-${kind}-open-${i}`}>
              <Eye size={14} /> Apri
            </button>
          </div>
        </div>
      ))}
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
          <button key={p.id} onClick={() => blobs[p.id] && setBig(blobs[p.id])} className="relative border border-[#262633] rounded-lg overflow-hidden bg-[#0A0A0D] text-left" data-testid={`me-photo-${p.id}`}>
            {blobs[p.id] ? (
              <img src={blobs[p.id]} alt={p.tag} className="w-full h-40 object-cover" />
            ) : <div className="w-full h-40 bg-zinc-800 animate-pulse" />}
            <div className="absolute top-1 left-1 text-[9px] uppercase font-mono-num px-2 py-0.5 rounded bg-yellow-400 text-black font-bold">
              {p.tag}
            </div>
            <div className="text-[10px] p-2 text-zinc-400 font-mono-num">
              {p.photo_date || new Date(p.uploaded_at).toLocaleDateString("it-IT")}
            </div>
          </button>
        ))}
      </div>
      {big && (
        <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4" onClick={() => setBig(null)}>
          <img src={big} alt="preview" className="max-w-full max-h-full rounded" />
        </div>
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
  const METRICS = [
    { k: "weight_kg", label: "Peso", unit: "kg", color: "#F5C518" },
    { k: "bia_fat", label: "Grasso", unit: "%", color: "#FF6B6B" },
    { k: "bia_muscle", label: "Muscolo", unit: "%", color: "#4ADE80" },
    { k: "bia_water", label: "Acqua", unit: "%", color: "#38BDF8" },
    { k: "bia_bmi", label: "BMI", unit: "", color: "#C084FC" },
  ];
  const activeMetric = METRICS.find((m) => m.k === metric);
  // build ascending chronological data for chart, keeping only entries where metric is present
  const chartData = [...items]
    .slice()
    .reverse()
    .filter((p) => p[metric] != null)
    .map((p) => ({ date: p.date, value: Number(p[metric]) }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {METRICS.map((m) => (
          <button key={m.k} onClick={() => setMetric(m.k)} data-testid={`metric-${m.k}`}
                  className={`lau-card p-3 text-center lau-in transition ${metric === m.k ? "border-yellow-500/70" : ""}`}>
            <div className="text-[10px] uppercase tracking-widest font-mono-num" style={{ color: m.color }}>{m.label}</div>
            <div className="font-display font-black text-2xl text-white">
              {latest[m.k] ?? "-"}<span className="text-sm text-zinc-400 ml-1">{latest[m.k] != null ? m.unit : ""}</span>
            </div>
          </button>
        ))}
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
              <th className="text-right px-2">Peso</th>
              <th className="text-right px-2">Grasso</th>
              <th className="text-right px-2">Muscolo</th>
              <th className="text-right px-2">Acqua</th>
              <th className="text-right px-2">BMI</th>
              <th className="text-left px-2">Note</th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.id} className="border-b border-[#262633]/50 text-zinc-200">
                <td className="py-2 px-2 font-mono-num">{p.date}</td>
                <td className="text-right px-2 font-mono-num">{p.weight_kg ?? "-"}</td>
                <td className="text-right px-2 font-mono-num">{p.bia_fat ?? "-"}</td>
                <td className="text-right px-2 font-mono-num">{p.bia_muscle ?? "-"}</td>
                <td className="text-right px-2 font-mono-num">{p.bia_water ?? "-"}</td>
                <td className="text-right px-2 font-mono-num">{p.bia_bmi ?? "-"}</td>
                <td className="px-2 text-zinc-400 text-xs">{p.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ClientDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState("workouts");

  return (
    <AppShell title={`Ciao, ${user?.name?.split(" ")[0] || "Atleta"}`}>
      <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar" data-testid="main-tabs">
        {TABS.map((t) => {
          const Icon = t.icon; const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} data-testid={`tab-${t.key}`}
                    className={`shrink-0 flex items-center gap-2 px-5 py-3 rounded-lg font-display font-bold uppercase tracking-wider text-sm transition border ${
                      active ? "bg-yellow-400 text-black border-yellow-400" : "border-[#262633] text-zinc-300 hover:border-yellow-500/50"
                    }`}>
              <Icon size={16} /> {t.label}
            </button>
          );
        })}
      </div>
      {tab === "workouts" && <PdfList endpoint="/me/workouts" kind="workouts" />}
      {tab === "nutrition" && <PdfList endpoint="/me/nutrition/list" kind="nutrition" />}
      {tab === "photos" && <PhotosTab />}
      {tab === "progress" && <ProgressTab />}
      <div className="mt-6">
        <ContactCard />
      </div>
    </AppShell>
  );
}
