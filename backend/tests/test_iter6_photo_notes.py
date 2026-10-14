"""Iteration 6 — photo notes bug: notes must be persisted & returned."""
import os, io, requests, pytest

BASE = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
ADMIN = {"email": "lausim99@gmail.com", "password": "Metodolau"}
ATH = {"email": "mario.rossi@example.com", "password": "Mario2026!"}


def _login(creds):
    r = requests.post(f"{BASE}/api/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["token"], requests.utils.dict_from_cookiejar(r.cookies)


def _tiny_png():
    # 1x1 px PNG
    return bytes.fromhex(
        "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4"
        "890000000D4944415478DA6300010000000500010D0A2DB40000000049454E44"
        "AE426082"
    )


@pytest.fixture(scope="module")
def admin_tok():
    tok, _ = _login(ADMIN)
    return tok


@pytest.fixture(scope="module")
def mario_id(admin_tok):
    r = requests.get(f"{BASE}/api/admin/clients", headers={"Authorization": f"Bearer {admin_tok}"}, timeout=20)
    assert r.status_code == 200
    for c in r.json():
        if c.get("email") == ATH["email"]:
            return c["id"]
    pytest.fail("Mario client not found")


def test_upload_photo_with_notes_and_cleanup(admin_tok, mario_id):
    h = {"Authorization": f"Bearer {admin_tok}"}
    files = {"file": ("t.png", _tiny_png(), "image/png")}
    data = {"tag": "check", "photo_date": "2026-06-15", "notes": "Nota di prova fotografica"}
    r = requests.post(f"{BASE}/api/admin/clients/{mario_id}/photos", headers=h, files=files, data=data, timeout=90)
    assert r.status_code == 200, r.text
    j = r.json()
    pid = j["id"]
    assert j["notes"] == "Nota di prova fotografica"
    assert j["tag"] == "check"
    assert j["photo_date"] == "2026-06-15"

    # admin list contains it with notes
    r2 = requests.get(f"{BASE}/api/admin/clients/{mario_id}/photos", headers=h, timeout=20)
    assert r2.status_code == 200
    found = [p for p in r2.json() if p["id"] == pid]
    assert found and found[0]["notes"] == "Nota di prova fotografica"

    # athlete sees notes
    atok, _ = _login(ATH)
    r3 = requests.get(f"{BASE}/api/me/photos", headers={"Authorization": f"Bearer {atok}"}, timeout=20)
    assert r3.status_code == 200
    found_a = [p for p in r3.json() if p["id"] == pid]
    assert found_a and found_a[0]["notes"] == "Nota di prova fotografica"

    # cleanup
    rd = requests.delete(f"{BASE}/api/admin/photos/{pid}", headers=h, timeout=20)
    assert rd.status_code in (200, 204)

    # verify delete
    r4 = requests.get(f"{BASE}/api/admin/clients/{mario_id}/photos", headers=h, timeout=20)
    assert not [p for p in r4.json() if p["id"] == pid]


def test_upload_without_notes_returns_empty(admin_tok, mario_id):
    h = {"Authorization": f"Bearer {admin_tok}"}
    files = {"file": ("t.png", _tiny_png(), "image/png")}
    data = {"tag": "prima", "photo_date": "2026-06-10"}
    r = requests.post(f"{BASE}/api/admin/clients/{mario_id}/photos", headers=h, files=files, data=data, timeout=90)
    assert r.status_code == 200
    j = r.json()
    assert j.get("notes", "") == ""
    requests.delete(f"{BASE}/api/admin/photos/{j['id']}", headers=h, timeout=20)
