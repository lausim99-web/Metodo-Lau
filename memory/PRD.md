# METODO LAU — PRD

## Original problem (verbatim)
Crea un applicazione dove ogni utente potrà vedere la sua scheda di allenamento ovviamente interattiva che viene caricata dal personal trainer e anche scheda alimentare, e ovviamente dovrà essere gestita anche dal personal per caricare le schede ed esercizi per ogni persona che potranno fare Loghin con e-mail e tramite e-mail il personal può caricare tutto, l'app si chimera METODO LAU e voglio che ci sia il logo che ti mando, tu togli lo sfondo bianco dal logo.

## Personas
- **Personal Trainer (admin)** — Lau (lausim99@gmail.com). Crea account clienti, costruisce schede allenamento giorno per giorno, carica PDF piani alimentari, monitora sessioni.
- **Atleta (client)** — riceve credenziali dal PT, apre app, esegue esercizi (sets/reps/peso, checkbox), scarica PDF alimentare, consulta cronologia.

## Architecture
- Backend: FastAPI + MongoDB (motor) + JWT auth (cookie httpOnly + Bearer localStorage). Emergent Object Storage per PDF.
- Frontend: React 19 + Tailwind + Shadcn (dark warrior theme #0A0A0D/#F5C518, Barlow Condensed).
- Deploy target: preview + custom domain later.

## Implemented (2026-02)
- Auth login/logout/me con seed admin da .env (lausim99@gmail.com / MetodoLau2026!)
- Admin: CRUD clienti, reset password, upload PDF schede+alimentazione (con storico), foto prima/check/dopo con data, progressi peso+BIA, editor contatti PT
- Client: tabs Schede / Alimentazione / Foto / Progressi; viewer PDF in-app con download; galleria foto; dashboard progressi con grafico recharts (metrica cliccabile); card contatti PT (Instagram, WhatsApp, telefono, email)
- Profilo con cambio password per entrambi i ruoli
- Demo client "Mario Rossi" (mario.rossi@example.com / Mario2026!) seedato via /app/scripts/seed_mario.py con 1 scheda PDF, 1 piano alimentare PDF, 3 foto AI, 5 rilevazioni BIA
- Notifica email automatica (Resend gestito, EMERGENT_EMAIL_KEY) all'atleta quando il PT carica nuova scheda o piano alimentare — template branded METODO LAU con link app; fire-and-forget via asyncio.create_task
- Email di benvenuto automatica quando il PT crea un nuovo atleta (senza password per guardrail G2, invita a contattare il PT)
- Badge notifica in-app (rosso con conteggio) sui tab Schede/Alimentazione per upload non visti; polling 30s + mark-seen all'apertura tab
- PWA installabile: manifest.json, service worker minimo, icone logo 192/512, meta iOS/Android, titolo "METODO LAU"
- Sessioni PT private: il PT fissa data/ora/durata/luogo/note; l'atleta le vede nel tab Sessioni (badge OGGI/DOMANI); cron `.emergent/crons.yml` (6/12/18 UTC) invia promemoria email 24h prima via `/api/cron/session-reminders` (auth Bearer WEBHOOK_CRON_SECRET, idempotente via run_id)
- PDF aperti inline in nuova scheda via ?auth= token query param
- Logo mascotte con crop rounded-full (sfondo bianco eliminato via overflow-hidden + scale)
- Testing: iterazione 1 e 2 al 100% pass backend + frontend

## Deploy readiness (2026-02, health check #1 → #2)
- Iterazione 1: FAIL — N+1 query su GET /api/admin/clients + 3 query senza limit
- Fix: bulk $in queries (2 invece di 2N), has_plan ora legge db.workouts (PDF), limit(100/200) su listings
- Iterazione 2: **PASS** — pronta per il deploy Kubernetes
- Pending: deploy in produzione (~50 crediti/mese), dominio personalizzato opzionale

## Backlog (P1)
- Cambio password lato atleta dopo primo login
- Storico progressione peso per esercizio (grafico recharts)
- Duplica scheda tra clienti / template
- Note PT sul cliente + calendario scadenza scheda (8 settimane)
- Notifica quando PT carica nuova scheda / PDF

## Backlog (P2)
- Chat PT ↔ atleta
- Video incorporati (upload GIF/mp4 per esercizio)
- Foto progressi cliente
- Multi-trainer (SaaS)
