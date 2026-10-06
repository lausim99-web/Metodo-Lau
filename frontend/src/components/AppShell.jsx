import React from "react";
import Logo from "./Logo";
import { useAuth } from "../auth";
import { LogOut, User } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function AppShell({ children, title }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  return (
    <div className="min-h-screen grain">
      <header className="sticky top-0 z-20 backdrop-blur-md bg-[#0A0A0D]/85 border-b border-[#262633]">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3">
          <div onClick={() => nav("/")} className="cursor-pointer flex items-center gap-3" data-testid="header-home">
            <Logo size={44} />
            <div className="hidden sm:block">
              <div className="font-display font-black text-xl tracking-widest uppercase leading-none text-white">METODOLAU</div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-yellow-400/80 font-mono-num">
                {user?.role === "admin" ? "Personal Trainer" : "Atleta"}
              </div>
            </div>
          </div>
          <div className="ml-auto flex items-center gap-3">
            {user && (
              <div className="hidden md:flex flex-col text-right">
                <span className="text-xs text-zinc-400 uppercase tracking-widest">Ciao</span>
                <span className="text-sm font-bold text-white truncate max-w-[180px]" data-testid="header-user-name">{user.name}</span>
              </div>
            )}
            <button
              onClick={() => nav("/profile")}
              data-testid="profile-btn"
              title="Profilo"
              className="p-2 rounded-lg border border-[#262633] hover:border-yellow-500/60 text-zinc-200 transition"
            >
              <User size={16} />
            </button>
            <button
              onClick={logout}
              data-testid="logout-btn"
              className="px-3 py-2 rounded-lg border border-[#262633] hover:border-yellow-500/60 text-zinc-200 text-sm flex items-center gap-2 transition"
            >
              <LogOut size={16} /> <span className="hidden sm:inline">Esci</span>
            </button>
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 relative z-10">
        {title && (
          <h1 className="font-display font-black text-3xl sm:text-4xl lg:text-5xl uppercase tracking-wider mb-6 text-white">
            {title}
          </h1>
        )}
        {children}
      </main>
    </div>
  );
}
