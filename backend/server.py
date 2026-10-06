from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import re
import hmac
import uuid
import logging
import ipaddress
import asyncio
import httpx
import bcrypt
import jwt as pyjwt
import requests as http_requests
from html import escape
from html.parser import HTMLParser
from urllib.parse import urlparse
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from typing import List, Optional, Any
from bson import ObjectId

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File, Form, Query
from fastapi.responses import Response as FastResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field

# ---------- Config ----------
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALG = "HS256"
ADMIN_EMAIL = os.environ["ADMIN_EMAIL"].lower()
ADMIN_PASSWORD = os.environ["ADMIN_PASSWORD"]
APP_NAME = os.environ.get("APP_NAME", "metodolau")
APP_URL = os.environ.get("APP_URL", "https://lau-connect.preview.emergentagent.com").rstrip("/")
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY")
EMAIL_FROM_NAME = os.environ.get("EMAIL_FROM_NAME", "METODO LAU")
EMAIL_REPLY_TO = os.environ.get("EMAIL_REPLY_TO")
EMAIL_BASE_URL = "https://integrations.emergentagent.com"
WEBHOOK_CRON_SECRET = os.environ.get("WEBHOOK_CRON_SECRET")
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
ROME = ZoneInfo("Europe/Rome")
PLAN_DURATION_DAYS = 42  # 6 settimane
EXPIRY_STAGES = {7: "7d", 1: "1d", 0: "0d"}
BODY = "color:#e4e4e7;font-size:17px;line-height:1.7"

mongo_url = os.environ['MONGO_URL']
mongo_client = AsyncIOMotorClient(mongo_url)
db = mongo_client[os.environ['DB_NAME']]

app = FastAPI()
api = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ---------- Storage ----------
storage_key: Optional[str] = None

def init_storage(force: bool = False) -> Optional[str]:
    global storage_key
    if storage_key and not force:
        return storage_key
    if not EMERGENT_KEY:
        logger.warning("EMERGENT_LLM_KEY missing; storage disabled")
        return None
    try:
        r = http_requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
        r.raise_for_status()
        storage_key = r.json()["storage_key"]
        return storage_key
    except Exception as e:
        logger.error(f"Storage init failed: {e}")
        return None

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    if not key:
        raise HTTPException(500, "Storage not available")
    r = http_requests.put(f"{STORAGE_URL}/objects/{path}",
                          headers={"X-Storage-Key": key, "Content-Type": content_type},
                          data=data, timeout=120)
    if r.status_code == 404:
        key = init_storage(force=True)
        r = http_requests.put(f"{STORAGE_URL}/objects/{path}",
                              headers={"X-Storage-Key": key, "Content-Type": content_type},
                              data=data, timeout=120)
    r.raise_for_status()
    return r.json()

def get_object(path: str):
    key = init_storage()
    if not key:
        raise HTTPException(500, "Storage not available")
    r = http_requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    if r.status_code == 404:
        key = init_storage(force=True)
        r = http_requests.get(f"{STORAGE_URL}/objects/{path}", headers={"X-Storage-Key": key}, timeout=60)
    r.raise_for_status()
    return r.content, r.headers.get("Content-Type", "application/octet-stream")

# ---------- Email (managed Resend) ----------
_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)

def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)

def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)

class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []
    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []
    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)
    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []

def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan(); scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks for credentials: {p!r}")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r}")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Invalid URL in email: {url!r}")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != link host {real!r}")

async def send_email(*, to: str, subject: str, html: str, reply_to: str = None):
    if not EMAIL_KEY:
        logger.warning("EMERGENT_EMAIL_KEY missing; email skipped")
        return None
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if reply_to or EMAIL_REPLY_TO:
        payload["contact_email"] = reply_to or EMAIL_REPLY_TO
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(f"{EMAIL_BASE_URL}/api/v1/email/send",
                                     headers={"X-Email-Key": EMAIL_KEY}, json=payload)
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        logger.error(f"Email send failed: {e.response.status_code} {e.response.text}")
        return None
    except Exception as e:
        logger.error(f"Email send error: {e}")
        return None

async def notify_client_upload(client_id: str, kind_label: str, title: str):
    """Fire-and-forget email notification when PT uploads a workout or nutrition PDF."""
    try:
        client = await db.users.find_one({"_id": ObjectId(client_id)}, {"_id": 0, "email": 1, "name": 1})
        if not client:
            return
        name = escape(client.get("name") or "Atleta")
        label = escape(kind_label)
        doc_title = escape(title or "")
        subject = f"{EMAIL_FROM_NAME}: nuova {kind_label} caricata"
        html = (
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0D;padding:32px 16px">'
            '<tr><td align="center"><table role="presentation" width="560" cellpadding="0" cellspacing="0" '
            'style="background:#121218;border:1px solid #262633;border-radius:12px;padding:32px;font-family:Arial,sans-serif">'
            '<tr><td><div style="color:#F5C518;font-size:12px;letter-spacing:3px;text-transform:uppercase">METODO LAU</div>'
            f'<h1 style="color:#ffffff;font-size:24px;margin:12px 0 8px">Nuova {label} disponibile</h1>'
            f'<p style="color:#e4e4e7;font-size:17px;line-height:1.7;margin:0 0 16px">Ciao {name}, il tuo Personal Trainer ha appena caricato '
            f'una nuova <strong style="color:#F5C518">{label}</strong>' + (f' &mdash; <em>{doc_title}</em>' if doc_title else '') + '.</p>'
            f'<a href="{APP_URL}" style="display:inline-block;background:#F5C518;color:#0A0A0D;font-weight:bold;font-size:14px;'
            'text-transform:uppercase;letter-spacing:1px;text-decoration:none;padding:12px 28px;border-radius:8px">Apri l\'app METODO LAU</a>'
            f'<p style="color:#52525b;font-size:12px;margin:24px 0 0">Inviata da {escape(EMAIL_FROM_NAME)}. Non chiediamo mai password o dati di pagamento via email.</p>'
            '</td></tr></table></td></tr></table>'
        )
        await send_email(to=client["email"], subject=subject, html=html)
    except Exception as e:
        logger.error(f"notify_client_upload failed: {e}")

