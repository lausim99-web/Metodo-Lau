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
- Admin: CRUD clienti, reset password, editor scheda multi-giorno con libreria 22 esercizi, upload PDF piano alimentare
- Client: tabs Allenamento / Alimentazione / Cronologia; card esercizio interattiva con rest-timer, checkbox serie, salvataggio log; PDF viewer via blob (iframe) con download
- Tipologia esercizio (SERIE NORMALE, PIRAMIDALE, SUPER SERIE, SUPER SET, REST.P, PEAK CONTRACTION, STRIPPING) + link video opzionale
- Logo mascotte con crop rounded-full (sfondo bianco eliminato via overflow-hidden + scale)
- Testing agent iterazione 1: 100% pass backend + frontend

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
