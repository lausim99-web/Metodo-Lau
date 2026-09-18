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

from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, UploadFile, File, Form
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

class ExerciseIn(BaseModel):
    name: str
    muscle_group: Optional[str] = ""
    sets: int = 3
    reps: str = "10"
    weight: str = ""
    rest_sec: int = 90
    notes: Optional[str] = ""
    gif_url: Optional[str] = ""

class WorkoutDayIn(BaseModel):
    name: str
    exercises: List[ExerciseIn] = []

class WorkoutPlanIn(BaseModel):
    title: str = "Scheda Allenamento"
    days: List[WorkoutDayIn] = []

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
async def upload_nutrition(client_id: str, file: UploadFile = File(...), _: dict = Depends(require_admin)):
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
    doc = {"user_id": client_id, "storage_path": result["path"],
           "filename": file.filename, "size": result.get("size", len(data)),
           "uploaded_at": datetime.now(timezone.utc).isoformat()}
    await db.nutrition.update_one({"user_id": client_id}, {"$set": doc}, upsert=True)
    return {"ok": True, "filename": file.filename}

@api.get("/admin/clients/{client_id}/nutrition/info")
async def admin_nutrition_info(client_id: str, _: dict = Depends(require_admin)):
    n = await db.nutrition.find_one({"user_id": client_id})
    if not n:
        return None
    n.pop("_id", None)
    return n

@api.get("/me/nutrition/info")
async def my_nutrition_info(user: dict = Depends(get_current_user)):
    n = await db.nutrition.find_one({"user_id": user["id"]})
    if not n:
        return None
    n.pop("_id", None)
    return n

@api.get("/me/nutrition/file")
async def my_nutrition_file(user: dict = Depends(get_current_user)):
    n = await db.nutrition.find_one({"user_id": user["id"]})
    if not n:
        raise HTTPException(404, "Nessun piano alimentare disponibile")
    data, ct = get_object(n["storage_path"])
    return FastResponse(content=data, media_type="application/pdf",
                        headers={"Content-Disposition": f'inline; filename="{n.get("filename","piano.pdf")}"'})

@api.get("/admin/clients/{client_id}/nutrition/file")
async def admin_nutrition_file(client_id: str, _: dict = Depends(require_admin)):
    n = await db.nutrition.find_one({"user_id": client_id})
    if not n:
        raise HTTPException(404, "Nessun piano alimentare")
    data, ct = get_object(n["storage_path"])
    return FastResponse(content=data, media_type="application/pdf")

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
    await db.users.create_index("email", unique=True)
    await db.plans.create_index("user_id", unique=True)
    await db.nutrition.create_index("user_id", unique=True)
    await db.logs.create_index([("user_id", 1), ("date", -1)])
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
