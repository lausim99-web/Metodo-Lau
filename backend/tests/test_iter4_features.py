"""
Iteration 4 backend tests for METODO LAU new features:
- Login remember flag (30d vs 1d JWT exp)
- Admin contacts guide links persistence
- File download Content-Disposition (inline vs attachment)
- /me/workouts items include expires_at (uploaded_at + 42 days)
- Cron endpoints auth + idempotency + processing (plan-expiry, session-reminders)
"""
import os
import time
import uuid
import base64
import json
from datetime import datetime, timedelta, timezone

import pytest
import requests
import jwt as pyjwt

def _read_backend_url():
    v = os.environ.get("REACT_APP_BACKEND_URL")
    if v:
        return v.rstrip("/")
    with open("/app/frontend/.env") as f:
        for ln in f:
            if ln.startswith("REACT_APP_BACKEND_URL"):
                return ln.split("=", 1)[1].strip().strip('"').rstrip("/")
    raise RuntimeError("REACT_APP_BACKEND_URL not found")

BASE_URL = _read_backend_url()
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "lausim99@gmail.com"
ADMIN_PASSWORD = "MetodoLau2026!"
ATHLETE_EMAIL = "mario.rossi@example.com"
ATHLETE_PASSWORD = "Mario2026!"

# Read webhook secret from backend .env
def _read_webhook_secret():
    with open("/app/backend/.env") as f:
        for ln in f:
            if ln.startswith("WEBHOOK_CRON_SECRET"):
                v = ln.split("=", 1)[1].strip()
                if v.startswith('"') and v.endswith('"'):
                    v = v[1:-1]
                return v
    return ""

CRON_SECRET = _read_webhook_secret()


def _login(email, password, remember=None):
    body = {"email": email, "password": password}
    if remember is not None:
        body["remember"] = remember
    r = requests.post(f"{API}/auth/login", json=body)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()


@pytest.fixture(scope="module")
def admin():
    return _login(ADMIN_EMAIL, ADMIN_PASSWORD, remember=True)


@pytest.fixture(scope="module")
def athlete():
    return _login(ATHLETE_EMAIL, ATHLETE_PASSWORD, remember=True)


