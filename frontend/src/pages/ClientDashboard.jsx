import React, { useEffect, useMemo, useState } from "react";
import AppShell from "../components/AppShell";
import { api, formatErr, getToken, API } from "../api";
import { useAuth } from "../auth";
import { toast } from "sonner";
import { Dumbbell, Utensils, History, Play, Check, Timer, Info } from "lucide-react";

const TABS = [
  { key: "workout", label: "Allenamento", icon: Dumbbell },
  { key: "nutrition", label: "Alimentazione", icon: Utensils },
  { key: "history", label: "Cronologia", icon: History },
];

function RestTimer({ seconds }) {
  const [left, setLeft] = useState(0);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (!running) return;
    if (left <= 0) { setRunning(false); toast.success("Riposo terminato!"); return; }
    const t = setTimeout(() => setLeft(left - 1), 1000);
    return () => clearTimeout(t);
  }, [left, running]);
  return (
    <button
      onClick={() => { setLeft(seconds); setRunning(true); }}
      className="flex items-center gap-2 text-xs uppercase tracking-widest text-yellow-400 hover:text-yellow-300 font-mono-num"
      data-testid="rest-timer-btn"
    >
      <Timer size={14} /> {running ? `${left}s` : `Riposo ${seconds}s`}
    </button>
  );
}

