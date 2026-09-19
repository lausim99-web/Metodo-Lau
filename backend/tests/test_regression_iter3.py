"""Regression tests after N+1 fix + query limit additions (iteration 3)."""
import os
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://lau-connect.preview.emergentagent.com").rstrip("/")
ADMIN = {"email": "lausim99@gmail.com", "password": "MetodoLau2026!"}
MARIO = {"email": "mario.rossi@example.com", "password": "Mario2026!"}


def _login(creds):
    r = requests.post(f"{BASE_URL}/api/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, f"login failed {r.status_code}: {r.text}"
    return r.json()["token"]


def _hdr(t):
    return {"Authorization": f"Bearer {t}"}


def test_admin_clients_bulk_flags():
    tok = _login(ADMIN)
    r = requests.get(f"{BASE_URL}/api/admin/clients", headers=_hdr(tok), timeout=20)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) > 0
    mario = next((c for c in data if c["email"] == MARIO["email"]), None)
    assert mario is not None, "Mario not in admin/clients"
    assert mario["has_plan"] is True, f"has_plan should be true, got {mario}"
    assert mario["has_nutrition"] is True, f"has_nutrition should be true, got {mario}"
    # ensure required fields exist
    for k in ("id", "email", "name", "has_plan", "has_nutrition"):
        assert k in mario


def test_mario_workouts_not_truncated():
    tok = _login(MARIO)
    r = requests.get(f"{BASE_URL}/api/me/workouts", headers=_hdr(tok), timeout=20)
    assert r.status_code == 200
    lst = r.json()
    assert isinstance(lst, list)
    assert len(lst) >= 1


def test_mario_nutrition_list():
    tok = _login(MARIO)
    r = requests.get(f"{BASE_URL}/api/me/nutrition/list", headers=_hdr(tok), timeout=20)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) >= 1


def test_mario_photos():
    tok = _login(MARIO)
    r = requests.get(f"{BASE_URL}/api/me/photos", headers=_hdr(tok), timeout=20)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) >= 1


def test_mario_progress():
    tok = _login(MARIO)
    r = requests.get(f"{BASE_URL}/api/me/progress", headers=_hdr(tok), timeout=20)
    assert r.status_code == 200
    assert isinstance(r.json(), list)
    assert len(r.json()) >= 1
