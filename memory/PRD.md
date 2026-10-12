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
- Auth login/logout/me con seed admin da .env (lausim99@gmail.com / Metodolau (dal 2026-06; il seed non sovrascrive più la password al riavvio))
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

## Implemented (2026-06, fork 2)
- Scadenza schede 6 settimane: `expires_at` su upload workout/nutrition; cron giornaliero `/api/cron/plan-expiry` (7 UTC) email a 7gg/1g/0g ad atleta + PT (ADMIN_EMAIL), idempotente via `expiry_notified`; l'atleta vede "Scade tra N giorni"
- Promemoria sessioni 24h E 1h prima: cron orario `/api/cron/session-reminders`, orario Europe/Rome, flag `reminder_24h_sent`/`reminder_1h_sent`
- Admin: ricerca atleti per nome/email + ordinamento A→Z / Z→A / Recenti
- Login "Rimani collegato" (30gg, localStorage) vs sessione (1g, sessionStorage)
- Link guida PT (`guide_workout`, `guide_nutrition` in /api/contacts) mostrati come "Come leggere..." nei tab Schede/Alimentazione
- Pulsante "Scarica" (`?download=1` → Content-Disposition attachment) accanto ad "Apri"
- Font corpo email aumentato a 17px
- Testing: iterazione 4 100% pass

## Implemented (2026-06, fork 2 — round 2)
- Secondo admin admin2@metodolau.it / Metodolau2; Profilo → Cambia Email (POST /api/me/email con conferma password)
- Download PDF in PWA standalone: fetch blob + Web Share API (Salva su File / Apri con Acrobat), fallback anchor download
- Badge notifica tab non più tagliato (padding sul contenitore scroll)

## Implemented (2026-06, fork 2 — round 3)
- Brand scritto ovunque "METODOLAU" (UI, manifest, email, EMAIL_FROM_NAME)
- Nome atleta normalizzato in Title Case alla creazione + migrazione one-off allo startup
- Email di benvenuto include la password provvisoria scelta dal PT (richiesta esplicita utente) con invito a cambiarla dal Profilo
- Nota contatti PT aggiornata (preview): "Scrivimi per dubbi su scheda di allenamento, alimentazione o check"

## Implemented (2026-06, fork 2 — round 4)
- Cambio password obbligatorio al primo accesso: flag `must_change_password` (set su creazione atleta e reset PT, azzerato da POST /me/password); pagina ForcePassword.jsx bloccante in App.js
- Fix overflow pulsante Carica PDF su mobile (ClientDetail)
- EMAIL_REPLY_TO → davidevr78@libero.it (il mittente tecnico resta il dominio gestito Emergent/Resend; il nome visualizzato è METODOLAU)

## Implemented (2026-06, fork 2 — round 5)
- Email feedback a 3 settimane dalla scheda allenamento (immagine /email/feedback.jpg + testo + pulsante WhatsApp wa.me/PT_WHATSAPP), inviata dal cron giornaliero plan-expiry (flag `feedback_sent` sul workout corrente); invio manuale POST /api/admin/clients/{id}/feedback-email + pulsante 'Invia email feedback' in ClientDetail
- Env: PT_WHATSAPP=393923897010
- NOTA: durante il test l'invio ha restituito 402 'Insufficient credits' (credito Emergent per email esaurito): l'utente deve ricaricare

## Implemented (2026-06, fork 2 — round 6)
- Scadenza schede: default 8 settimane; tendina 1–12 settimane o data personalizzata al caricamento (form `weeks` / `expires_at`); data modificabile sul file attuale (PATCH /api/admin/{workouts|nutrition}/{id}/expiry, resetta expiry_notified)
- Email feedback ora basata su 21 giorni dall'upload (indipendente dalla durata)

## Implemented (2026-06, fork 2 — round 7)
- Email 'scheda scaduta' (giorno 0): immagine /email/expired.jpg + testo promemoria rinnovo + pulsante WhatsApp (PT_WHATSAPP); al PT arriva una notifica breve. Invio manuale POST /api/admin/clients/{id}/expired-email + pulsante 'Email scadenza' in ClientDetail

## Implemented (2026-06, fork 2 — round 8)
- Link PT ridefiniti: `guide_video` (video: come aprire la scheda alimentare e usare la piattaforma — mostrato in entrambi i tab Schede/Alimentazione) e `website` (sito personale del PT — card 'Sito web' nei contatti). Rimossi guide_workout/guide_nutrition

## Implemented (2026-06, fork 2 — round 9)
- Visore PDF integrato (react-pdf 9.2.1 + pdfjs-dist 4.8.69, worker copiato in public/pdf.worker.min.mjs) a schermo intero via portal: Chiudi, zoom +/-, Scarica. Il pulsante 'Apri' lato atleta non apre più una nuova scheda (problema PWA senza tasto indietro). NOTA: react-pdf ultima versione richiede Node>=22, usare 9.2.1

## Implemented (2026-06, fork 2 — round 10)
- Progressi estesi (Report Plicometria): aggiunti lean_mass_kg, fat_mass_kg, waist_cm, hips_cm, chest_cm, arms_cm, legs_cm. Metriche condivise in frontend/src/metrics.js; form PT raggruppato (Composizione/BIA/Circonferenze); lato atleta card con variazione vs rilevazione precedente, mostrate solo le metriche valorizzate

## Implemented (2026-06, fork 2 — round 11)
- Sync calendario Apple/Google (read-only .ics/webcal): settings.calendar.ics_url; GET/PUT /api/admin/calendar, POST /api/admin/calendar/sync, cron ogni 30 min POST /api/cron/calendar-sync. Match atleta per email invitato o nome completo nel titolo/descrizione; crea/aggiorna/rimuove sessioni (campo calendar_uid); eventi non riconosciuti mostrati in admin. Lib: icalendar
- Email immediata 'Nuova sessione fissata' a creazione sessione (manuale o da calendario) e quando viene spostata
- Login: occhiello mostra/nascondi password
- Test: server ICS locale su :8099 → 1 creata, 1 non riconosciuta, idempotente

## Implemented (2026-06, fork 2 — round 12)
- BUG FIX traduzione automatica mobile (Acqua→Angolo, WhatsApp→Bomba, Alimentazione→Utilizzo): index.html aveva lang="en" → ora lang="it" translate="no" class="notranslate" + meta google notranslate + Content-Language it; manifest lang it. Verifica generale: iterazione 5 tutto pass (9/9 backend, frontend ok, 0 console errors)

## Backlog (P1)
- Storico progressione peso per esercizio (grafico recharts)
- Duplica scheda tra clienti / template
- Note PT sul cliente + calendario scadenza scheda (8 settimane)
- Notifica quando PT carica nuova scheda / PDF

## Backlog (P2)
- Chat PT ↔ atleta
- Video incorporati (upload GIF/mp4 per esercizio)
- Foto progressi cliente
- Multi-trainer (SaaS)
