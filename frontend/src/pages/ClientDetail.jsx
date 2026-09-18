import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import AppShell from "../components/AppShell";
import { api, formatErr } from "../api";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Upload, Save, FileText, ChevronDown, ChevronUp, Copy } from "lucide-react";

const TIPOLOGIE = ["SERIE NORMALE", "PIRAMIDALE", "SUPER SERIE", "SUPER SET", "REST.P", "PEAK CONTRACTION", "STRIPPING"];
const newExercise = () => ({ name: "", muscle_group: "", sets: 3, reps: "10", weight: "", rest_sec: 90, notes: "", gif_url: "", tipologia: "", video_url: "" });
const newDay = (i) => ({ name: `Giorno ${i}`, exercises: [newExercise()] });

export default function ClientDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const [client, setClient] = useState(null);
  const [plan, setPlan] = useState({ title: "Scheda Allenamento", days: [] });
  const [library, setLibrary] = useState([]);
  const [nutrition, setNutrition] = useState(null);
  const [openDay, setOpenDay] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [c, p, l, n] = await Promise.all([
          api.get(`/admin/clients/${id}`),
          api.get(`/admin/clients/${id}/plan`),
          api.get(`/exercises/library`),
          api.get(`/admin/clients/${id}/nutrition/info`),
        ]);
        setClient(c.data);
        setPlan(p.data.days ? p.data : { title: "Scheda Allenamento", days: [] });
        setLibrary(l.data);
        setNutrition(n.data);
      } catch (e) { toast.error(formatErr(e)); }
    })();
  }, [id]);

  const updateDay = (di, patch) => setPlan({ ...plan, days: plan.days.map((d, i) => i === di ? { ...d, ...patch } : d) });
  const updateEx = (di, ei, patch) => updateDay(di, { exercises: plan.days[di].exercises.map((e, i) => i === ei ? { ...e, ...patch } : e) });
  const addDay = () => { const d = [...plan.days, newDay(plan.days.length + 1)]; setPlan({ ...plan, days: d }); setOpenDay(d.length - 1); };
  const delDay = (di) => setPlan({ ...plan, days: plan.days.filter((_, i) => i !== di) });
  const addEx = (di, template = null) => updateDay(di, { exercises: [...plan.days[di].exercises, template ? { ...newExercise(), ...template } : newExercise()] });
  const delEx = (di, ei) => updateDay(di, { exercises: plan.days[di].exercises.filter((_, i) => i !== ei) });

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/admin/clients/${id}/plan`, plan);
      toast.success("Scheda salvata");
    } catch (e) { toast.error(formatErr(e)); }
    setSaving(false);
  };

  const uploadPdf = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    try {
      await api.post(`/admin/clients/${id}/nutrition`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Piano alimentare caricato");
      const n = await api.get(`/admin/clients/${id}/nutrition/info`); setNutrition(n.data);
    } catch (e) { toast.error(formatErr(e)); }
    e.target.value = "";
  };

  if (!client) return <AppShell><div className="text-zinc-400 text-center py-10">Caricamento...</div></AppShell>;

  return (
    <AppShell>
      <button onClick={() => nav("/admin")} className="flex items-center gap-2 text-sm text-zinc-400 hover:text-yellow-400 mb-4" data-testid="back-to-admin">
        <ArrowLeft size={16} /> Torna agli atleti
      </button>

      <div className="flex items-end justify-between flex-wrap gap-3 mb-6">
        <div>
          <div className="text-[10px] uppercase tracking-[0.35em] text-yellow-400 font-mono-num">Atleta</div>
          <h1 className="font-display font-black text-3xl sm:text-4xl uppercase text-white">{client.name}</h1>
          <div className="text-sm text-zinc-400">{client.email}</div>
        </div>
      </div>

      {/* Nutrition upload */}
      <section className="lau-card p-5 mb-6 lau-in">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <FileText className="text-yellow-400" />
            <div>
              <div className="font-display font-bold text-lg uppercase text-white">Piano Alimentare (PDF)</div>
              <div className="text-xs text-zinc-400">{nutrition ? `Caricato: ${nutrition.filename}` : "Nessun piano caricato"}</div>
            </div>
          </div>
          <label className="lau-gold-btn px-4 py-2 rounded text-sm cursor-pointer flex items-center gap-2" data-testid="upload-nutrition-btn">
            <Upload size={16} /> {nutrition ? "Sostituisci PDF" : "Carica PDF"}
            <input type="file" accept="application/pdf" onChange={uploadPdf} className="hidden" data-testid="upload-nutrition-input" />
          </label>
        </div>
      </section>

      {/* Plan editor */}
      <section className="mb-4 flex items-center justify-between flex-wrap gap-3">
        <input
          value={plan.title || ""} onChange={(e) => setPlan({ ...plan, title: e.target.value })}
          data-testid="plan-title"
          className="bg-transparent font-display font-black text-2xl uppercase text-white border-b border-[#262633] focus:border-yellow-500 outline-none px-1"
        />
        <div className="flex gap-2">
          <button onClick={addDay} data-testid="add-day-btn" className="px-3 py-2 rounded border border-[#262633] hover:border-yellow-500/60 text-sm text-white flex items-center gap-1">
            <Plus size={14} /> Giorno
          </button>
          <button onClick={save} disabled={saving} data-testid="save-plan-btn" className="lau-gold-btn px-4 py-2 rounded text-sm flex items-center gap-2">
            <Save size={16} /> {saving ? "Salvo..." : "Salva Scheda"}
          </button>
        </div>
      </section>

      <div className="space-y-3">
        {plan.days.map((d, di) => (
          <div key={di} className="lau-card p-4 lau-in" data-testid={`day-${di}`}>
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2 flex-1">
                <button onClick={() => setOpenDay(openDay === di ? -1 : di)} className="text-yellow-400">
                  {openDay === di ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
                <input
                  value={d.name} onChange={(e) => updateDay(di, { name: e.target.value })}
                  className="bg-transparent font-display font-bold uppercase text-lg text-white outline-none border-b border-transparent focus:border-yellow-500 flex-1"
                  data-testid={`day-name-${di}`}
                />
                <span className="text-xs text-zinc-500 font-mono-num">{d.exercises.length} es.</span>
              </div>
              <button onClick={() => delDay(di)} className="p-2 text-zinc-400 hover:text-red-400" data-testid={`del-day-${di}`}>
                <Trash2 size={14} />
              </button>
            </div>

            {openDay === di && (
              <div className="space-y-3 pt-2 border-t border-[#262633]">
                {d.exercises.map((ex, ei) => (
                  <div key={ei} className="bg-[#0A0A0D] border border-[#262633] rounded-lg p-3" data-testid={`plan-ex-${di}-${ei}`}>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input placeholder="Nome esercizio" value={ex.name}
                        onChange={(e) => updateEx(di, ei, { name: e.target.value })}
                        data-testid={`plan-ex-name-${di}-${ei}`}
                        className="bg-[#121218] border border-[#262633] focus:border-yellow-500 outline-none rounded px-3 py-2 text-sm text-white" />
                      <input placeholder="Gruppo muscolare" value={ex.muscle_group}
                        onChange={(e) => updateEx(di, ei, { muscle_group: e.target.value })}
                        className="bg-[#121218] border border-[#262633] focus:border-yellow-500 outline-none rounded px-3 py-2 text-sm text-white" />
                    </div>
                    <div className="grid grid-cols-4 gap-2 mt-2">
                      <input type="number" placeholder="Serie" value={ex.sets}
                        onChange={(e) => updateEx(di, ei, { sets: Number(e.target.value) || 0 })}
                        className="bg-[#121218] border border-[#262633] focus:border-yellow-500 outline-none rounded px-2 py-2 text-sm text-white" />
                      <input placeholder="Reps" value={ex.reps}
                        onChange={(e) => updateEx(di, ei, { reps: e.target.value })}
                        className="bg-[#121218] border border-[#262633] focus:border-yellow-500 outline-none rounded px-2 py-2 text-sm text-white" />
                      <input placeholder="Peso" value={ex.weight}
                        onChange={(e) => updateEx(di, ei, { weight: e.target.value })}
                        className="bg-[#121218] border border-[#262633] focus:border-yellow-500 outline-none rounded px-2 py-2 text-sm text-white" />
                      <input type="number" placeholder="Rest sec" value={ex.rest_sec}
                        onChange={(e) => updateEx(di, ei, { rest_sec: Number(e.target.value) || 0 })}
                        className="bg-[#121218] border border-[#262633] focus:border-yellow-500 outline-none rounded px-2 py-2 text-sm text-white" />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 mt-2">
                      <select value={ex.tipologia || ""}
                        onChange={(e) => updateEx(di, ei, { tipologia: e.target.value })}
                        data-testid={`plan-ex-tipologia-${di}-${ei}`}
                        className="bg-[#121218] border border-[#262633] focus:border-yellow-500 outline-none rounded px-2 py-2 text-sm text-white">
                        <option value="">Tipologia (opzionale)</option>
                        {TIPOLOGIE.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <input placeholder="Link video (opzionale)" value={ex.video_url || ""}
                        onChange={(e) => updateEx(di, ei, { video_url: e.target.value })}
                        className="bg-[#121218] border border-[#262633] focus:border-yellow-500 outline-none rounded px-3 py-2 text-sm text-white" />
                    </div>
                    <input placeholder="Note del PT (tecnica, tempo, ecc.)" value={ex.notes || ""}
                      onChange={(e) => updateEx(di, ei, { notes: e.target.value })}
                      className="mt-2 w-full bg-[#121218] border border-[#262633] focus:border-yellow-500 outline-none rounded px-3 py-2 text-sm text-white" />
                    <div className="flex justify-end mt-2">
                      <button onClick={() => delEx(di, ei)} className="text-xs text-zinc-400 hover:text-red-400 flex items-center gap-1" data-testid={`del-ex-${di}-${ei}`}>
                        <Trash2 size={12} /> Rimuovi
                      </button>
                    </div>
                  </div>
                ))}
                <div className="flex flex-wrap gap-2 pt-2">
                  <button onClick={() => addEx(di)} className="px-3 py-2 rounded border border-yellow-500/40 text-yellow-400 text-xs uppercase tracking-wider font-bold flex items-center gap-1" data-testid={`add-ex-${di}`}>
                    <Plus size={14} /> Esercizio vuoto
                  </button>
                  <details className="relative">
                    <summary className="list-none cursor-pointer px-3 py-2 rounded border border-[#262633] hover:border-yellow-500/40 text-xs uppercase tracking-wider text-zinc-300 flex items-center gap-1">
                      <Copy size={12} /> Dalla libreria
                    </summary>
                    <div className="absolute z-10 mt-1 bg-[#121218] border border-[#262633] rounded-lg p-2 max-h-72 overflow-auto w-72">
                      {library.map((lib, i) => (
                        <button key={i} onClick={() => addEx(di, lib)} className="w-full text-left text-xs text-zinc-200 hover:bg-yellow-500/10 px-2 py-1 rounded" data-testid={`lib-${di}-${i}`}>
                          <span className="text-yellow-400 font-mono-num text-[10px] uppercase mr-2">{lib.muscle_group}</span>{lib.name}
                        </button>
                      ))}
                    </div>
                  </details>
                </div>
              </div>
            )}
          </div>
        ))}
        {plan.days.length === 0 && (
          <div className="lau-card p-8 text-center text-zinc-400">
            Nessun giorno. Aggiungi il primo giorno di allenamento.
          </div>
        )}
      </div>
    </AppShell>
  );
}
