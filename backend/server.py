from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import logging
import bcrypt
import jwt as pyjwt
import requests as http_requests
from datetime import datetime, timezone, timedelta
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
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"

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

# ---------- Auth Helpers ----------
def hash_password(p: str) -> str:
    return bcrypt.hashpw(p.encode(), bcrypt.gensalt()).decode()

def verify_password(p: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(p.encode(), h.encode())
    except Exception:
        return False

def create_access_token(uid: str, email: str, role: str) -> str:
    return pyjwt.encode({"sub": uid, "email": email, "role": role,
                         "exp": datetime.now(timezone.utc) + timedelta(days=7),
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

# ---------- Models ----------
class LoginIn(BaseModel):
    email: EmailStr
    password: str

class CreateClientIn(BaseModel):
    email: EmailStr
    password: str
    name: str

class ResetPwIn(BaseModel):
    password: str

class ChangePwIn(BaseModel):
    current_password: str
    new_password: str

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

# ---------- Cookie helper ----------
def set_auth_cookie(resp: Response, token: str):
    resp.set_cookie("access_token", token, httponly=True, secure=True,
                    samesite="none", max_age=60 * 60 * 24 * 7, path="/")

# ---------- Auth Routes ----------
@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Email o password errati")
    token = create_access_token(str(user["_id"]), email, user["role"])
    set_auth_cookie(response, token)
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
    return {"id": str(r.inserted_id), "email": email, "name": body.name, "role": "client"}

@api.get("/admin/clients")
async def list_clients(_: dict = Depends(require_admin)):
    out = []
    async for u in db.users.find({"role": "client"}).sort("created_at", -1):
        plan = await db.plans.find_one({"user_id": str(u["_id"])})
        nut = await db.nutrition.find_one({"user_id": str(u["_id"])})
        out.append({"id": str(u["_id"]), "email": u["email"], "name": u["name"],
                    "has_plan": bool(plan), "has_nutrition": bool(nut),
                    "created_at": u.get("created_at")})
    return out

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
           "size": result.get("size", len(data)),
           "uploaded_at": datetime.now(timezone.utc).isoformat()}
    await db.nutrition.insert_one(doc)
    doc.pop("_id", None)
    return doc

async def _list_files(collection, user_id: str):
    out = []
    async for f in collection.find({"user_id": user_id}).sort("uploaded_at", -1):
        f.pop("_id", None)
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

async def _serve_file(collection, file_id: str, requester_id: str, is_admin: bool):
    doc = await collection.find_one({"id": file_id})
    if not doc:
        raise HTTPException(404, "File non trovato")
    if not is_admin and doc["user_id"] != requester_id:
        raise HTTPException(403, "Non autorizzato")
    data, ct = get_object(doc["storage_path"])
    return FastResponse(content=data, media_type=doc.get("content_type") or "application/pdf",
                        headers={"Content-Disposition": f'inline; filename="{doc.get("filename","file.pdf")}"'})

@api.get("/files/nutrition/{file_id}")
async def download_nutrition(file_id: str, request: Request):
    u = await _token_user(request)
    return await _serve_file(db.nutrition, file_id, u["id"], u["role"] == "admin")

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
           "size": result.get("size", len(data)),
           "uploaded_at": datetime.now(timezone.utc).isoformat()}
    await db.workouts.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.get("/admin/clients/{client_id}/workouts")
async def admin_workouts_list(client_id: str, _: dict = Depends(require_admin)):
    return await _list_files(db.workouts, client_id)

@api.get("/me/workouts")
async def my_workouts(user: dict = Depends(get_current_user)):
    return await _list_files(db.workouts, user["id"])

@api.get("/files/workouts/{file_id}")
async def download_workout(file_id: str, request: Request):
    u = await _token_user(request)
    return await _serve_file(db.workouts, file_id, u["id"], u["role"] == "admin")

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
    async for p in db.photos.find({"user_id": user_id}).sort([("photo_date", -1), ("uploaded_at", -1)]):
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
    async for p in db.progress.find({"user_id": user_id}).sort("date", -1):
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
    return s["value"] if s else {"instagram": "", "whatsapp": "", "phone": "", "email": "", "note": ""}

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
    else:
        if not verify_password(ADMIN_PASSWORD, existing["password_hash"]):
            await db.users.update_one({"email": ADMIN_EMAIL},
                                      {"$set": {"password_hash": hash_password(ADMIN_PASSWORD), "role": "admin"}})
    init_storage()

@app.on_event("shutdown")
async def shutdown():
    mongo_client.close()