async def send_welcome_email(email: str, name: str):
    """Welcome email when PT creates a new client. Never includes the password (G2) —
    the PT shares credentials personally."""
    try:
        subject = f"Benvenuto in {EMAIL_FROM_NAME}"
        html = (
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0D;padding:32px 16px">'
            '<tr><td align="center"><table role="presentation" width="560" cellpadding="0" cellspacing="0" '
            'style="background:#121218;border:1px solid #262633;border-radius:12px;padding:32px;font-family:Arial,sans-serif">'
            '<tr><td><div style="color:#F5C518;font-size:12px;letter-spacing:3px;text-transform:uppercase">METODO LAU</div>'
            f'<h1 style="color:#ffffff;font-size:24px;margin:12px 0 8px">Benvenuto, {escape(name)}</h1>'
            '<p style="color:#e4e4e7;font-size:17px;line-height:1.7;margin:0 0 8px">Il tuo Personal Trainer ha creato il tuo account METODO LAU.</p>'
            f'<p style="color:#e4e4e7;font-size:17px;line-height:1.7;margin:0 0 16px">Accedi con la tua email (<strong style="color:#fff">{escape(email)}</strong>) '
            'e la password che il tuo PT ti ha comunicato personalmente.</p>'
            f'<a href="{APP_URL}" style="display:inline-block;background:#F5C518;color:#0A0A0D;font-weight:bold;font-size:14px;'
            'text-transform:uppercase;letter-spacing:1px;text-decoration:none;padding:12px 28px;border-radius:8px">Apri l\'app METODO LAU</a>'
            '<p style="color:#d4d4d8;font-size:16px;line-height:1.7;margin:20px 0 0">Dentro trovi la tua scheda di allenamento, il piano alimentare, '
            'le foto dei progressi e le tue rilevazioni.</p>'
            f'<p style="color:#52525b;font-size:12px;margin:24px 0 0">Inviata da {escape(EMAIL_FROM_NAME)}. Non chiediamo mai password o dati di pagamento via email.</p>'
            '</td></tr></table></td></tr></table>'
        )
        await send_email(to=email, subject=subject, html=html)
    except Exception as e:
        logger.error(f"send_welcome_email failed: {e}")

# ---------- Auth Helpers ----------
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()

def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False

def create_access_token(uid: str, email: str, role: str, days: int = 1) -> str:
    return pyjwt.encode({"sub": uid, "email": email, "role": role,
                         "exp": datetime.now(timezone.utc) + timedelta(days=days),
                         "type": "access"}, JWT_SECRET, algorithm=JWT_ALG)

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    if not user:
        raise HTTPException(401, "User not found")
    user["id"] = str(user["_id"])
    user.pop("_id", None)
    user.pop("password_hash", None)
    return user

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin access required")
    return user

# ---------- In-app notification badges ----------
@api.get("/me/notifications")
async def my_notifications(user: dict = Depends(get_current_user)):
    w = await db.workouts.count_documents({"user_id": user["id"], "seen": False})
    n = await db.nutrition.count_documents({"user_id": user["id"], "seen": False})
    return {"workouts": w, "nutrition": n}

@api.post("/me/notifications/seen/{kind}")
async def mark_seen(kind: str, user: dict = Depends(get_current_user)):
    if kind not in ("workouts", "nutrition"):
        raise HTTPException(400, "Tipo non valido")
    await getattr(db, kind).update_many({"user_id": user["id"]}, {"$set": {"seen": True}})
    return {"ok": True}

# ---------- Models ----------
class LoginIn(BaseModel):
    email: EmailStr
    password: str
    remember: bool = False

class CreateClientIn(BaseModel):
    email: EmailStr
    password: str
    name: str

class ResetPwIn(BaseModel):
    password: str

class ChangePwIn(BaseModel):
    current_password: str
    new_password: str

class ChangeEmailIn(BaseModel):
    new_email: EmailStr
    password: str

class ExerciseIn(BaseModel):
    name: str
    muscle_group: Optional[str] = ""
    sets: int = 3
    reps: str = "10"
    weight: str = ""
    rest_sec: int = 90
    notes: Optional[str] = ""
    gif_url: Optional[str] = ""
    tipologia: Optional[str] = ""
    video_url: Optional[str] = ""

class WorkoutDayIn(BaseModel):
    name: str
    exercises: List[ExerciseIn] = []

class WorkoutPlanIn(BaseModel):
    title: str = "Scheda Allenamento"
    days: List[WorkoutDayIn] = []
    expires_at: Optional[str] = None  # ISO date string
    duration_weeks: Optional[int] = 8

class SetLogIn(BaseModel):
    reps: str = ""
    weight: str = ""
    done: bool = False

class WorkoutLogIn(BaseModel):
    day_index: int
    exercise_index: int
    exercise_name: str
    sets: List[SetLogIn] = []
    notes: Optional[str] = ""

class ProgressIn(BaseModel):
    date: Optional[str] = None  # ISO date
    weight_kg: Optional[float] = None
    bia_fat: Optional[float] = None
    bia_muscle: Optional[float] = None
    bia_water: Optional[float] = None
    bia_bmi: Optional[float] = None
    notes: Optional[str] = ""

class ContactsIn(BaseModel):
    instagram: Optional[str] = ""
    whatsapp: Optional[str] = ""
    phone: Optional[str] = ""
    email: Optional[str] = ""
    note: Optional[str] = ""
    guide_workout: Optional[str] = ""
    guide_nutrition: Optional[str] = ""

class SessionIn(BaseModel):
    date: str  # YYYY-MM-DD
    time: str  # HH:MM
    duration_min: int = 60
    location: Optional[str] = ""
    notes: Optional[str] = ""

