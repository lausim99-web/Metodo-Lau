import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppShell from "../components/AppShell";
import { api, formatErr } from "../api";
import { toast } from "sonner";
import { UserPlus, Users, ArrowRight, Trash2, KeyRound, Instagram, MessageCircle, Phone, Mail, Save, Search, ArrowDownAZ, ArrowUpZA, Clock, Link as LinkIcon } from "lucide-react";

const SORTS = [
  { key: "az", label: "A → Z", icon: ArrowDownAZ },
  { key: "za", label: "Z → A", icon: ArrowUpZA },
  { key: "recent", label: "Recenti", icon: Clock },
];

function ContactsEditor() {
  const [f, setF] = useState({ instagram: "", whatsapp: "", phone: "", email: "", note: "", guide_workout: "", guide_nutrition: "" });
  const [busy, setBusy] = useState(false);
  useEffect(() => { api.get("/contacts").then((r) => setF(r.data)).catch(() => {}); }, []);
  const save = async (e) => {
    e.preventDefault(); setBusy(true);
    try { await api.put("/admin/contacts", f); toast.success("Contatti salvati"); }
    catch (e) { toast.error(formatErr(e)); }
    setBusy(false);
  };
  return (
    <form onSubmit={save} className="lau-card p-5 mb-6 space-y-3">
      <div className="font-display font-bold uppercase text-white">I tuoi contatti (visibili a tutti gli atleti)</div>
      <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-4">
        <div className="flex items-center gap-2 bg-[#0A0A0D] border border-[#262633] rounded px-3">
          <Instagram size={14} className="text-yellow-400 shrink-0" />
          <input placeholder="@metodolau" value={f.instagram || ""} onChange={(e) => setF({ ...f, instagram: e.target.value })}
                 data-testid="contacts-instagram" className="flex-1 bg-transparent outline-none py-2 text-sm text-white min-w-0" />
        </div>
        <div className="flex items-center gap-2 bg-[#0A0A0D] border border-[#262633] rounded px-3">
          <MessageCircle size={14} className="text-yellow-400 shrink-0" />
          <input placeholder="+39 333..." value={f.whatsapp || ""} onChange={(e) => setF({ ...f, whatsapp: e.target.value })}
                 data-testid="contacts-whatsapp" className="flex-1 bg-transparent outline-none py-2 text-sm text-white min-w-0" />
        </div>
        <div className="flex items-center gap-2 bg-[#0A0A0D] border border-[#262633] rounded px-3">
          <Phone size={14} className="text-yellow-400 shrink-0" />
          <input placeholder="+39 333..." value={f.phone || ""} onChange={(e) => setF({ ...f, phone: e.target.value })}
                 data-testid="contacts-phone" className="flex-1 bg-transparent outline-none py-2 text-sm text-white min-w-0" />
        </div>
        <div className="flex items-center gap-2 bg-[#0A0A0D] border border-[#262633] rounded px-3">
          <Mail size={14} className="text-yellow-400 shrink-0" />
          <input placeholder="email@dominio.it" value={f.email || ""} onChange={(e) => setF({ ...f, email: e.target.value })}
                 data-testid="contacts-email" className="flex-1 bg-transparent outline-none py-2 text-sm text-white min-w-0" />
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="flex items-center gap-2 bg-[#0A0A0D] border border-[#262633] rounded px-3">
          <LinkIcon size={14} className="text-yellow-400 shrink-0" />
          <input placeholder="Link guida: come leggere la scheda di allenamento" value={f.guide_workout || ""} onChange={(e) => setF({ ...f, guide_workout: e.target.value })}
                 data-testid="contacts-guide-workout" className="flex-1 bg-transparent outline-none py-2 text-sm text-white min-w-0" />
        </div>
        <div className="flex items-center gap-2 bg-[#0A0A0D] border border-[#262633] rounded px-3">
          <LinkIcon size={14} className="text-yellow-400 shrink-0" />
          <input placeholder="Link guida: come leggere il piano alimentare" value={f.guide_nutrition || ""} onChange={(e) => setF({ ...f, guide_nutrition: e.target.value })}
                 data-testid="contacts-guide-nutrition" className="flex-1 bg-transparent outline-none py-2 text-sm text-white min-w-0" />
        </div>
      </div>
      <div className="flex gap-2">
        <input placeholder="Nota per gli atleti (opz.)" value={f.note || ""} onChange={(e) => setF({ ...f, note: e.target.value })}
               data-testid="contacts-note"
               className="flex-1 bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded px-3 py-2 text-sm text-white" />
        <button disabled={busy} type="submit" data-testid="contacts-save" className="lau-gold-btn px-4 rounded text-sm flex items-center gap-2">
          <Save size={14} /> {busy ? "..." : "Salva"}
        </button>
      </div>
    </form>
  );
}

