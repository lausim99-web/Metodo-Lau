"""Seed demo client Mario Rossi with workout PDF, nutrition PDF, photos and progress data."""
import os, sys, time
import requests

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

BASE = os.environ.get("BASE_URL", "https://lau-connect.preview.emergentagent.com")
ADMIN_EMAIL = "lausim99@gmail.com"
ADMIN_PASSWORD = "MetodoLau2026!"

s = requests.Session()
r = s.post(f"{BASE}/api/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
r.raise_for_status()
token = r.json()["token"]
s.headers.update({"Authorization": f"Bearer {token}"})

# 1) Create Mario Rossi
email = "mario.rossi@example.com"
clients = s.get(f"{BASE}/api/admin/clients").json()
mario = next((c for c in clients if c["email"] == email), None)
if not mario:
    r = s.post(f"{BASE}/api/admin/clients", json={"name": "Mario Rossi", "email": email, "password": "Mario2026!"})
    r.raise_for_status()
    mario = r.json()
    print("Created Mario:", mario["id"])
else:
    # reset password deterministically
    s.put(f"{BASE}/api/admin/clients/{mario['id']}/password", json={"password": "Mario2026!"})
    print("Mario exists:", mario["id"])

cid = mario["id"]

# 2) Generate PDFs
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.units import cm

def make_pdf(path, title, rows, subtitle):
    doc = SimpleDocTemplate(path, pagesize=A4)
    styles = getSampleStyleSheet()
    title_s = ParagraphStyle("t", parent=styles["Title"], textColor=colors.HexColor("#F5C518"), fontSize=20, alignment=1)
    sub_s = ParagraphStyle("s", parent=styles["Normal"], textColor=colors.HexColor("#666"), fontSize=10, alignment=1)
    story = [
        Paragraph(title, title_s),
        Paragraph(subtitle, sub_s),
        Spacer(1, 14),
    ]
    t = Table(rows, colWidths=[5*cm, 2*cm, 2.5*cm, 2*cm, 5*cm], repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#0A0A0D")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#F5C518")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#444")),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#F7F7F2")]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    story.append(t)
    story.append(Spacer(1, 14))
    story.append(Paragraph("Note: contrazione picco su ogni ripetizione. Recupero indicato tra le serie. Scadenza: 8 settimane.", styles["Normal"]))
    doc.build(story)

workout_rows = [
    ["Esercizio", "Serie", "Ripetizioni", "Rec.", "Tipologia"],
    ["Chest Press sedile basso", "3", "Max rip.", "60\"", "PEAK CONTRACTION"],
    ["Croci ai cavi", "3", "Max rip.", "60\"", "SUPER SERIE"],
    ["Croci ai cavi 90°", "4", "10", "60\"", "SERIE NORMALE"],
    ["Pectoral Machine", "3", "MAX", "60\"", "SERIE NORMALE"],
    ["Push Up", "3", "MAX", "60\"", "SERIE NORMALE"],
    ["Alzate laterali in piedi", "3", "Max rip.", "60\"", "PEAK CONTRACTION"],
    ["Shoulder Press presa esterna", "3", "10/8/6/4", "60\"", "PIRAMIDALE"],
    ["Crunch machine", "4", "20", "45\"", "SUPER SET"],
    ["Run 10' vel. 4.7", "1", "10 min", "-", "CARDIO"],
]

nutrition_rows = [
    ["Pasto", "Alimenti", "Quantità", "Kcal", "Note"],
    ["Colazione", "Yogurt greco + avena + frutta", "250g / 50g / 1", "450", "Proteico"],
    ["Spuntino", "Frutta secca + proteine whey", "20g / 30g", "280", "Post-workout"],
    ["Pranzo", "Petto di pollo + riso + verdure", "200g / 100g / libere", "650", ""],
    ["Spuntino", "Pane integrale + affettato magro", "60g / 80g", "320", ""],
    ["Cena", "Salmone + patate + insalata", "200g / 250g", "600", "Omega-3"],
    ["Pre-nanna", "Fiocchi di latte + mandorle", "200g / 15g", "200", "Caseina"],
]

make_pdf(os.path.join(SCRIPT_DIR, "workout.pdf"), "SCHEDA ALLENAMENTO - MARIO ROSSI", workout_rows, "METODOLAU · Programma di forza e ipertrofia · Giorno A · 10 giugno 2026")
make_pdf(os.path.join(SCRIPT_DIR, "nutrition.pdf"), "PIANO ALIMENTARE - MARIO ROSSI", nutrition_rows, "METODOLAU · Definizione 2400 kcal · Proteine 180g · Carboidrati 200g · Grassi 60g")

# 3) Upload PDFs (keep existing ones if any)
existing_w = s.get(f"{BASE}/api/admin/clients/{cid}/workouts").json()
if not existing_w:
    with open(os.path.join(SCRIPT_DIR, "workout.pdf"), "rb") as f:
        s.post(f"{BASE}/api/admin/clients/{cid}/workouts", files={"file": ("scheda_allenamento.pdf", f, "application/pdf")}, data={"title": "Scheda A - Luglio"})
    print("Uploaded workout PDF")

existing_n = s.get(f"{BASE}/api/admin/clients/{cid}/nutrition/list").json()
if not existing_n:
    with open(os.path.join(SCRIPT_DIR, "nutrition.pdf"), "rb") as f:
        s.post(f"{BASE}/api/admin/clients/{cid}/nutrition", files={"file": ("piano_alimentare.pdf", f, "application/pdf")}, data={"title": "Piano 2400 kcal"})
    print("Uploaded nutrition PDF")

# 4) Upload photos
existing_p = s.get(f"{BASE}/api/admin/clients/{cid}/photos").json()
if not existing_p:
    for fn, tag, dt, note in [
        ("before.jpg", "prima", "2026-01-05", "Prima foto - inizio percorso"),
        ("check.jpg", "check", "2026-02-02", "Check 4 settimane"),
        ("after.jpg", "dopo", "2026-03-01", "Dopo 8 settimane"),
    ]:
        with open(os.path.join(SCRIPT_DIR, fn), "rb") as f:
            s.post(f"{BASE}/api/admin/clients/{cid}/photos", files={"file": (fn, f, "image/jpeg")}, data={"tag": tag, "photo_date": dt, "notes": note})
    print("Uploaded 3 photos")

# 5) Progress entries
existing_prog = s.get(f"{BASE}/api/admin/clients/{cid}/progress").json()
if not existing_prog:
    for dt, w, fat, mus, water, bmi, note in [
        ("2026-01-05", 88.4, 27.5, 36.2, 51.0, 26.5, "BIA iniziale"),
        ("2026-01-19", 86.9, 26.1, 36.8, 51.5, 26.1, ""),
        ("2026-02-02", 85.3, 24.6, 37.5, 52.2, 25.6, "BIA 4 settimane"),
        ("2026-02-16", 83.7, 23.1, 38.1, 52.8, 25.1, ""),
        ("2026-03-01", 82.2, 21.8, 38.8, 53.4, 24.6, "BIA 8 settimane - obiettivo raggiunto"),
    ]:
        s.post(f"{BASE}/api/admin/clients/{cid}/progress", json={"date": dt, "weight_kg": w, "bia_fat": fat, "bia_muscle": mus, "bia_water": water, "bia_bmi": bmi, "notes": note})
    print("Inserted 5 progress entries")

# 6) Seed default PT contacts
contacts = {
    "instagram": "@metodolau",
    "whatsapp": "+39 333 123 4567",
    "phone": "+39 333 123 4567",
    "email": "lausim99@gmail.com",
    "note": "Scrivimi per dubbi su scheda, dieta o check settimanali.",
}
s.put(f"{BASE}/api/admin/contacts", json=contacts)
print("PT contacts seeded")

print("DONE — Mario login:", email, "/ Mario2026!")