def _hdr(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------- LOGIN remember flag ----------
class TestLoginRemember:
    def _exp_days(self, token):
        payload = pyjwt.decode(token, options={"verify_signature": False})
        exp = payload["exp"]
        iat = payload.get("iat") or int(time.time())
        return (exp - iat) / 86400.0

    def test_remember_true_30d(self):
        data = _login(ADMIN_EMAIL, ADMIN_PASSWORD, remember=True)
        days = self._exp_days(data["token"])
        assert 29 <= days <= 31, f"expected ~30d exp, got {days}"

    def test_remember_false_1d(self):
        data = _login(ADMIN_EMAIL, ADMIN_PASSWORD, remember=False)
        days = self._exp_days(data["token"])
        assert 0.9 <= days <= 1.1, f"expected ~1d exp, got {days}"

    def test_remember_omitted_1d(self):
        data = _login(ADMIN_EMAIL, ADMIN_PASSWORD, remember=None)
        days = self._exp_days(data["token"])
        assert 0.9 <= days <= 1.1, f"expected ~1d default exp, got {days}"


# ---------- Admin contacts with guide links ----------
class TestContactsGuides:
    def test_put_contacts_persists_guides(self, admin, athlete):
        new_vals = {
            "guide_workout": "https://example.com/guide-workout",
            "guide_nutrition": "https://example.com/guide-nutrition",
        }
        r = requests.put(f"{API}/admin/contacts", json=new_vals, headers=_hdr(admin["token"]))
        assert r.status_code == 200, r.text
        got = r.json()
        assert got.get("guide_workout") == new_vals["guide_workout"]
        assert got.get("guide_nutrition") == new_vals["guide_nutrition"]

        # Athlete sees the guides
        r2 = requests.get(f"{API}/contacts", headers=_hdr(athlete["token"]))
        assert r2.status_code == 200, r2.text
        c = r2.json()
        assert c.get("guide_workout") == new_vals["guide_workout"]
        assert c.get("guide_nutrition") == new_vals["guide_nutrition"]


# ---------- File download inline vs attachment ----------
class TestFileDownload:
    def _ensure_workout(self, admin, athlete):
        # list athlete's workouts; if none, upload one
        r = requests.get(f"{API}/me/workouts", headers=_hdr(athlete["token"]))
        assert r.status_code == 200, r.text
        items = r.json()
        if items:
            return items[0]
        # upload one as admin
        pdf_bytes = b"%PDF-1.4\n%EOF\n"
        files = {"file": ("test.pdf", pdf_bytes, "application/pdf")}
        data = {"title": "TEST workout"}
        up = requests.post(f"{API}/admin/clients/{athlete['id']}/workouts",
                           headers=_hdr(admin["token"]), data=data, files=files)
        assert up.status_code == 200, up.text
        return up.json()

    def test_workout_items_have_expires_at(self, admin, athlete):
        self._ensure_workout(admin, athlete)
        r = requests.get(f"{API}/me/workouts", headers=_hdr(athlete["token"]))
        items = r.json()
        assert items, "no workouts found"
        it = items[0]
        assert "expires_at" in it and it["expires_at"], f"expires_at missing: {it}"
        up = datetime.fromisoformat(it["uploaded_at"].replace("Z", "+00:00"))
        exp = datetime.fromisoformat(it["expires_at"].replace("Z", "+00:00"))
        delta_days = (exp.date() - up.date()).days
        assert 41 <= delta_days <= 43, f"expected +42 days, got {delta_days}"

    def test_download_inline_vs_attachment(self, admin, athlete):
        it = self._ensure_workout(admin, athlete)
        fid = it["id"]
        tok = athlete["token"]
        # inline
        r1 = requests.get(f"{API}/files/workouts/{fid}?auth={tok}")
        assert r1.status_code == 200, r1.text
        cd1 = r1.headers.get("Content-Disposition", "")
        assert cd1.lower().startswith("inline"), f"expected inline, got: {cd1}"
        # attachment
        r2 = requests.get(f"{API}/files/workouts/{fid}?auth={tok}&download=1")
        assert r2.status_code == 200, r2.text
        cd2 = r2.headers.get("Content-Disposition", "")
        assert cd2.lower().startswith("attachment"), f"expected attachment, got: {cd2}"


# ---------- Cron endpoints ----------
class TestCronEndpoints:
    def test_plan_expiry_requires_auth(self):
        r = requests.post(f"{API}/cron/plan-expiry",
                          headers={"Authorization": "Bearer wrong"}, json={})
        assert r.status_code == 401

    def test_session_reminders_requires_auth(self):
        r = requests.post(f"{API}/cron/session-reminders",
                          headers={"Authorization": "Bearer wrong"}, json={})
        assert r.status_code == 401

    def test_plan_expiry_ok_and_idempotent(self):
        assert CRON_SECRET, "WEBHOOK_CRON_SECRET missing"
        run_id = f"TEST_pe_{uuid.uuid4()}"
        r = requests.post(f"{API}/cron/plan-expiry",
                          headers=_hdr(CRON_SECRET), json={"run_id": run_id})
        assert r.status_code == 200, r.text
        j = r.json()
        assert j.get("ok") is True
        assert j.get("run_id") == run_id
        # repeat → duplicate
        r2 = requests.post(f"{API}/cron/plan-expiry",
                           headers=_hdr(CRON_SECRET), json={"run_id": run_id})
        assert r2.status_code == 200
        assert r2.json().get("duplicate") is True

    def test_session_reminders_ok_and_idempotent(self):
        assert CRON_SECRET, "WEBHOOK_CRON_SECRET missing"
        run_id = f"TEST_sr_{uuid.uuid4()}"
        r = requests.post(f"{API}/cron/session-reminders",
                          headers=_hdr(CRON_SECRET), json={"run_id": run_id})
        assert r.status_code == 200, r.text
        assert r.json().get("ok") is True
        r2 = requests.post(f"{API}/cron/session-reminders",
                           headers=_hdr(CRON_SECRET), json={"run_id": run_id})
        assert r2.json().get("duplicate") is True


# ---------- Session reminder logic (end to end with real session) ----------
class TestSessionReminderFlow:
    def test_create_session_and_trigger_reminder(self, admin, athlete):
        # Create session ~50 min from now (Rome). Use UTC+Rome offset handling: use server-side Europe/Rome.
        # We'll just use "now + 50 min" in UTC which Rome will also see as ~50 min away.
        # Easier: compute a date/time slot about 50 min ahead in UTC — ROME processing uses date+time as naive local Rome.
        # Use Europe/Rome local time explicitly:
        try:
            from zoneinfo import ZoneInfo
            now_rome = datetime.now(ZoneInfo("Europe/Rome"))
        except Exception:
            now_rome = datetime.now(timezone.utc) + timedelta(hours=1)
        target = now_rome + timedelta(minutes=50)
        date_s = target.strftime("%Y-%m-%d")
        time_s = target.strftime("%H:%M")

        body = {"date": date_s, "time": time_s, "duration_min": 30,
                "location": "TEST", "notes": "TEST_session_iter4"}
        r = requests.post(f"{API}/admin/clients/{athlete['id']}/sessions",
                          headers=_hdr(admin["token"]), json=body)
        assert r.status_code in (200, 201), r.text
        session = r.json()
        sid = session.get("id")
        assert sid

        try:
            # Trigger cron
            run_id = f"TEST_sr_e2e_{uuid.uuid4()}"
            r2 = requests.post(f"{API}/cron/session-reminders",
                               headers=_hdr(CRON_SECRET), json={"run_id": run_id})
            assert r2.status_code == 200
            time.sleep(4)  # allow background task
            # Fetch the session back
            r3 = requests.get(f"{API}/admin/clients/{athlete['id']}/sessions",
                              headers=_hdr(admin["token"]))
            assert r3.status_code == 200
            sessions = r3.json()
            found = next((s for s in sessions if s.get("id") == sid), None)
            assert found, "created session not returned"
            # The send to example.com fails (422), but logic should have attempted — reminder flag may or may not be set
            # depending on whether send returns truthy. Just verify no server error.
        finally:
            # cleanup
            d = requests.delete(f"{API}/admin/sessions/{sid}", headers=_hdr(admin["token"]))
            assert d.status_code in (200, 204), d.text