export default function AdminDashboard() {
  const nav = useNavigate();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("az");

  const shown = clients
    .filter((c) => !q || `${c.name} ${c.email}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => sort === "az" ? a.name.localeCompare(b.name, "it")
      : sort === "za" ? b.name.localeCompare(a.name, "it")
      : (b.created_at || "").localeCompare(a.created_at || ""));

  const load = async () => {
    setLoading(true);
    try { const r = await api.get("/admin/clients"); setClients(r.data); }
    catch (e) { toast.error(formatErr(e)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const add = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/admin/clients", form);
      toast.success("Atleta creato — riceverà via email la password provvisoria");
      setForm({ name: "", email: "", password: "" });
      setShowAdd(false);
      load();
    } catch (e) { toast.error(formatErr(e)); }
    setBusy(false);
  };

  const del = async (id, name) => {
    if (!window.confirm(`Eliminare ${name}? Verranno rimossi anche scheda e piano alimentare.`)) return;
    try { await api.delete(`/admin/clients/${id}`); toast.success("Cliente eliminato"); load(); }
    catch (e) { toast.error(formatErr(e)); }
  };

  const resetPw = async (id, name) => {
    const p = window.prompt(`Nuova password per ${name}:`);
    if (!p) return;
    try { await api.put(`/admin/clients/${id}/password`, { password: p }); toast.success("Password aggiornata"); }
    catch (e) { toast.error(formatErr(e)); }
  };

  return (
    <AppShell title="Gestione Atleti">
      <ContactsEditor />
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2 text-zinc-400">
          <Users size={18} className="text-yellow-400" />
          <span className="font-mono-num text-sm"><span className="text-white font-bold">{clients.length}</span> atleti registrati</span>
        </div>
        <button onClick={() => setShowAdd(!showAdd)} data-testid="add-client-toggle" className="lau-gold-btn px-4 py-2 rounded text-sm flex items-center gap-2">
          <UserPlus size={16} /> Nuovo Atleta
        </button>
      </div>

      {showAdd && (
        <form onSubmit={add} className="lau-card p-4 sm:p-6 mb-6 grid gap-3 sm:grid-cols-3 lau-in">
          <input required placeholder="Nome e Cognome" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            data-testid="new-client-name"
            className="bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded px-3 py-3 text-sm text-white" />
          <input required type="email" placeholder="Email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            data-testid="new-client-email"
            className="bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded px-3 py-3 text-sm text-white" />
          <div className="flex gap-2">
            <input required placeholder="Password provvisoria (es. 1234)" value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              data-testid="new-client-password"
              className="flex-1 bg-[#0A0A0D] border border-[#262633] focus:border-yellow-500 outline-none rounded px-3 py-3 text-sm text-white" />
            <button disabled={busy} type="submit" data-testid="new-client-submit" className="lau-gold-btn px-4 rounded text-sm">
              {busy ? "..." : "Crea"}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="text-zinc-400 text-center py-10">Caricamento...</div>
      ) : clients.length === 0 ? (
        <div className="lau-card p-10 text-center">
          <Users className="mx-auto text-yellow-400 mb-3" size={40} />
          <p className="text-lg text-white font-bold">Nessun atleta ancora</p>
          <p className="text-sm text-zinc-400 mt-2">Aggiungi il primo atleta per iniziare a costruire le schede.</p>
        </div>
      ) : (
        <>
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="flex items-center gap-2 flex-1 bg-[#0A0A0D] border border-[#262633] focus-within:border-yellow-500 rounded-lg px-3">
            <Search size={16} className="text-yellow-400 shrink-0" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cerca atleta per nome o email..."
                   data-testid="client-search-input" className="flex-1 bg-transparent outline-none py-2.5 text-sm text-white min-w-0" />
          </div>
          <div className="flex gap-1" data-testid="client-sort">
            {SORTS.map((s) => { const I = s.icon; return (
              <button key={s.key} onClick={() => setSort(s.key)} data-testid={`sort-${s.key}`}
                      className={`flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-mono-num uppercase border transition ${
                        sort === s.key ? "bg-yellow-400 text-black border-yellow-400" : "border-[#262633] text-zinc-300 hover:border-yellow-500/50"}`}>
                <I size={14} /> {s.label}
              </button>
            ); })}
          </div>
        </div>
        {shown.length === 0 ? (
          <div className="lau-card p-8 text-center text-zinc-400" data-testid="client-search-empty">Nessun atleta corrisponde a "{q}"</div>
        ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => (
            <div key={c.id} className="lau-card p-5 lau-in" data-testid={`client-card-${c.id}`}>
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <div className="font-display font-black text-xl uppercase text-white truncate">{c.name}</div>
                  <div className="text-xs text-zinc-400 truncate">{c.email}</div>
                </div>
              </div>
        <div className="flex gap-2 mb-4 flex-wrap">
                <span className={`text-[10px] uppercase tracking-wider font-mono-num px-2 py-1 rounded ${c.has_plan ? "bg-yellow-400/15 text-yellow-400" : "bg-zinc-800 text-zinc-500"}`}>
                  {c.has_plan ? "✓ Scheda" : "○ Scheda"}
                </span>
                <span className={`text-[10px] uppercase tracking-wider font-mono-num px-2 py-1 rounded ${c.has_nutrition ? "bg-yellow-400/15 text-yellow-400" : "bg-zinc-800 text-zinc-500"}`}>
                  {c.has_nutrition ? "✓ Piano" : "○ Piano"}
                </span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => nav(`/admin/clients/${c.id}`)} data-testid={`open-client-${c.id}`} className="flex-1 lau-gold-btn px-3 py-2 rounded text-xs flex items-center justify-center gap-1">
                  Gestisci <ArrowRight size={14} />
                </button>
                <button onClick={() => resetPw(c.id, c.name)} title="Reset password" className="p-2 rounded border border-[#262633] hover:border-yellow-500/60 text-zinc-300">
                  <KeyRound size={14} />
                </button>
                <button onClick={() => del(c.id, c.name)} title="Elimina" className="p-2 rounded border border-[#262633] hover:border-red-500/60 text-zinc-300 hover:text-red-400">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
        )}
        </>
      )}
    </AppShell>
  );
}
