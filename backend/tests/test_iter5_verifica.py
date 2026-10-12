"""Iteration 5: General verification after Italian lang bugfix.
Covers: auth login (admin+athlete), /users/me, /me/workouts (expires_at),
/contacts (guide_video, website), /admin/calendar GET & invalid PUT (ftp),
progress create with new fields + cleanup, file inline/attachment PDF.
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lau-connect.preview.emergentagent.com").rstrip("/")

ADMIN_EMAIL = "lausim99@gmail.com"
ADMIN_PASS = "Metodolau"
ATHLETE_EMAIL = "mario.rossi@example.com"
ATHLETE_PASS = "Mario2026!"


def _login(email, password):
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"email": email, "password": password}, timeout=20)
    assert r.status_code == 200, f"login {email}: {r.status_code} {r.text}"
    data = r.json()
    assert "token" in data or "access_token" in data, data
    token = data.get("token") or data.get("access_token")
    assert isinstance(token, str) and len(token) > 0
    return token


@pytest.fixture(scope="module")
def admin_token():
    return _login(ADMIN_EMAIL, ADMIN_PASS)


@pytest.fixture(scope="module")
def athlete_token():
    return _login(ATHLETE_EMAIL, ATHLETE_PASS)


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- Auth ----------
def test_admin_login_and_me(admin_token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(admin_token), timeout=15)
    assert r.status_code == 200
    me = r.json()
    assert me.get("email") == ADMIN_EMAIL
    assert me.get("role") == "admin"


def test_athlete_login_and_me(athlete_token):
    r = requests.get(f"{BASE_URL}/api/auth/me", headers=_h(athlete_token), timeout=15)
    assert r.status_code == 200
    me = r.json()
    assert me.get("email") == ATHLETE_EMAIL


# ---------- Athlete endpoints ----------
def test_me_workouts_has_expires_at(athlete_token):
    r = requests.get(f"{BASE_URL}/api/me/workouts", headers=_h(athlete_token), timeout=15)
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    assert len(items) > 0, "mario should have >=1 workout seeded"
    for w in items:
        assert "expires_at" in w, f"missing expires_at: {w}"


def test_contacts_has_guides_and_website(athlete_token):
    r = requests.get(f"{BASE_URL}/api/contacts", headers=_h(athlete_token), timeout=15)
    assert r.status_code == 200
    c = r.json()
    # keys must exist (values may be empty strings)
    for k in ("guide_video", "website", "whatsapp"):
        assert k in c, f"contacts missing key {k}: {c}"


# ---------- Admin calendar ----------
def test_admin_calendar_get(admin_token):
    r = requests.get(f"{BASE_URL}/api/admin/calendar", headers=_h(admin_token), timeout=15)
    assert r.status_code == 200
    body = r.json()
    assert "ics_url" in body


def test_admin_calendar_put_invalid_url_returns_400(admin_token):
    r = requests.put(
        f"{BASE_URL}/api/admin/calendar",
        headers=_h(admin_token),
        json={"ics_url": "ftp://x"},
        timeout=15,
    )
    assert r.status_code == 400, f"expected 400 for ftp url, got {r.status_code}: {r.text}"


def test_admin_calendar_cleanup_empty(admin_token):
    r = requests.put(
        f"{BASE_URL}/api/admin/calendar",
        headers=_h(admin_token),
        json={"ics_url": ""},
        timeout=15,
    )
    assert r.status_code == 200


# ---------- Admin progress CRUD on mario with new fields ----------
def _find_mario_id(admin_token):
    r = requests.get(f"{BASE_URL}/api/admin/clients", headers=_h(admin_token), timeout=15)
    assert r.status_code == 200
    for c in r.json():
        if c.get("email") == ATHLETE_EMAIL:
            return c.get("id") or c.get("_id")
    pytest.skip("mario not in admin clients list")


def test_admin_progress_new_fields_create_and_delete(admin_token):
    mario_id = _find_mario_id(admin_token)
    payload = {
        "date": "2026-01-15",
        "weight_kg": 78.5,
        "lean_mass_kg": 60.2,
        "waist_cm": 82.5,
        "legs_cm": 58.1,
    }
    r = requests.post(
        f"{BASE_URL}/api/admin/clients/{mario_id}/progress",
        headers=_h(admin_token),
        json=payload,
        timeout=15,
    )
    assert r.status_code in (200, 201), f"{r.status_code} {r.text}"
    created = r.json()
    # Validate new fields echoed back
    for k, v in payload.items():
        if k == "date":
            continue
        assert created.get(k) == v, f"field {k} mismatch: {created}"
    pid = created.get("id") or created.get("_id")
    assert pid, f"no id in created progress: {created}"

    # Cleanup
    r2 = requests.delete(f"{BASE_URL}/api/admin/progress/{pid}", headers=_h(admin_token), timeout=15)
    assert r2.status_code in (200, 204), f"delete failed: {r2.status_code} {r2.text}"


# ---------- File inline vs attachment ----------
def test_workout_file_inline_and_attachment(athlete_token):
    r = requests.get(f"{BASE_URL}/api/me/workouts", headers=_h(athlete_token), timeout=15)
    wid = r.json()[0].get("id") or r.json()[0].get("_id")
    assert wid

    # inline (default)
    r1 = requests.get(f"{BASE_URL}/api/files/workouts/{wid}?auth={athlete_token}", timeout=20, allow_redirects=True)
    assert r1.status_code == 200
    assert "application/pdf" in r1.headers.get("Content-Type", "").lower()
    disp = r1.headers.get("Content-Disposition", "").lower()
    assert "attachment" not in disp, f"expected inline, got {disp}"

    # attachment
    r2 = requests.get(
        f"{BASE_URL}/api/files/workouts/{wid}?auth={athlete_token}&download=1",
        timeout=20, allow_redirects=True,
    )
    assert r2.status_code == 200
    disp2 = r2.headers.get("Content-Disposition", "").lower()
    assert "attachment" in disp2, f"expected attachment, got {disp2}"
