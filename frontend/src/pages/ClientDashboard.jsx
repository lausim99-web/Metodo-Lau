import React, { useEffect, useState } from "react";
import AppShell from "../components/AppShell";
import { api, API, getToken, formatErr } from "../api";
import { useAuth } from "../auth";
import { Dumbbell, Utensils, Image as ImageIcon, Activity, FileText, Download, Eye } from "lucide-react";

const TABS = [
  { key: "workouts", label: "Schede", icon: Dumbbell },
  { key: "nutrition", label: "Alimentazione", icon: Utensils },
  { key: "photos", label: "Foto", icon: ImageIcon },
  { key: "progress", label: "Progressi", icon: Activity },
];

function PdfList({ endpoint, kind }) {
  const [items, setItems] = useState([]);
  const [preview, setPreview] = useState(null);
  const t = getToken();

  useEffect(() => { api.get(endpoint).then((r) => setItems(r.data)).catch(() => setItems([])); }, [endpoint]);

  const open = async (f) => {
    const r = await fetch(`${API}/files/${kind}/${f.id}`, { credentials: "include", headers: t ? { Authorization: `Bearer ${t}` } : {} });
    const b = await r.blob();
    setPreview({ url: URL.createObjectURL(b), filename: f.filename });
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
      {preview && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col p-4" onClick={() => setPreview(null)}>
          <div className="flex justify-between items-center mb-2 text-white">
            <div className="font-display font-bold uppercase">{preview.filename}</div>
            <div className="flex gap-2">
              <a href={preview.url} download={preview.filename} onClick={(e) => e.stopPropagation()} className="lau-gold-btn px-3 py-2 rounded text-xs flex items-center gap-1">
                <Download size={14} /> Scarica
              </a>
              <button onClick={() => setPreview(null)} className="px-3 py-2 border border-[#262633] rounded text-xs text-white">Chiudi</button>
            </div>
          </div>
          <iframe onClick={(e) => e.stopPropagation()} title="preview" src={preview.url} className="w-full flex-1 rounded bg-white" data-testid="me-preview-iframe" />
        </div>
      )}
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
  useEffect(() => { api.get("/me/progress").then((r) => setItems(r.data)).catch(() => {}); }, []);
  if (!items.length) return (
    <div className="lau-card p-8 text-center">
      <Activity className="mx-auto text-yellow-400 mb-3" size={40} />
      <p className="text-lg text-white font-bold">Nessuna rilevazione ancora</p>
      <p className="text-sm text-zinc-400 mt-2">Il PT registrerà qui peso, BIA e check periodici.</p>
    </div>
  );
  const latest = items[0];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { k: "weight_kg", label: "Peso", unit: "kg" },
          { k: "bia_fat", label: "Grasso", unit: "%" },
          { k: "bia_muscle", label: "Muscolo", unit: "%" },
          { k: "bia_water", label: "Acqua", unit: "%" },
          { k: "bia_bmi", label: "BMI", unit: "" },
        ].map((m) => (
          <div key={m.k} className="lau-card p-3 text-center lau-in">
            <div className="text-[10px] uppercase tracking-widest text-yellow-400 font-mono-num">{m.label}</div>
            <div className="font-display font-black text-2xl text-white">
              {latest[m.k] ?? "-"}<span className="text-sm text-zinc-400 ml-1">{latest[m.k] != null ? m.unit : ""}</span>
            </div>
          </div>
        ))}
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
    </AppShell>
  );
}