# ---------- Cookie helper ----------
def set_auth_cookie(resp: Response, token: str, days: Optional[int] = None):
    resp.set_cookie("access_token", token, httponly=True, secure=True,
                    samesite="none", max_age=(60 * 60 * 24 * days) if days else None, path="/")

# ---------- Auth Routes ----------
@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Email o password errati")
    days = 30 if body.remember else 1
    token = create_access_token(str(user["_id"]), email, user["role"], days)
    set_auth_cookie(response, token, days if body.remember else None)
    return {"id": str(user["_id"]), "email": email, "name": user["name"], "role": user["role"], "token": token}

@api.post("/auth/logout")
async def logout(response: Response):
    response.delete_cookie("access_token", path="/")
    return {"ok": True}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user

@api.post("/me/password")
async def change_my_password(body: ChangePwIn, user: dict = Depends(get_current_user)):
    if len(body.new_password) < 6:
        raise HTTPException(400, "La nuova password deve avere almeno 6 caratteri")
    doc = await db.users.find_one({"_id": ObjectId(user["id"])})
    if not doc or not verify_password(body.current_password, doc["password_hash"]):
        raise HTTPException(400, "Password attuale non corretta")
    await db.users.update_one({"_id": ObjectId(user["id"])},
                              {"$set": {"password_hash": hash_password(body.new_password)}})
    return {"ok": True}

@api.post("/me/email")
async def change_my_email(body: ChangeEmailIn, user: dict = Depends(get_current_user)):
    new_email = body.new_email.lower().strip()
    doc = await db.users.find_one({"_id": ObjectId(user["id"])})
    if not doc or not verify_password(body.password, doc["password_hash"]):
        raise HTTPException(400, "Password non corretta")
    if await db.users.find_one({"email": new_email, "_id": {"$ne": doc["_id"]}}):
        raise HTTPException(400, "Email già registrata")
    await db.users.update_one({"_id": doc["_id"]}, {"$set": {"email": new_email}})
    return {"ok": True, "email": new_email}

# ---------- Admin: clients ----------
@api.post("/admin/clients")
async def create_client(body: CreateClientIn, _: dict = Depends(require_admin)):
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email già registrata")
    doc = {"email": email, "password_hash": hash_password(body.password),
           "name": body.name, "role": "client",
           "created_at": datetime.now(timezone.utc).isoformat()}
    r = await db.users.insert_one(doc)
    asyncio.create_task(send_welcome_email(email, body.name))
    return {"id": str(r.inserted_id), "email": email, "name": body.name, "role": "client"}

@api.get("/admin/clients")
async def list_clients(_: dict = Depends(require_admin)):
    clients = []
    async for u in db.users.find({"role": "client"}).sort("created_at", -1):
        clients.append(u)
    if not clients:
        return []
    ids = [str(u["_id"]) for u in clients]
    # 2 bulk queries instead of N+1: which clients have workout PDFs / nutrition PDFs
    plan_ids = set()
    async for d in db.workouts.find({"user_id": {"$in": ids}}, {"user_id": 1}):
        plan_ids.add(d["user_id"])
    nut_ids = set()
    async for d in db.nutrition.find({"user_id": {"$in": ids}}, {"user_id": 1}):
        nut_ids.add(d["user_id"])
    return [{"id": str(u["_id"]), "email": u["email"], "name": u["name"],
             "has_plan": str(u["_id"]) in plan_ids,
             "has_nutrition": str(u["_id"]) in nut_ids,
             "created_at": u.get("created_at")} for u in clients]

@api.get("/admin/clients/{client_id}")
async def get_client(client_id: str, _: dict = Depends(require_admin)):
    u = await db.users.find_one({"_id": ObjectId(client_id), "role": "client"})
    if not u:
        raise HTTPException(404, "Cliente non trovato")
    return {"id": str(u["_id"]), "email": u["email"], "name": u["name"]}

@api.delete("/admin/clients/{client_id}")
async def delete_client(client_id: str, _: dict = Depends(require_admin)):
    await db.users.delete_one({"_id": ObjectId(client_id), "role": "client"})
    await db.plans.delete_many({"user_id": client_id})
    await db.nutrition.delete_many({"user_id": client_id})
    await db.logs.delete_many({"user_id": client_id})
    return {"ok": True}

@api.put("/admin/clients/{client_id}/password")
async def reset_pw(client_id: str, body: ResetPwIn, _: dict = Depends(require_admin)):
    r = await db.users.update_one({"_id": ObjectId(client_id), "role": "client"},
                                  {"$set": {"password_hash": hash_password(body.password)}})
    if r.matched_count == 0:
        raise HTTPException(404, "Cliente non trovato")
    return {"ok": True}

# ---------- Workout Plan ----------
async def _upsert_plan(user_id: str, plan: WorkoutPlanIn):
    doc = plan.model_dump()
    doc["user_id"] = user_id
    doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.plans.update_one({"user_id": user_id}, {"$set": doc}, upsert=True)

@api.put("/admin/clients/{client_id}/plan")
async def save_plan(client_id: str, body: WorkoutPlanIn, _: dict = Depends(require_admin)):
    await _upsert_plan(client_id, body)
    return {"ok": True}

@api.get("/admin/clients/{client_id}/plan")
async def admin_get_plan(client_id: str, _: dict = Depends(require_admin)):
    p = await db.plans.find_one({"user_id": client_id})
    if not p:
        return {"title": "Scheda Allenamento", "days": []}
    p.pop("_id", None)
    return p

@api.get("/me/plan")
async def my_plan(user: dict = Depends(get_current_user)):
    p = await db.plans.find_one({"user_id": user["id"]})
    if not p:
        return {"title": "Scheda Allenamento", "days": []}
    p.pop("_id", None)
    return p

# ---------- Workout Logs ----------
@api.post("/me/logs")
async def add_log(body: WorkoutLogIn, user: dict = Depends(get_current_user)):
    doc = body.model_dump()
    doc["user_id"] = user["id"]
    doc["date"] = datetime.now(timezone.utc).isoformat()
    doc["id"] = str(uuid.uuid4())
    await db.logs.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.get("/me/logs")