function ExerciseCard({ dayIdx, exIdx, ex, onLog }) {
  const [sets, setSets] = useState(
    Array.from({ length: ex.sets || 3 }, () => ({ reps: "", weight: "", done: false }))
  );
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const update = (i, k, v) => setSets(sets.map((s, idx) => idx === i ? { ...s, [k]: v } : s));
  const toggle = (i) => update(i, "done", !sets[i].done);

  const save = async () => {
    setSaving(true);
    try {
      await onLog({ day_index: dayIdx, exercise_index: exIdx, exercise_name: ex.name, sets, notes });
      toast.success(`${ex.name} salvato`);
    } catch (e) {
      toast.error(formatErr(e));
    } finally { setSaving(false); }
  };

  const allDone = sets.every((s) => s.done);

  return (
    <div className={`lau-card p-4 sm:p-5 lau-in ${allDone ? "border-yellow-500/60" : ""}`} data-testid={`exercise-card-${dayIdx}-${exIdx}`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-yellow-400 font-mono-num">{ex.muscle_group || "Esercizio"}</div>
          <h3 className="font-display font-black text-xl uppercase text-white leading-tight">{ex.name}</h3>
          <div className="text-xs text-zinc-400 mt-1">
            <span className="font-mono-num text-white">{ex.sets}</span> serie × <span className="font-mono-num text-white">{ex.reps}</span> reps
            {ex.weight && <> · <span className="font-mono-num text-white">{ex.weight}</span></>}
          </div>
        </div>
        <RestTimer seconds={ex.rest_sec || 90} />
      </div>
      {ex.notes && (
        <div className="flex gap-2 text-xs text-zinc-300 bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-3 py-2 mb-3">
          <Info size={14} className="text-yellow-400 mt-0.5 shrink-0" />
          <div><span className="text-yellow-400 uppercase tracking-wider font-mono-num text-[10px]">Nota PT:</span> {ex.notes}</div>
        </div>
      )}
      <div className="space-y-2">
        {sets.map((s, i) => (
          <div key={i} className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 items-center">
            <span className="text-xs uppercase text-zinc-500 font-mono-num w-6">S{i + 1}</span>
            <input
              placeholder="Kg" value={s.weight}
              onChange={(e) => update(i, "weight", e.target.value)}
              className="bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded px-3 py-2 text-sm text-white"
              data-testid={`weight-${dayIdx}-${exIdx}-${i}`}
            />
            <input
              placeholder="Reps" value={s.reps}
              onChange={(e) => update(i, "reps", e.target.value)}
              className="bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded px-3 py-2 text-sm text-white"
              data-testid={`reps-${dayIdx}-${exIdx}-${i}`}
            />
            <button
              onClick={() => toggle(i)}
              className={`checkbox-set w-11 h-11 rounded-lg border-2 border-[#262633] flex items-center justify-center ${s.done ? "done" : ""}`}
              data-testid={`done-${dayIdx}-${exIdx}-${i}`}
            >
              <Check size={20} className={s.done ? "text-black" : "text-zinc-600"} />
            </button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          placeholder="Note della sessione..." value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="flex-1 bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded px-3 py-2 text-sm text-white placeholder:text-zinc-600"
          data-testid={`ex-notes-${dayIdx}-${exIdx}`}
        />
        <button onClick={save} disabled={saving} className="lau-gold-btn px-4 py-2 rounded text-sm" data-testid={`save-${dayIdx}-${exIdx}`}>
          {saving ? "..." : "Salva"}
        </button>
      </div>
    </div>
  );
}

function WorkoutTab() {
  const [plan, setPlan] = useState(null);
  const [dayIdx, setDayIdx] = useState(0);

  useEffect(() => {
    api.get("/me/plan").then((r) => setPlan(r.data));
  }, []);

  const logExercise = async (payload) => api.post("/me/logs", payload);

  if (!plan) return <div className="text-zinc-400 text-center py-10">Caricamento...</div>;
  if (!plan.days?.length) return (
    <div className="lau-card p-8 text-center">
      <Dumbbell className="mx-auto text-yellow-400 mb-3" size={40} />
      <p className="text-lg text-white font-bold">Nessuna scheda ancora assegnata</p>
      <p className="text-sm text-zinc-400 mt-2">Il tuo Personal Trainer sta preparando il piano su misura per te.</p>
    </div>
  );

  const day = plan.days[dayIdx];

  return (
    <div className="space-y-4">
      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1" data-testid="day-tabs">
        {plan.days.map((d, i) => (
          <button
            key={i} onClick={() => setDayIdx(i)}
            data-testid={`day-tab-${i}`}
            className={`shrink-0 px-4 py-2 rounded-lg font-display font-bold uppercase tracking-wider text-sm transition border ${
              i === dayIdx ? "bg-yellow-400 text-black border-yellow-400" : "border-[#262633] text-zinc-300 hover:border-yellow-500/50"
            }`}
          >
            {d.name || `Giorno ${i + 1}`}
          </button>
        ))}
      </div>
      <div className="space-y-3">
        {day.exercises?.map((ex, i) => (
          <ExerciseCard key={i} dayIdx={dayIdx} exIdx={i} ex={ex} onLog={logExercise} />
        )) || <p className="text-zinc-500">Nessun esercizio in questo giorno.</p>}
      </div>
    </div>
  );
}

function NutritionTab() {
  const [info, setInfo] = useState(undefined);
  const [blobUrl, setBlobUrl] = useState(null);

  useEffect(() => {
    api.get("/me/nutrition/info").then((r) => setInfo(r.data));
  }, []);

  useEffect(() => {
    if (!info) return;
    const t = getToken();
    const url = `${API}/me/nutrition/file${t ? `?_=${Date.now()}` : ""}`;
    fetch(url, { credentials: "include", headers: t ? { Authorization: `Bearer ${t}` } : {} })
      .then((r) => r.blob())
      .then((b) => setBlobUrl(URL.createObjectURL(b)))
      .catch(() => {});
    return () => { if (blobUrl) URL.revokeObjectURL(blobUrl); };
    // eslint-disable-next-line
  }, [info]);

  if (info === undefined) return <div className="text-zinc-400 text-center py-10">Caricamento...</div>;
  if (!info) return (
    <div className="lau-card p-8 text-center">
      <Utensils className="mx-auto text-yellow-400 mb-3" size={40} />
      <p className="text-lg text-white font-bold">Piano alimentare non disponibile</p>
      <p className="text-sm text-zinc-400 mt-2">Il tuo PT non ha ancora caricato la scheda alimentare.</p>
    </div>
  );

  return (
    <div className="lau-card p-4 space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-yellow-400 font-mono-num">Piano alimentare</div>
          <h2 className="font-display font-black text-xl uppercase text-white">{info.filename}</h2>
        </div>
        {blobUrl && (
          <a href={blobUrl} download={info.filename} className="lau-gold-btn px-4 py-2 rounded text-sm" data-testid="nutrition-download">
            Scarica PDF
          </a>
        )}
      </div>
      {blobUrl ? (
        <iframe title="nutrition" src={blobUrl} className="w-full h-[70vh] rounded-lg border border-[#262633] bg-[#0A0A0D]" data-testid="nutrition-iframe" />
      ) : (
        <div className="text-zinc-400 text-center py-10">Caricamento PDF...</div>
      )}
    </div>
  );
}

function HistoryTab() {
  const [logs, setLogs] = useState([]);
  useEffect(() => { api.get("/me/logs").then((r) => setLogs(r.data)); }, []);
  if (!logs.length) return (
    <div className="lau-card p-8 text-center">
      <History className="mx-auto text-yellow-400 mb-3" size={40} />
      <p className="text-lg text-white font-bold">Nessuna sessione registrata</p>
      <p className="text-sm text-zinc-400 mt-2">Completa gli esercizi per costruire la tua cronologia.</p>
    </div>
  );
  return (
    <div className="space-y-3">
      {logs.map((l) => {
        const done = l.sets?.filter((s) => s.done).length || 0;
        return (
          <div key={l.id} className="lau-card p-4" data-testid={`log-${l.id}`}>
            <div className="flex items-center justify-between mb-2">
              <div className="font-display font-bold uppercase text-white">{l.exercise_name}</div>
              <div className="text-xs text-zinc-500 font-mono-num">{new Date(l.date).toLocaleString("it-IT")}</div>
            </div>
            <div className="text-xs text-zinc-400">
              <span className="text-yellow-400 font-mono-num">{done}/{l.sets?.length || 0}</span> serie · {l.sets?.map((s, i) => (
                <span key={i} className="mr-2 font-mono-num">{s.weight || "-"}kg×{s.reps || "-"}</span>
              ))}
            </div>
            {l.notes && <div className="text-xs text-zinc-500 italic mt-1">"{l.notes}"</div>}
          </div>
        );
      })}
    </div>
  );
}

export default function ClientDashboard() {
  const { user } = useAuth();
  const [tab, setTab] = useState("workout");
  const Tab = useMemo(() => ({ workout: WorkoutTab, nutrition: NutritionTab, history: HistoryTab }[tab]), [tab]);

  return (
    <AppShell title={`Ciao, ${user?.name?.split(" ")[0] || "Atleta"}`}>
      <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar" data-testid="main-tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key} onClick={() => setTab(t.key)}
              data-testid={`tab-${t.key}`}
              className={`shrink-0 flex items-center gap-2 px-5 py-3 rounded-lg font-display font-bold uppercase tracking-wider text-sm transition border ${
                active ? "bg-yellow-400 text-black border-yellow-400" : "border-[#262633] text-zinc-300 hover:border-yellow-500/50"
              }`}
            >
              <Icon size={16} /> {t.label}
            </button>
          );
        })}
      </div>
      <Tab />
    </AppShell>
  );
}
