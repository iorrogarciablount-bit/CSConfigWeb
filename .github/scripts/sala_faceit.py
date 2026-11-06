"""Envío de una sala de FACEIT (faceit.com/…/cs2/room/1-…).

La comprueba al momento con la Data API de FACEIT (que exista, que sea de CS2 y que haya terminado)
y, si vale, la apunta en pipeline/faceit_cola.txt. La demo no se puede descargar hasta que FACEIT
apruebe el acceso a su Downloads API (secreto FACEIT_DOWNLOADS_TOKEN): mientras tanto el envío queda
"en cola" y la actualización diaria lo procesará sola en cuanto exista el token.

Variables: ISSUE_BODY, REPO, NUM, GH_TOKEN, FACEIT_API_KEY (opcional), FACEIT_DOWNLOADS_TOKEN (opcional).
"""
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COLA = ROOT / "pipeline" / "faceit_cola.txt"
STATE = ROOT / "pipeline" / "state.json"
ROOM = re.compile(r"https://(?:www\.)?faceit\.com/[a-z-]{2,5}/cs2/room/(1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})", re.I)
UA = "CSConfigWeb/1.0 (+https://github.com/iorrogarciablount-bit/CSConfigWeb)"

repo, num, body = os.environ["REPO"], os.environ["NUM"], os.environ.get("ISSUE_BODY", "")
key = os.environ.get("FACEIT_API_KEY", "").strip()
has_token = bool(os.environ.get("FACEIT_DOWNLOADS_TOKEN", "").strip())


def section(title: str) -> str:
    m = re.search(rf"###\s*{re.escape(title)}\s*\n+(.*?)(?=\n###|\Z)", body, re.S)
    val = (m.group(1) if m else "").strip()
    return "" if val == "_No response_" else val


def gh(*args):
    subprocess.run(["gh", *args, "--repo", repo], check=False)


def answer(state: str, text: str, extra: dict):
    """Comenta en el issue con un resumen que lee la página de enviar, le pone la etiqueta y lo cierra."""
    summary = {"state": state, **extra}
    full = text + "\n\n<!-- resultado: " + json.dumps(summary, ensure_ascii=False).replace("-->", "") + " -->"
    colors = {"en-cola": "1D76DB", "rechazada": "B60205", "error": "D93F0B"}
    gh("label", "create", state, "--color", colors[state], "--description",
       "Sala de FACEIT comprobada, esperando a poder descargar la demo" if state == "en-cola" else "", "--force")
    gh("issue", "comment", num, "--body", full)
    gh("issue", "edit", num, "--add-label", state)
    gh("issue", "edit", num, "--remove-label", "pendiente")
    if state != "error":
        gh("issue", "close", num)
    print(full)


m = ROOM.search(section("Enlace a la demo") or body)
if not m:
    answer("rechazada", "No encuentro un enlace a una sala de FACEIT de CS2 (faceit.com/…/cs2/room/1-…).",
           {"messages": ["No encuentro un enlace a una sala de FACEIT de CS2."]})
    raise SystemExit(0)
room = m.group(1).lower()
url = f"https://www.faceit.com/en/cs2/room/{room}"            # siempre igual: así no se repite con /scoreboard, /es/…
label = re.sub(r"[\r\n\t]+", " ", section("Torneo o partido"))
label = re.sub(r"[^\w\s·.,:&'()/-]", "", label, flags=re.U).strip()[:80] or "FACEIT"

# ¿Ya procesada o ya en la cola?
done = set(json.loads(STATE.read_text(encoding="utf-8")).get("urls", [])) if STATE.exists() else set()
if hashlib.sha1(url.encode()).hexdigest()[:16] in done:
    answer("rechazada", "Esa partida ya se había procesado antes.", {"messages": ["Esa partida ya se había procesado antes."]})
    raise SystemExit(0)
queued = COLA.exists() and room in COLA.read_text(encoding="utf-8")