async def my_logs(user: dict = Depends(get_current_user)):
    out = []
    async for l in db.logs.find({"user_id": user["id"]}).sort("date", -1).limit(200):
        l.pop("_id", None)
        out.append(l)
    return out

@api.get("/admin/clients/{client_id}/logs")
async def client_logs(client_id: str, _: dict = Depends(require_admin)):
    out = []
    async for l in db.logs.find({"user_id": client_id}).sort("date", -1).limit(200):
        l.pop("_id", None)
        out.append(l)
    return out

def _expiry_from_now() -> str:
    return (datetime.now(ROME).date() + timedelta(days=PLAN_DURATION_DAYS)).isoformat()

def _expiry_of(doc: dict) -> str:
    if doc.get("expires_at"):
        return doc["expires_at"]
    up = datetime.fromisoformat(doc["uploaded_at"].replace("Z", "+00:00"))
    return (up.astimezone(ROME).date() + timedelta(days=PLAN_DURATION_DAYS)).isoformat()

# ---------- Nutrition PDF ----------
@api.post("/admin/clients/{client_id}/nutrition")
async def upload_nutrition(client_id: str, title: str = Form(""), file: UploadFile = File(...), _: dict = Depends(require_admin)):
    u = await db.users.find_one({"_id": ObjectId(client_id)})
    if not u:
        raise HTTPException(404, "Cliente non trovato")
    if not (file.content_type or "").startswith("application/pdf") and not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Solo file PDF sono ammessi")
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(400, "File troppo grande (max 15MB)")
    path = f"{APP_NAME}/nutrition/{client_id}/{uuid.uuid4()}.pdf"
    result = put_object(path, data, "application/pdf")
    doc = {"id": str(uuid.uuid4()), "user_id": client_id, "storage_path": result["path"],
           "filename": file.filename, "title": title or file.filename,
           "size": result.get("size", len(data)), "seen": False,
           "uploaded_at": datetime.now(timezone.utc).isoformat(),
           "expires_at": _expiry_from_now(), "expiry_notified": []}
    await db.nutrition.insert_one(doc)
    doc.pop("_id", None)
    asyncio.create_task(notify_client_upload(client_id, "piano alimentare", doc["title"]))
    return doc

async def _list_files(collection, user_id: str):
    out = []
    async for f in collection.find({"user_id": user_id}).sort("uploaded_at", -1).limit(100):
        f.pop("_id", None)
        f["expires_at"] = _expiry_of(f)
        out.append(f)
    return out

@api.get("/admin/clients/{client_id}/nutrition/list")
async def admin_nutrition_list(client_id: str, _: dict = Depends(require_admin)):
    return await _list_files(db.nutrition, client_id)

@api.get("/me/nutrition/list")
async def my_nutrition_list(user: dict = Depends(get_current_user)):
    return await _list_files(db.nutrition, user["id"])

async def _token_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        h = request.headers.get("Authorization", "")
        if h.startswith("Bearer "):
            token = h[7:]
    if not token:
        token = request.query_params.get("auth")
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except Exception:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    if not user:
        raise HTTPException(401, "User not found")
    return {"id": str(user["_id"]), "role": user.get("role", "client")}

async def _serve_file(collection, file_id: str, requester_id: str, is_admin: bool, download: bool = False):
    doc = await collection.find_one({"id": file_id})
    if not doc:
        raise HTTPException(404, "File non trovato")
    if not is_admin and doc["user_id"] != requester_id:
        raise HTTPException(403, "Non autorizzato")
    data, ct = get_object(doc["storage_path"])
    disp = "attachment" if download else "inline"
    fname = re.sub(r'[^\w.\- ]', '_', doc.get("filename") or "file.pdf")
    return FastResponse(content=data, media_type=doc.get("content_type") or "application/pdf",
                        headers={"Content-Disposition": f'{disp}; filename="{fname}"'})

@api.get("/files/nutrition/{file_id}")
async def download_nutrition(file_id: str, request: Request, download: int = 0):
    u = await _token_user(request)
    return await _serve_file(db.nutrition, file_id, u["id"], u["role"] == "admin", bool(download))

