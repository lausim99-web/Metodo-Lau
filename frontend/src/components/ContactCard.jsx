import React, { useEffect, useState } from "react";
import { api } from "../api";
import { Instagram, MessageCircle, Phone, Mail, Info } from "lucide-react";

export default function ContactCard() {
  const [c, setC] = useState(null);
  useEffect(() => { api.get("/contacts").then((r) => setC(r.data)).catch(() => {}); }, []);
  if (!c || !(c.instagram || c.whatsapp || c.phone || c.email)) return null;

  const waLink = (n) => `https://wa.me/${String(n).replace(/[^0-9+]/g, "")}`;
  const tel = (n) => `tel:${String(n).replace(/\s/g, "")}`;
  const mailto = (e) => `mailto:${e}`;
  const ig = (h) => {
    const handle = String(h).replace(/^@/, "");
    return `https://instagram.com/${handle}`;
  };

  return (
    <div className="lau-card p-5 lau-in" data-testid="pt-contacts">
      <div className="text-[10px] uppercase tracking-[0.3em] text-yellow-400 font-mono-num mb-2">Contatti Personal Trainer</div>
      <h3 className="font-display font-black text-xl uppercase text-white mb-3">Contatta il tuo PT</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        {c.instagram && (
          <a href={ig(c.instagram)} target="_blank" rel="noreferrer" data-testid="contact-instagram"
             className="flex items-center gap-3 p-3 rounded-lg bg-[#0A0A0D] border border-[#262633] hover:border-yellow-500/50 transition text-sm text-white">
            <div className="w-9 h-9 rounded-full bg-yellow-400/15 border border-yellow-500/40 flex items-center justify-center shrink-0">
              <Instagram size={16} className="text-yellow-400" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-num">Instagram</div>
              <div className="truncate">{c.instagram}</div>
            </div>
          </a>
        )}
        {c.whatsapp && (
          <a href={waLink(c.whatsapp)} target="_blank" rel="noreferrer" data-testid="contact-whatsapp"
             className="flex items-center gap-3 p-3 rounded-lg bg-[#0A0A0D] border border-[#262633] hover:border-yellow-500/50 transition text-sm text-white">
            <div className="w-9 h-9 rounded-full bg-yellow-400/15 border border-yellow-500/40 flex items-center justify-center shrink-0">
              <MessageCircle size={16} className="text-yellow-400" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-num">WhatsApp</div>
              <div className="truncate">{c.whatsapp}</div>
            </div>
          </a>
        )}
        {c.phone && (
          <a href={tel(c.phone)} data-testid="contact-phone"
             className="flex items-center gap-3 p-3 rounded-lg bg-[#0A0A0D] border border-[#262633] hover:border-yellow-500/50 transition text-sm text-white">
            <div className="w-9 h-9 rounded-full bg-yellow-400/15 border border-yellow-500/40 flex items-center justify-center shrink-0">
              <Phone size={16} className="text-yellow-400" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-num">Telefono</div>
              <div className="truncate">{c.phone}</div>
            </div>
          </a>
        )}
        {c.email && (
          <a href={mailto(c.email)} data-testid="contact-email"
             className="flex items-center gap-3 p-3 rounded-lg bg-[#0A0A0D] border border-[#262633] hover:border-yellow-500/50 transition text-sm text-white">
            <div className="w-9 h-9 rounded-full bg-yellow-400/15 border border-yellow-500/40 flex items-center justify-center shrink-0">
              <Mail size={16} className="text-yellow-400" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-num">Email</div>
              <div className="truncate">{c.email}</div>
            </div>
          </a>
        )}
      </div>
      {c.note && (
        <div className="flex gap-2 text-xs text-zinc-300 bg-yellow-500/5 border border-yellow-500/20 rounded-lg px-3 py-2 mt-3">
          <Info size={14} className="text-yellow-400 mt-0.5 shrink-0" />
          <div>{c.note}</div>
        </div>
      )}
    </div>
  );
}
