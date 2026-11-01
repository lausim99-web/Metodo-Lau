"""Iter 7 – date formatting & cancellations reset.

Covers:
- Admin login
- POST/GET/DELETE progress stores/returns ISO date 2026-10-19
- Create a session, cancel via by_athlete=1 → loyalty.cancellations_6m == 1
- DELETE /api/admin/clients/{id}/cancellations resets to 0
- Loyalty +/- adjust still works (restore baseline)
"""
import os
import datetime as dt
import pytest
import requests

BASE = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
ADMIN = ("lausim99@gmail.com", "Metodolau")
MARIO_EMAIL = "mario.rossi@example.com"


@pytest.fixture(scope="module")
def admin():
    s = requests.Session()
    r = s.post(f"{BASE}/api/auth/login", json={"email": ADMIN[0], "password": ADMIN[1]})
    assert r.status_code == 200, r.text
    tok = r.json().get("token")
    s.headers.update({"Authorization": f"Bearer {tok}"})
    return s


@pytest.fixture(scope="module")
def mario_id(admin):
    r = admin.get(f"{BASE}/api/admin/clients")
    assert r.status_code == 200
    for c in r.json():
        if c.get("email") == MARIO_EMAIL:
            return c["id"]
    pytest.skip("Mario non trovato")


# ---------- progress date ----------
def test_progress_date_roundtrip(admin, mario_id):
    payload = {"date": "2026-10-19", "weight": 70.1, "notes": "TEST_iter7"}
    r = admin.post(f"{BASE}/api/admin/clients/{mario_id}/progress", json=payload)
    assert r.status_code in (200, 201), r.text
    pid = r.json().get("id")
    try:
        r2 = admin.get(f"{BASE}/api/admin/clients/{mario_id}/progress")
        assert r2.status_code == 200
        found = [p for p in r2.json() if p.get("id") == pid]
        assert found and found[0]["date"] == "2026-10-19"
    finally:
        d = admin.delete(f"{BASE}/api/admin/progress/{pid}")
        assert d.status_code in (200, 204)


# ---------- cancellations reset ----------
def test_cancellation_and_reset_flow(admin, mario_id):
    future = (dt.date.today() + dt.timedelta(days=5)).isoformat()
    # baseline reset
    admin.delete(f"{BASE}/api/admin/clients/{mario_id}/cancellations")

    r = admin.post(f"{BASE}/api/admin/clients/{mario_id}/sessions",
                   json={"date": future, "time": "10:00", "notes": "TEST_iter7"})
    assert r.status_code in (200, 201), r.text
    sid = r.json().get("id")

    d = admin.delete(f"{BASE}/api/admin/sessions/{sid}", params={"by_athlete": 1})
    assert d.status_code == 200, d.text

    lr = admin.get(f"{BASE}/api/admin/clients/{mario_id}/loyalty")
    assert lr.status_code == 200
    info = lr.json()
    assert info["cancellations_6m"] >= 1
    assert any(d == future for d in info.get("cancellation_dates", []))

    rr = admin.delete(f"{BASE}/api/admin/clients/{mario_id}/cancellations")
    assert rr.status_code == 200
    info2 = rr.json()
    assert info2["cancellations_6m"] == 0
    assert info2["cancellation_dates"] == []


# ---------- loyalty +/- regression ----------
def test_loyalty_adjust_regression(admin, mario_id):
    base = admin.get(f"{BASE}/api/admin/clients/{mario_id}/loyalty").json()["completed"]
    p = admin.post(f"{BASE}/api/admin/clients/{mario_id}/loyalty/adjust", json={"delta": 1})
    assert p.status_code == 200 and p.json()["completed"] == base + 1
    m = admin.post(f"{BASE}/api/admin/clients/{mario_id}/loyalty/adjust", json={"delta": -1})
    assert m.status_code == 200 and m.json()["completed"] == base