@api.delete("/admin/nutrition/{file_id}")
async def delete_nutrition(file_id: str, _: dict = Depends(require_admin)):
    r = await db.nutrition.delete_one({"id": file_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "File non trovato")
    return {"ok": True}

# Legacy singular endpoints (backwards compat)
@api.get("/admin/clients/{client_id}/nutrition/info")
async def admin_nutrition_info(client_id: str, _: dict = Depends(require_admin)):
    n = await db.nutrition.find_one({"user_id": client_id}, sort=[("uploaded_at", -1)])
    if not n: return None
    n.pop("_id", None); return n

@api.get("/me/nutrition/info")
async def my_nutrition_info(user: dict = Depends(get_current_user)):
    n = await db.nutrition.find_one({"user_id": user["id"]}, sort=[("uploaded_at", -1)])
    if not n: return None
    n.pop("_id", None); return n

@api.get("/me/nutrition/file")
async def my_nutrition_file(user: dict = Depends(get_current_user)):
    n = await db.nutrition.find_one({"user_id": user["id"]}, sort=[("uploaded_at", -1)])
    if not n: raise HTTPException(404, "Nessun piano alimentare disponibile")
    data, ct = get_object(n["storage_path"])
    return FastResponse(content=data, media_type="application/pdf",
                        headers={"Content-Disposition": f'inline; filename="{n.get("filename","piano.pdf")}"'})

@api.get("/admin/clients/{client_id}/nutrition/file")
async def admin_nutrition_file(client_id: str, _: dict = Depends(require_admin)):
    n = await db.nutrition.find_one({"user_id": client_id}, sort=[("uploaded_at", -1)])
    if not n: raise HTTPException(404, "Nessun piano alimentare")
    data, ct = get_object(n["storage_path"])
    return FastResponse(content=data, media_type="application/pdf")

# ---------- Workout PDFs (with history) ----------
@api.post("/admin/clients/{client_id}/workouts")
async def upload_workout(client_id: str, title: str = Form(""), file: UploadFile = File(...), _: dict = Depends(require_admin)):
    if not (file.content_type or "").startswith("application/pdf") and not file.filename.lower().endswith(".pdf"):
        raise HTTPException(400, "Solo file PDF sono ammessi")
    data = await file.read()
    if len(data) > 15 * 1024 * 1024:
        raise HTTPException(400, "File troppo grande (max 15MB)")
    path = f"{APP_NAME}/workouts/{client_id}/{uuid.uuid4()}.pdf"
    result = put_object(path, data, "application/pdf")
    doc = {"id": str(uuid.uuid4()), "user_id": client_id, "storage_path": result["path"],
           "filename": file.filename, "title": title or file.filename,
           "size": result.get("size", len(data)), "seen": False,
           "uploaded_at": datetime.now(timezone.utc).isoformat(),
           "expires_at": _expiry_from_now(), "expiry_notified": []}
    await db.workouts.insert_one(doc)
    doc.pop("_id", None)
    asyncio.create_task(notify_client_upload(client_id, "scheda di allenamento", doc["title"]))
    return doc

@api.get("/admin/clients/{client_id}/workouts")
async def admin_workouts_list(client_id: str, _: dict = Depends(require_admin)):
    return await _list_files(db.workouts, client_id)

@api.get("/me/workouts")
async def my_workouts(user: dict = Depends(get_current_user)):
    return await _list_files(db.workouts, user["id"])

@api.get("/files/workouts/{file_id}")
async def download_workout(file_id: str, request: Request, download: int = 0):
    u = await _token_user(request)
    return await _serve_file(db.workouts, file_id, u["id"], u["role"] == "admin", bool(download))

@api.delete("/admin/workouts/{file_id}")
async def delete_workout(file_id: str, _: dict = Depends(require_admin)):
    r = await db.workouts.delete_one({"id": file_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "File non trovato")
    return {"ok": True}

# ---------- Photos (prima/dopo) ----------
ALLOWED_IMG = {"image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"}

@api.post("/admin/clients/{client_id}/photos")
async def upload_photo(client_id: str, tag: str = Form("prima"), photo_date: str = Form(""),
                       notes: str = Form(""), file: UploadFile = File(...), _: dict = Depends(require_admin)):
    ct = file.content_type or ""
    if ct not in ALLOWED_IMG and not any(file.filename.lower().endswith(e) for e in [".jpg",".jpeg",".png",".webp",".heic",".heif"]):
        raise HTTPException(400, "Formato immagine non supportato")
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        raise HTTPException(400, "Immagine troppo grande (max 10MB)")
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "jpg"
    path = f"{APP_NAME}/photos/{client_id}/{uuid.uuid4()}.{ext}"
    result = put_object(path, data, ct or "image/jpeg")
    doc = {"id": str(uuid.uuid4()), "user_id": client_id, "storage_path": result["path"],
           "filename": file.filename, "tag": tag, "photo_date": photo_date or None,
           "notes": notes, "content_type": ct or "image/jpeg",
           "uploaded_at": datetime.now(timezone.utc).isoformat()}
    await db.photos.insert_one(doc)
    doc.pop("_id", None)
    return doc

async def _list_photos(user_id: str):
    out = []
    async for p in db.photos.find({"user_id": user_id}).sort([("photo_date", -1), ("uploaded_at", -1)]).limit(100):
        p.pop("_id", None); out.append(p)
    return out

@api.get("/admin/clients/{client_id}/photos")
async def admin_photos(client_id: str, _: dict = Depends(require_admin)):
    return await _list_photos(client_id)

@api.get("/me/photos")
async def my_photos(user: dict = Depends(get_current_user)):
    return await _list_photos(user["id"])

@api.get("/files/photos/{file_id}")
async def download_photo(file_id: str, authorization: Optional[str] = None,
                         auth: Optional[str] = Query(None), request: Request = None):
    # accept auth via header, cookie or query param (needed for <img> tags)
    token = request.cookies.get("access_token") if request else None
    if not token:
        h = (request.headers.get("Authorization") if request else None) or ""
        if h.startswith("Bearer "):
            token = h[7:]
    if not token and auth:
        token = auth
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
    except Exception:
        raise HTTPException(401, "Invalid token")
    user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    if not user:
        raise HTTPException(401, "User not found")
    doc = await db.photos.find_one({"id": file_id})
    if not doc:
        raise HTTPException(404, "Foto non trovata")
    if user.get("role") != "admin" and doc["user_id"] != str(user["_id"]):
        raise HTTPException(403, "Non autorizzato")
    data, ct = get_object(doc["storage_path"])
    return FastResponse(content=data, media_type=doc.get("content_type") or ct)

@api.delete("/admin/photos/{file_id}")
async def delete_photo(file_id: str, _: dict = Depends(require_admin)):
    r = await db.photos.delete_one({"id": file_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Foto non trovata")
    return {"ok": True}

# ---------- Progress (peso + BIA) ----------
@api.post("/admin/clients/{client_id}/progress")
async def add_progress(client_id: str, body: ProgressIn, _: dict = Depends(require_admin)):
    doc = body.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["user_id"] = client_id
    doc["date"] = doc.get("date") or datetime.now(timezone.utc).date().isoformat()
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    await db.progress.insert_one(doc)
    doc.pop("_id", None)
    return doc

async def _list_progress(user_id: str):
    out = []
    async for p in db.progress.find({"user_id": user_id}).sort("date", -1).limit(200):
        p.pop("_id", None); out.append(p)
    return out

@api.get("/admin/clients/{client_id}/progress")
async def admin_progress_list(client_id: str, _: dict = Depends(require_admin)):
    return await _list_progress(client_id)

@api.get("/me/progress")
async def my_progress(user: dict = Depends(get_current_user)):
    return await _list_progress(user["id"])

@api.delete("/admin/progress/{entry_id}")
async def delete_progress(entry_id: str, _: dict = Depends(require_admin)):
    r = await db.progress.delete_one({"id": entry_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Voce non trovata")
    return {"ok": True}

# ---------- PT Contacts (admin-editable, read-only for clients) ----------
@api.get("/contacts")
async def get_contacts(user: dict = Depends(get_current_user)):
    s = await db.settings.find_one({"key": "contacts"})
    return {**ContactsIn().model_dump(), **(s["value"] if s else {})}

@api.put("/admin/contacts")
async def set_contacts(body: ContactsIn, _: dict = Depends(require_admin)):
    await db.settings.update_one({"key": "contacts"}, {"$set": {"key": "contacts", "value": body.model_dump()}}, upsert=True)
    return body.model_dump()

# ---------- Exercise Library ----------
DEFAULT_EXERCISES = [
    {"name": "Panca Piana con Bilanciere", "muscle_group": "Petto", "sets": 4, "reps": "8-10", "rest_sec": 120},
    {"name": "Panca Inclinata Manubri", "muscle_group": "Petto", "sets": 3, "reps": "10-12", "rest_sec": 90},
    {"name": "Croci ai Cavi", "muscle_group": "Petto", "sets": 3, "reps": "12-15", "rest_sec": 60},
    {"name": "Stacco da Terra", "muscle_group": "Schiena", "sets": 4, "reps": "5-6", "rest_sec": 180},
    {"name": "Trazioni alla Sbarra", "muscle_group": "Schiena", "sets": 4, "reps": "6-10", "rest_sec": 120},
    {"name": "Rematore Bilanciere", "muscle_group": "Schiena", "sets": 4, "reps": "8-10", "rest_sec": 90},
    {"name": "Lat Machine", "muscle_group": "Schiena", "sets": 3, "reps": "10-12", "rest_sec": 90},
    {"name": "Squat con Bilanciere", "muscle_group": "Gambe", "sets": 4, "reps": "6-8", "rest_sec": 180},
    {"name": "Affondi con Manubri", "muscle_group": "Gambe", "sets": 3, "reps": "10 per gamba", "rest_sec": 90},
    {"name": "Leg Press", "muscle_group": "Gambe", "sets": 4, "reps": "10-12", "rest_sec": 120},
    {"name": "Leg Curl", "muscle_group": "Gambe", "sets": 3, "reps": "12-15", "rest_sec": 60},
    {"name": "Standing Calf Raise", "muscle_group": "Polpacci", "sets": 4, "reps": "15-20", "rest_sec": 60},
    {"name": "Military Press", "muscle_group": "Spalle", "sets": 4, "reps": "6-8", "rest_sec": 120},
    {"name": "Alzate Laterali", "muscle_group": "Spalle", "sets": 4, "reps": "12-15", "rest_sec": 60},
    {"name": "Alzate Posteriori", "muscle_group": "Spalle", "sets": 3, "reps": "15", "rest_sec": 60},
    {"name": "Curl Bilanciere", "muscle_group": "Bicipiti", "sets": 3, "reps": "10-12", "rest_sec": 60},
    {"name": "Curl Manubri Alternati", "muscle_group": "Bicipiti", "sets": 3, "reps": "10 per braccio", "rest_sec": 60},
    {"name": "Push Down ai Cavi", "muscle_group": "Tricipiti", "sets": 3, "reps": "12-15", "rest_sec": 60},
    {"name": "French Press", "muscle_group": "Tricipiti", "sets": 3, "reps": "10-12", "rest_sec": 60},
    {"name": "Plank", "muscle_group": "Core", "sets": 3, "reps": "45-60 sec", "rest_sec": 45},
    {"name": "Crunch Inverso", "muscle_group": "Core", "sets": 3, "reps": "15-20", "rest_sec": 45},
    {"name": "Russian Twist", "muscle_group": "Core", "sets": 3, "reps": "20", "rest_sec": 45},
]

@api.get("/exercises/library")
async def exercise_library(user: dict = Depends(get_current_user)):
    return DEFAULT_EXERCISES

# ---------- Private PT sessions (with 24h reminder) ----------
@api.post("/admin/clients/{client_id}/sessions")
async def create_session(client_id: str, body: SessionIn, _: dict = Depends(require_admin)):
    u = await db.users.find_one({"_id": ObjectId(client_id), "role": "client"})
    if not u:
        raise HTTPException(404, "Cliente non trovato")
    # validate date/time
    try:
        dt = datetime.strptime(f"{body.date} {body.time}", "%Y-%m-%d %H:%M")
    except ValueError:
        raise HTTPException(400, "Data o ora non valida (usa YYYY-MM-DD e HH:MM)")
    doc = {"id": str(uuid.uuid4()), "user_id": client_id,
           "date": body.date, "time": body.time, "datetime_local": dt.isoformat(),
           "duration_min": body.duration_min, "location": body.location,
           "notes": body.notes, "reminder_sent": False,
           "created_at": datetime.now(timezone.utc).isoformat()}
    await db.sessions.insert_one(doc)
    doc.pop("_id", None)
    return doc

async def _list_sessions(user_id: str, upcoming_only: bool = False):
    out = []
    q = {"user_id": user_id}
    if upcoming_only:
        q["date"] = {"$gte": datetime.now(timezone.utc).date().isoformat()}
    async for s in db.sessions.find(q).sort([("date", 1), ("time", 1)]):
        s.pop("_id", None)
        out.append(s)
    return out

@api.get("/admin/clients/{client_id}/sessions")
async def admin_sessions(client_id: str, _: dict = Depends(require_admin)):
    return await _list_sessions(client_id)

@api.get("/me/sessions")
async def my_sessions(user: dict = Depends(get_current_user)):
    return await _list_sessions(user["id"], upcoming_only=True)

@api.delete("/admin/sessions/{session_id}")
async def delete_session(session_id: str, _: dict = Depends(require_admin)):
    r = await db.sessions.delete_one({"id": session_id})
    if r.deleted_count == 0:
        raise HTTPException(404, "Sessione non trovata")
    return {"ok": True}

async def send_session_reminder(client: dict, s: dict, stage: str = "24h"):
    """Email reminder 24h or 1h before a private PT session."""
    try:
        date_it = datetime.strptime(s["date"], "%Y-%m-%d").strftime("%d/%m/%Y")
        soon = stage == "1h"
        subject = (f"{EMAIL_FROM_NAME}: tra un'ora allenamento con il tuo PT" if soon
                   else f"{EMAIL_FROM_NAME}: domani allenamento con il tuo PT")
        headline = "Ci siamo: tra un'ora!" if soon else "Allenamento domani!"
        when = "tra <strong style=\"color:#F5C518\">circa un'ora</strong>" if soon else "<strong style=\"color:#F5C518\">domani</strong>"
        loc = f' in <strong style="color:#fff">{escape(s["location"])}</strong>' if s.get("location") else ""
        note = (f'<p style="color:#d4d4d8;font-size:16px;line-height:1.7;margin:12px 0 0">'
                f'Note del PT: {escape(s["notes"])}</p>') if s.get("notes") else ""
        html = (
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0D;padding:32px 16px">'
            '<tr><td align="center"><table role="presentation" width="560" cellpadding="0" cellspacing="0" '
            'style="background:#121218;border:1px solid #262633;border-radius:12px;padding:32px;font-family:Arial,sans-serif">'
            '<tr><td><div style="color:#F5C518;font-size:12px;letter-spacing:3px;text-transform:uppercase">METODO LAU</div>'
            f'<h1 style="color:#ffffff;font-size:24px;margin:12px 0 8px">{headline}</h1>'
            f'<p style="color:#e4e4e7;font-size:17px;line-height:1.7;margin:0 0 8px">Ciao {escape(client.get("name") or "Atleta")}, '
            f'ti ricordiamo che {when} hai la sessione privata con il tuo Personal Trainer:</p>'
            '<table width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0D;border:1px solid #262633;border-radius:8px;padding:16px;margin:12px 0">'
            '<tr><td style="color:#F5C518;font-size:20px;font-weight:bold">' + date_it + ' &middot; ore ' + escape(s["time"]) + '</td></tr>'
            f'<tr><td style="color:#a1a1aa;font-size:13px;padding-top:4px">Durata {s.get("duration_min", 60)} minuti{loc}</td></tr></table>'
            + note +
            '<p style="color:#d4d4d8;font-size:16px;line-height:1.7;margin:16px 0 0">Presentati puntuale e carico. Se devi spostare la sessione, contatta subito il tuo PT.</p>'
            f'<p style="color:#52525b;font-size:12px;margin:24px 0 0">Inviata da {escape(EMAIL_FROM_NAME)}. Non chiediamo mai password o dati di pagamento via email.</p>'
            '</td></tr></table></td></tr></table>'
        )
        res = await send_email(to=client["email"], subject=subject, html=html)
        return bool(res)
    except Exception as e:
        logger.error(f"send_session_reminder failed: {e}")
        return False

# ---------- Cron: session reminders (24h before) ----------
@api.post("/cron/session-reminders")
async def cron_session_reminders(request: Request):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    if not WEBHOOK_CRON_SECRET or not hmac.compare_digest(token, WEBHOOK_CRON_SECRET):
        raise HTTPException(401, "Unauthorized")
    try:
        body = await request.json()
    except Exception:
        body = {}
    run_id = body.get("run_id") or request.headers.get("X-Webhook-Id") or str(uuid.uuid4())
    # idempotency: skip if this run was already processed
    if await db.cron_runs.find_one({"run_id": run_id}):
        return {"ok": True, "duplicate": True}
    await db.cron_runs.insert_one({"run_id": run_id, "processed_at": datetime.now(timezone.utc).isoformat()})
    asyncio.create_task(_process_session_reminders(run_id))
    return {"ok": True, "run_id": run_id}

async def _process_session_reminders(run_id: str):
    """Hourly: email 24h before (delta <= 24h) and 1h before (delta <= 75min), Italy time."""
    try:
        now = datetime.now(ROME)
        today = now.date().isoformat()
        sent = 0
        async for s in db.sessions.find({"date": {"$gte": today}}):
            try:
                dt = datetime.strptime(f"{s['date']} {s['time']}", "%Y-%m-%d %H:%M").replace(tzinfo=ROME)
            except ValueError:
                continue
            delta = dt - now
            if delta.total_seconds() <= 0:
                continue
            client = await db.users.find_one({"_id": ObjectId(s["user_id"])})
            if not client:
                continue
            updates = {}
            sent_24 = s.get("reminder_24h_sent") or s.get("reminder_sent")
            if delta <= timedelta(minutes=75) and not s.get("reminder_1h_sent"):
                if await send_session_reminder(client, s, "1h"):
                    updates.update({"reminder_1h_sent": True, "reminder_24h_sent": True, "reminder_sent": True})
                    sent += 1
            elif delta <= timedelta(hours=24) and not sent_24:
                if await send_session_reminder(client, s, "24h"):
                    updates.update({"reminder_24h_sent": True, "reminder_sent": True})
                    sent += 1
            if updates:
                updates["reminded_at"] = now.isoformat()
                await db.sessions.update_one({"id": s["id"]}, {"$set": updates})
        await db.cron_runs.update_one({"run_id": run_id}, {"$set": {"completed": True, "sent": sent}})
        logger.info(f"session reminders: sent {sent}")
    except Exception as e:
        logger.error(f"_process_session_reminders failed: {e}")

# ---------- Cron: plan expiry (6 settimane) ----------
async def send_expiry_email(client: dict, kind_label: str, title: str, days_left: int, pt_email: Optional[str]):
    try:
        name = escape(client.get("name") or "Atleta")
        label = escape(kind_label)
        if days_left == 0:
            head, when = f"La tua {label} è scaduta oggi", "scade <strong style=\"color:#F5C518\">oggi</strong>"
        elif days_left == 1:
            head, when = f"La tua {label} scade domani", "scade <strong style=\"color:#F5C518\">domani</strong>"
        else:
            head, when = f"La tua {label} scade tra {days_left} giorni", f"scade tra <strong style=\"color:#F5C518\">{days_left} giorni</strong>"
        subject = f"{EMAIL_FROM_NAME}: {head}"
        html = (
            '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0A0A0D;padding:32px 16px">'
            '<tr><td align="center"><table role="presentation" width="560" cellpadding="0" cellspacing="0" '
            'style="background:#121218;border:1px solid #262633;border-radius:12px;padding:32px;font-family:Arial,sans-serif">'
            '<tr><td><div style="color:#F5C518;font-size:12px;letter-spacing:3px;text-transform:uppercase">METODO LAU</div>'
            f'<h1 style="color:#ffffff;font-size:24px;margin:12px 0 8px">{head}</h1>'
            f'<p style="{BODY};margin:0 0 16px">Ciao {name}, la tua <strong style="color:#F5C518">{label}</strong>'
            + (f' <em>{escape(title)}</em>' if title else '') + f' {when}: sono passate 6 settimane. '
            'È il momento di aggiornarla con il tuo Personal Trainer per continuare a progredire.</p>'
            f'<a href="{APP_URL}" style="display:inline-block;background:#F5C518;color:#0A0A0D;font-weight:bold;font-size:14px;'
            'text-transform:uppercase;letter-spacing:1px;text-decoration:none;padding:12px 28px;border-radius:8px">Apri l\'app METODO LAU</a>'
            f'<p style="color:#52525b;font-size:12px;margin:24px 0 0">Inviata da {escape(EMAIL_FROM_NAME)}. Non chiediamo mai password o dati di pagamento via email.</p>'
            '</td></tr></table></td></tr></table>'
        )
        ok = await send_email(to=client["email"], subject=subject, html=html)
        if pt_email:
            pt_html = html.replace(f"Ciao {name},", f"Promemoria PT &mdash; atleta <strong style=\"color:#fff\">{name}</strong>:", 1)
            await send_email(to=pt_email, subject=f"[PT] {name}: {head}", html=pt_html)
        return bool(ok)
    except Exception as e:
        logger.error(f"send_expiry_email failed: {e}")
        return False

@api.post("/cron/plan-expiry")
async def cron_plan_expiry(request: Request):
    auth = request.headers.get("Authorization", "")
    token = auth[7:] if auth.startswith("Bearer ") else ""
    if not WEBHOOK_CRON_SECRET or not hmac.compare_digest(token, WEBHOOK_CRON_SECRET):
        raise HTTPException(401, "Unauthorized")
    try:
        body = await request.json()
    except Exception:
        body = {}
    run_id = body.get("run_id") or request.headers.get("X-Webhook-Id") or str(uuid.uuid4())
    if await db.cron_runs.find_one({"run_id": run_id}):
        return {"ok": True, "duplicate": True}
    await db.cron_runs.insert_one({"run_id": run_id, "processed_at": datetime.now(timezone.utc).isoformat()})
    asyncio.create_task(_process_plan_expiry(run_id))
    return {"ok": True, "run_id": run_id}

async def _process_plan_expiry(run_id: str):
    """Daily: for each athlete's CURRENT workout/nutrition PDF, email at 7d, 1d and 0d before expiry."""
    try:
        today = datetime.now(ROME).date()
        sent = 0
        for coll, label in ((db.workouts, "scheda di allenamento"), (db.nutrition, "piano alimentare")):
            latest = {}
            async for f in coll.find({}).sort("uploaded_at", -1):
                latest.setdefault(f["user_id"], f)
            for uid, f in latest.items():
                days_left = (datetime.fromisoformat(_expiry_of(f)).date() - today).days
                stage = EXPIRY_STAGES.get(days_left)
                if not stage or stage in (f.get("expiry_notified") or []):
                    continue
                client = await db.users.find_one({"_id": ObjectId(uid)})
                if not client:
                    continue
                if await send_expiry_email(client, label, f.get("title") or "", days_left, ADMIN_EMAIL):
                    await coll.update_one({"id": f["id"]}, {"$addToSet": {"expiry_notified": stage}})
                    sent += 1
        await db.cron_runs.update_one({"run_id": run_id}, {"$set": {"completed": True, "sent": sent}})
        logger.info(f"plan expiry: sent {sent}")
    except Exception as e:
        logger.error(f"_process_plan_expiry failed: {e}")

# ---------- Root ----------
@api.get("/")
async def root():
    return {"app": "METODO LAU", "status": "ok"}

app.include_router(api)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Startup ----------
@app.on_event("startup")
async def startup():
    # drop legacy unique index on nutrition.user_id if present (from earlier versions)
    try:
        idxs = await db.nutrition.index_information()
        for name, info in idxs.items():
            if name != "_id_" and info.get("unique"):
                await db.nutrition.drop_index(name)
    except Exception:
        pass
    await db.users.create_index("email", unique=True)
    await db.plans.create_index("user_id", unique=True)
    await db.logs.create_index([("user_id", 1), ("date", -1)])
    await db.nutrition.create_index("user_id")
    await db.workouts.create_index("user_id")
    await db.photos.create_index("user_id")
    await db.progress.create_index([("user_id", 1), ("date", -1)])
    await db.sessions.create_index([("user_id", 1), ("date", 1)])
    await db.cron_runs.create_index("run_id", unique=True)
    existing = await db.users.find_one({"email": ADMIN_EMAIL})
    if not existing:
        await db.users.insert_one({
            "email": ADMIN_EMAIL,
            "password_hash": hash_password(ADMIN_PASSWORD),
            "name": "Personal Trainer LAU",
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Admin created: {ADMIN_EMAIL}")
    elif existing.get("role") != "admin":
        await db.users.update_one({"email": ADMIN_EMAIL}, {"$set": {"role": "admin"}})
    init_storage()

@app.on_event("shutdown")
async def shutdown():
    mongo_client.close()