# Comprobación con la Data API (si no hay clave, se acepta sin comprobar)
info, note = {}, ""
if key:
    req = urllib.request.Request(f"https://open.faceit.com/data/v4/matches/{room}",
                                 headers={"Authorization": f"Bearer {key}", "Accept": "application/json", "User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            det = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            msg = "Esa sala de FACEIT no existe. Revisa el enlace."
            answer("rechazada", msg, {"messages": [msg]})
            raise SystemExit(0)
        det, note = None, f"No he podido comprobarla con FACEIT (error {e.code}); se apunta igualmente."
    except Exception as e:  # noqa: BLE001
        det, note = None, f"No he podido comprobarla con FACEIT ({e}); se apunta igualmente."
    if det is not None:
        status = str(det.get("status", "")).upper()
        if det.get("game") and det["game"] != "cs2":
            msg = "Esa sala no es de una partida de CS2."
            answer("rechazada", msg, {"messages": [msg]})
            raise SystemExit(0)
        if status in ("CANCELLED", "ABORTED"):
            msg = "Esa partida se canceló, así que no tiene demo."
            answer("rechazada", msg, {"messages": [msg]})
            raise SystemExit(0)
        if status != "FINISHED":
            msg = "Esa partida todavía no ha terminado. Envíala cuando acabe."
            answer("rechazada", msg, {"messages": [msg]})
            raise SystemExit(0)
        teams = det.get("teams") or {}
        names = [str((teams.get(f) or {}).get("name") or "").strip() for f in ("faction1", "faction2")]
        ts = det.get("finished_at") or det.get("started_at")
        info = {"teams": [n for n in names if n],
                "date": dt.datetime.fromtimestamp(ts, dt.timezone.utc).date().isoformat() if ts else "",
                "competition": str(det.get("competition_name") or "")[:80]}
        if not det.get("demo_url"):
            note = "FACEIT todavía no ha publicado la demo de esa partida; se intentará más adelante."
else:
    note = "No se ha podido comprobar con FACEIT (falta FACEIT_API_KEY); se apunta igualmente."

# Apuntar en la cola (una línea: enlace, etiqueta y número de envío) y subirlo
if not queued:
    with open(COLA, "a", encoding="utf-8") as f:
        f.write(f"{url} {label} #{num}\n")
    subprocess.run(["git", "config", "user.name", "csconfig-bot"], check=True)
    subprocess.run(["git", "config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com"], check=True)
    subprocess.run(["git", "add", str(COLA)], check=True)
    subprocess.run(["git", "commit", "-q", "-m", f"Sala de FACEIT en cola (#{num})"], check=True)
    for _ in range(3):
        if subprocess.run(["git", "pull", "--rebase", "-q"]).returncode == 0 and subprocess.run(["git", "push", "-q"]).returncode == 0:
            break
        time.sleep(5)
    else:
        answer("error", "No he podido apuntar la sala en la cola. Lo reviso.", {"messages": ["No se ha podido guardar en la cola."]})
        raise SystemExit(1)

what = " vs ".join(info.get("teams") or []) or "Partida de FACEIT"
when = f" ({info['date']})" if info.get("date") else ""
lines = [f"Sala comprobada: **{what}**{when}" + (f" · {info['competition']}" if info.get("competition") else "") + "." if info else "Sala recibida."]
if queued:
    lines.append("Ya estaba en la cola.")
if has_token:
    lines.append("Se procesará en la próxima actualización, en unos minutos.")
    subprocess.run(["gh", "workflow", "run", "update.yml", "--repo", repo, "--ref", "main"], check=False)
else:
    lines.append("Queda **en cola**: FACEIT todavía no ha dado acceso a la descarga de demos. "
                 "En cuanto lo dé, se procesará sola y este envío se actualizará con las miras.")
if note:
    lines.append(note)
answer("en-cola", "\n\n".join(lines), {"match": info, "messages": [note] if note else []})
