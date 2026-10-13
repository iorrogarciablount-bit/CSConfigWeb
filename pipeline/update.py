"""Actualiza site/data/crosshairs.json con las miras sacadas de demos de partidas pro.

Fuentes (todas opcionales; se usan las que estén configuradas):
  1. FACEIT: partidas recientes de los hubs/campeonatos de pipeline/config.json.
     Necesita FACEIT_API_KEY (Data API) y FACEIT_DOWNLOADS_TOKEN (Downloads API, requiere aprobación).
  2. URLs directas de demos: pipeline/demo_urls.txt (una por línea) o la variable DEMO_URL.
  3. Carpeta local: pipeline/demos/ (archivos .dem, .dem.gz, .dem.zst, .zip, .rar, .7z).
  4. Entradas manuales: pipeline/manual.json (para añadir o corregir un jugador a mano).

Uso:  python pipeline/update.py            (todas las fuentes)
      python pipeline/update.py --only local
"""
from __future__ import annotations

import argparse
import datetime as dt
import gzip
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIPE = ROOT / "pipeline"
DATA_DIR = ROOT / "site" / "data"
DATA_PROS = DATA_DIR / "pros.json"          # jugadores de la lista de pros (página de inicio)
DATA_PLAYERS = DATA_DIR / "players.json"    # el resto de jugadores (pestaña Jugadores)
LEGACY = DATA_DIR / "crosshairs.json"       # formato antiguo, se migra solo
PROS = PIPE / "pros.json"
STATE = PIPE / "state.json"
CONFIG = PIPE / "config.json"
MANUAL = PIPE / "manual.json"
URLS = PIPE / "demo_urls.txt"
LOCAL_DIR = PIPE / "demos"

NEW_CODE = re.compile(r"^CS[A-Za-z0-9]{44}$")
# Las demos de FACEIT se llaman como la partida: 1-<uuid>-1-1.dem(.zip)
FACEIT_ROOM = re.compile(r"^https://(?:www\.)?faceit\.com/[a-z-]{2,5}/cs2/room/(1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})", re.I)
FACEIT_FILE = re.compile(r"(1-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})", re.I)
OLD_CODE = re.compile(r"^CSGO(-[A-Za-z0-9]{5}){5}$")
FACEIT_API = "https://open.faceit.com/data/v4"
FACEIT_DL = "https://open.faceit.com/download/v2/demos/download"
UA = "CSConfigWeb crosshair updater (+https://github.com/iorrogarciablount-bit/CSConfigWeb)"


def log(*a):
    print(*a, flush=True)


def today() -> str:
    return dt.datetime.now(dt.timezone.utc).date().isoformat()


def load_json(path: Path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return default


def save_json(path: Path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")


# ---------------------------------------------------------------- HTTP

def http_json(url: str, token: str, body: dict | None = None):
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "Accept": "application/json", "User-Agent": UA})
    if body is not None:
        req.data = json.dumps(body).encode()
        req.add_header("Content-Type", "application/json")
        req.method = "POST"
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def download(url: str, dest: Path, max_mb: int = 1500):
    if not url.lower().startswith("https://"):
        raise RuntimeError("solo se aceptan enlaces https://")
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    limit = max_mb * 1024 * 1024
    with urllib.request.urlopen(req, timeout=600) as r, open(dest, "wb") as f:
        size = int(r.headers.get("Content-Length") or 0)
        if size > limit:
            raise RuntimeError(f"el archivo pesa {size // 2**20} MB y el máximo es {max_mb} MB")
        got = 0
        while chunk := r.read(1 << 20):
            got += len(chunk)
            if got > limit:
                raise RuntimeError(f"el archivo supera el máximo de {max_mb} MB")
            f.write(chunk)


# ---------------------------------------------------------------- demos

def unpack(path: Path, workdir: Path) -> list[Path]:
    """Devuelve los .dem que contiene un archivo (descomprimiendo si hace falta)."""
    name = path.name.lower()
    if name.endswith(".dem"):
        return [path]
    if name.endswith(".dem.gz") or name.endswith(".gz"):
        out = workdir / (path.stem if path.stem.endswith(".dem") else path.stem + ".dem")
        with gzip.open(path, "rb") as src, open(out, "wb") as dst:
            shutil.copyfileobj(src, dst, 1 << 20)
        return [out]
    if name.endswith(".zst"):
        import zstandard  # noqa: PLC0415
        out = workdir / path.stem
        with open(path, "rb") as src, open(out, "wb") as dst:
            zstandard.ZstdDecompressor().copy_stream(src, dst)
        return [out]
    if name.endswith(".zip"):
        import zipfile  # noqa: PLC0415
        dest = workdir / (path.name + "_x")
        with zipfile.ZipFile(path) as z:
            for info in z.infolist():
                low = info.filename.lower()
                if low.endswith((".dem", ".dem.gz", ".dem.zst")) and not info.is_dir():
                    target = dest / Path(info.filename).name  # sin rutas: evita escribir fuera de la carpeta
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with z.open(info) as src, open(target, "wb") as dst:
                        shutil.copyfileobj(src, dst, 1 << 20)
        dems = []
        for f in sorted(dest.glob("*")) if dest.exists() else []:
            dems += unpack(f, workdir) if not f.name.lower().endswith(".dem") else [f]
        return dems
    if name.endswith((".rar", ".7z")):
        exe = shutil.which("7z") or shutil.which("7zz")
        for cand in (r"C:\Program Files\7-Zip\7z.exe", r"C:\Program Files (x86)\7-Zip\7z.exe"):
            if not exe and Path(cand).exists():
                exe = cand
        if not exe:
            raise RuntimeError("Hace falta 7-Zip para abrir archivos .rar/.7z (https://www.7-zip.org)")
        dest = workdir / (path.name + "_x")
        subprocess.run([exe, "x", "-y", f"-o{dest}", str(path)], check=True, stdout=subprocess.DEVNULL)
        return sorted(dest.rglob("*.dem"))
    # Sin extensión conocida: probamos como demo directa.
    return [path]


def extract(dem: Path) -> dict:
    """Lee una demo y devuelve {steamid: {name, team, code}} al final del partido."""
    from demoparser2 import DemoParser  # noqa: PLC0415

    parser = DemoParser(str(dem))
    header = {}
    try:
        header = parser.parse_header() or {}
    except Exception:  # noqa: BLE001
        pass
    ticks = []
    try:
        ends = parser.parse_event("round_end")
        ticks = [int(x) for x in ends["tick"].to_list()][-3:]
    except Exception:  # noqa: BLE001
        pass
    if not ticks:
        ticks = None  # todos los ticks: más lento, pero sirve para demos sin rondas completas
    df = parser.parse_ticks(["crosshair_code", "team_clan_name"], ticks=ticks)
    out: dict[str, dict] = {}
    # Recorremos en orden de tick para quedarnos con el último valor válido de cada jugador.
    for row in df.sort_values("tick").to_dict("records"):
        txt = lambda v: v.strip() if isinstance(v, str) else ""  # noqa: E731
        sid = str(row.get("steamid") or "")
        code = txt(row.get("crosshair_code"))
        if not sid or sid == "0" or not (NEW_CODE.match(code) or OLD_CODE.match(code)):
            continue
        out[sid] = {"name": txt(row.get("name")), "team": txt(row.get("team_clan_name")), "code": code}
    return {"map": header.get("map_name", ""), "players": out}


# ---------------------------------------------------------------- fuentes

def faceit_matches(cfg: dict, state: dict):
    key = os.environ.get("FACEIT_API_KEY", "").strip()
    token = os.environ.get("FACEIT_DOWNLOADS_TOKEN", "").strip()
    fc = cfg.get("faceit", {})
    comps = [("hubs", h) for h in fc.get("hubs", [])] + [("championships", c) for c in fc.get("championships", [])]
    if not comps:
        log("FACEIT: no hay hubs ni campeonatos en config.json; se omite.")
        return
    if not key:
        log("FACEIT: falta FACEIT_API_KEY; se omite.")
        return
    if not token:
        log("FACEIT: falta FACEIT_DOWNLOADS_TOKEN (Downloads API pendiente de aprobación); se omite la descarga.")
        return
    per = int(fc.get("matches_per_source", 10))
    done = set(state.get("faceit", []))
    for kind, cid in comps:
        label = cid.get("label", cid["id"]) if isinstance(cid, dict) else cid
        ident = cid["id"] if isinstance(cid, dict) else cid
        try:
            res = http_json(f"{FACEIT_API}/{kind}/{ident}/matches?type=past&offset=0&limit={per}", key)
        except Exception as e:  # noqa: BLE001
            log(f"FACEIT {kind}/{ident}: error al listar partidas: {e}")
            continue
        for m in res.get("items", []):
            mid = m.get("match_id")
            if not mid or mid in done or m.get("status") not in (None, "FINISHED"):
                continue
            try:
                det = http_json(f"{FACEIT_API}/matches/{mid}", key)
                urls = det.get("demo_url") or []
                if not urls:
                    continue
                for ru in urls:
                    signed = http_json(FACEIT_DL, token, {"resource_url": ru})["payload"]["download_url"]
                    ts = det.get("finished_at") or det.get("started_at")
                    day = dt.datetime.fromtimestamp(ts, dt.timezone.utc).date().isoformat() if ts else today()
                    yield {"id": f"faceit:{mid}", "url": signed, "name": ru.rsplit("/", 1)[-1], "source": f"FACEIT · {label}", "date": day}
                done.add(mid)
            except Exception as e:  # noqa: BLE001
                log(f"FACEIT {mid}: {e}")
    state["faceit"] = sorted(done)[-5000:]


def faceit_verify(db: dict, state: dict, cfg: dict):
    """Marca como pro a los jugadores con cuenta verificada en FACEIT (pros y personalidades conocidas)."""
    key = os.environ.get("FACEIT_API_KEY", "").strip()
    if not key:
        log("Verificación FACEIT: falta FACEIT_API_KEY; los pros de partidas de FACEIT no se detectan solos.")
        return
    cache = state.setdefault("faceit_verified", {})
    days = int(cfg.get("faceit", {}).get("recheck_days", 30))
    limit = int(cfg.get("faceit", {}).get("lookups_per_run", 300))
    cutoff = (dt.date.today() - dt.timedelta(days=days)).isoformat()
    todo = [p for p in db["players"].values() if p.get("faceit") and cache.get(p["id"], {}).get("t", "") < cutoff]
    checked = found = 0
    for p in todo[:limit]:
        try:
            res = http_json(f"{FACEIT_API}/players?game=cs2&game_player_id={p['id']}", key)
            verified = bool(res.get("verified"))
        except urllib.error.HTTPError as e:
            if e.code != 404:
                log(f"Verificación FACEIT {p['id']}: {e}")
                continue
            verified = False
        except Exception as e:  # noqa: BLE001
            log(f"Verificación FACEIT {p['id']}: {e}")
            continue
        cache[p["id"]] = {"v": verified, "t": today()}
        checked += 1
        found += verified
    for p in db["players"].values():
        v = cache.get(p["id"], {}).get("v")
        if v:
            p.setdefault("auto_pro", "faceit")
        elif v is False and p.get("auto_pro") == "faceit":
            p.pop("auto_pro")
    if checked:
        log(f"Verificación FACEIT: {checked} jugadores consultados, {found} verificados.")


LIQUIPEDIA_API = "https://liquipedia.net/counterstrike/api.php"
LIQUIPEDIA_UA = "CSConfigWeb/1.0 (https://github.com/iorrogarciablount-bit/CSConfigWeb; equipos de jugadores pro)"


def liquipedia_team(name: str) -> tuple[bool, str, str]:
    """Busca el equipo actual de un jugador en Liquipedia. Devuelve (encontrado, equipo, estado)."""
    import gzip as _gz  # noqa: PLC0415
    from urllib.parse import urlencode  # noqa: PLC0415
    q = urlencode({"action": "query", "prop": "revisions", "rvprop": "content", "rvslots": "main",
                   "format": "json", "formatversion": "2", "redirects": "1", "titles": name})
    req = urllib.request.Request(f"{LIQUIPEDIA_API}?{q}", headers={"User-Agent": LIQUIPEDIA_UA, "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=30) as r:
        raw = r.read()
        if r.headers.get("Content-Encoding") == "gzip":
            raw = _gz.decompress(raw)
    pages = json.loads(raw.decode()).get("query", {}).get("pages", [])
    if not pages or pages[0].get("missing"):
        return False, "", ""
    text = pages[0]["revisions"][0]["slots"]["main"]["content"]
    if "{{Infobox player" not in text:  # página de desambiguación u otra cosa
        return False, "", ""
    box = text[text.index("{{Infobox player"):]
    m = re.search(r"^\s*\|\s*team\s*=\s*([^\n|]*)", box, re.M)
    team = (m.group(1) if m else "").strip()
    team = re.sub(r"\[\[(?:[^|\]]*\|)?([^\]]*)\]\]", r"\1", team)  # [[enlace|texto]] -> texto
    team = re.sub(r"<[^>]+>|\{\{[^}]*\}\}", "", team).strip()
    st = re.search(r"^\s*\|\s*status\s*=\s*([^\n|]*)", box, re.M)
    status = (st.group(1) if st else "").strip().lower()  # active, retired, inactive…
    return True, team, ("retired" if status.startswith("retired") else status)


def liquipedia_teams(db: dict, state: dict, cfg: dict, candidates: set[str], seen_now: set[str]):
    """Rellena el equipo de los pros desde Liquipedia (CC BY-SA 3.0): al verlos en una demo nueva y, si no, cada pocos días."""
    lc = cfg.get("liquipedia", {})
    if lc.get("enabled", True) is False:
        return
    cache = state.setdefault("liquipedia", {})
    days = int(lc.get("recheck_days", 14))
    limit = int(lc.get("lookups_per_run", 40))
    cutoff = (dt.date.today() - dt.timedelta(days=days)).isoformat()
    lp = lambda pid: db["players"][pid].get("lp_name") or db["players"][pid].get("name") or ""  # noqa: E731
    todo = [pid for pid in candidates if pid in db["players"] and (
        pid in seen_now or cache.get(pid, {}).get("t", "") < cutoff or cache.get(pid, {}).get("name") != lp(pid))]
    done = 0
    for pid in todo[:limit]:
        p = db["players"][pid]
        name = p.get("lp_name") or p.get("name") or ""
        if not name:
            continue
        if done:
            time.sleep(2.2)  # Liquipedia pide como mucho 1 petición cada 2 segundos
        try:
            found, team, status = liquipedia_team(name)
        except Exception as e:  # noqa: BLE001
            log(f"Liquipedia {name}: {e}")
            state["liquipedia_error"] = f"{today()} {name}: {e}"[:300]
            break  # si nos limitan, mejor parar y seguir otro día
        done += 1
        cache[pid] = {"t": today(), "name": name, "found": found, "team": team, "status": status}
    for pid, c in cache.items():
        if pid in db["players"] and c.get("found"):
            db["players"][pid]["lp_team"] = c.get("team", "")
            db["players"][pid]["lp_status"] = c.get("status", "")
    if done:
        log(f"Liquipedia: {done} jugadores consultados.")
        state.pop("liquipedia_error", None)


def faceit_room_download(item: dict, work: Path, max_mb: int) -> Path:
    """Descarga la demo de una sala de FACEIT a partir de su enlace."""
    key = os.environ.get("FACEIT_API_KEY", "").strip()
    token = os.environ.get("FACEIT_DOWNLOADS_TOKEN", "").strip()
    if not key or not token:
        raise RuntimeError("los enlaces de salas de FACEIT funcionarán cuando FACEIT apruebe el acceso a sus descargas. "
                           "Mientras tanto, descarga la demo desde la sala y súbela como archivo")
    det = http_json(f"{FACEIT_API}/matches/{item['faceit_room']}", key)
    urls = det.get("demo_url") or []
    if not urls:
        raise RuntimeError("esa partida de FACEIT todavía no tiene demo disponible")
    signed = http_json(FACEIT_DL, token, {"resource_url": urls[0]})["payload"]["download_url"]
    ts = det.get("finished_at") or det.get("started_at")
    if ts:
        item["date"] = dt.datetime.fromtimestamp(ts, dt.timezone.utc).date().isoformat()
    src = work / urls[0].split("?")[0].rsplit("/", 1)[-1]
    log(f"Descargando {src.name} …")
    download(signed, src, max_mb)
    return src


def url_matches(state: dict):
    lines = []
    if URLS.exists():
        lines += [l.strip() for l in URLS.read_text(encoding="utf-8").splitlines()]
    if os.environ.get("DEMO_URL", "").strip():
        lines.append(os.environ["DEMO_URL"].strip())
    done = set(state.get("urls", []))
    for line in lines:
        if not line or line.startswith("#"):
            continue
        url, _, label = line.partition(" ")
        hid = hashlib.sha1(url.encode()).hexdigest()[:16]
        if hid in done:
            continue
        room = FACEIT_ROOM.match(url)
        if room:  # enlace a una sala de FACEIT: la demo se baja con la API
            yield {"id": f"faceit:{room.group(1)}", "faceit_room": room.group(1), "name": room.group(1),
                   "source": label.strip() or "FACEIT", "date": today()}
            if os.environ.get("FACEIT_DOWNLOADS_TOKEN", "").strip():
                done.add(hid)  # sin acceso a descargas no se marca, para poder reintentarlo más adelante
            continue
        name = url.split("?")[0].rsplit("/", 1)[-1] or "demo.dem"
        yield {"id": f"url:{hid}", "url": url, "name": name, "source": label.strip() or "demo", "date": today()}
        done.add(hid)
    state["urls"] = sorted(done)


DEMO_EXT = (".dem", ".dem.gz", ".dem.zst", ".zip", ".rar", ".7z", ".gz", ".zst")


def release_matches(state: dict):
    """Demos subidas como archivos a las releases del repositorio (arrastrar y soltar en GitHub)."""
    repo = os.environ.get("GITHUB_REPOSITORY", "").strip()
    if not repo:
        return
    token = os.environ.get("GITHUB_TOKEN", "").strip()
    headers = {"Accept": "application/vnd.github+json", "User-Agent": UA}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    try:
        req = urllib.request.Request(f"https://api.github.com/repos/{repo}/releases?per_page=30", headers=headers)
        with urllib.request.urlopen(req, timeout=60) as r:
            releases = json.loads(r.read().decode())
    except Exception as e:  # noqa: BLE001
        log(f"Releases: no se pudieron listar: {e}")
        return
    done = set(state.get("releases", []))
    for rel in releases:
        if rel.get("draft"):
            continue
        label = (rel.get("name") or rel.get("tag_name") or "demo").strip()
        for a in rel.get("assets", []):
            aid = str(a.get("id"))
            if aid in done or not a.get("name", "").lower().endswith(DEMO_EXT):
                continue
            yield {"id": f"gh:{aid}", "url": a["browser_download_url"], "name": a["name"],
                   "source": label, "date": (a.get("created_at") or today())[:10]}
            done.add(aid)
    state["releases"] = sorted(done)


def local_matches(state: dict):
    if not LOCAL_DIR.exists():
        return
    done = set(state.get("local", []))
    for f in sorted(LOCAL_DIR.iterdir()):
        if f.is_dir() or f.name.startswith("."):
            continue
        hid = hashlib.sha1(f"{f.name}:{f.stat().st_size}".encode()).hexdigest()[:16]
        if hid in done:
            continue
        date = dt.datetime.fromtimestamp(f.stat().st_mtime, dt.timezone.utc).date().isoformat()
        yield {"id": f"local:{hid}", "path": f, "name": f.name, "source": "demo", "date": date}
        done.add(hid)
    state["local"] = sorted(done)


# ---------------------------------------------------------------- fusión

def merge(db: dict, sid: str, info: dict, source: str, date: str, map_name: str = ""):
    """Añade la mira vista de un jugador. Si cambió, guarda la anterior en el historial."""
    players = db.setdefault("players", {})
    p = players.get(sid)
    info = {**info, "team": clean_team(info.get("team", ""))}
    if p is None:
        players[sid] = {"id": sid, "name": info["name"], "team": info.get("team", ""), "code": info["code"],
                        "since": date, "seen": date, "source": source, "map": map_name, "history": []}
        if info.get("faceit"):
            players[sid]["faceit"], players[sid]["faceit_match"] = info["faceit"], info.get("faceit_match", "")
        if info.get("pro_auto"):
            players[sid]["auto_pro"] = info["pro_auto"]
        return "new"
    if date < p.get("seen", ""):
        # Demo más antigua que lo que ya tenemos: solo sirve para completar el historial.
        if info["code"] != p["code"] and all(h["code"] != info["code"] for h in p["history"]):
            p["history"].append({"code": info["code"], "from": date, "to": date})
            p["history"].sort(key=lambda h: h.get("from") or "")
        return "old"
    if info.get("pro_auto"):
        p["auto_pro"] = info["pro_auto"]
    if info.get("faceit"):
        p["faceit"], p["faceit_match"] = info["faceit"], info.get("faceit_match", p.get("faceit_match", ""))
    if info.get("name") and info["name"] != p.get("name"):
        if p.get("name"):
            p["aliases"] = ([p["name"]] + [a for a in p.get("aliases", []) if a not in (p["name"], info["name"])])[:5]
        p["name"] = info["name"]
    if info.get("team"):
        p["team"] = info["team"]
    p["seen"], p["source"], p["map"] = date, source, map_name or p.get("map", "")
    if info["code"] != p["code"]:
        p["history"].append({"code": p["code"], "from": p.get("since"), "to": date})
        p["history"] = p["history"][-20:]
        p["code"], p["since"] = info["code"], date
        return "changed"
    return "same"


def clean_team(team: str) -> str:
    """FACEIT llama a los equipos de sus partidas «team_<capitán>»: eso no es un equipo real."""
    team = (team or "").strip()
    return "" if team.lower().startswith("team_") else team


def apply_manual(db: dict, only_hidden: bool = False):
    entries = load_json(MANUAL, [])
    for e in entries:
        if not e.get("id"):
            continue
        if e.get("hidden"):
            db.get("players", {}).pop(str(e["id"]), None)
            continue
        if only_hidden or not e.get("code"):
            continue
        if not (NEW_CODE.match(e["code"]) or OLD_CODE.match(e["code"])):
            log(f"manual.json: código no válido para {e['id']}")
            continue
        date = e.get("date") or today()
        merge(db, str(e["id"]), {"name": e.get("name", ""), "team": e.get("team", ""), "code": e["code"]}, e.get("source", "manual"), date)
        p = db["players"][str(e["id"])]
        for k in ("name", "team"):  # lo manual manda sobre lo que diga la demo
            if e.get(k):
                p[k] = e[k]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", choices=["faceit", "urls", "releases", "local", "manual"], help="usar solo una fuente")
    ap.add_argument("--require-teams", action="store_true", help="descartar demos sin nombres de equipo (envíos de la comunidad)")
    ap.add_argument("--report", type=Path, help="guardar un resumen JSON de la ejecución")
    args = ap.parse_args()

    cfg = load_json(CONFIG, {})
    state = load_json(STATE, {})
    db = {"players": {}}
    previous = {}
    for path in (LEGACY, DATA_PLAYERS, DATA_PROS):
        doc = load_json(path, {"players": []})
        previous[path] = doc
        for p in doc.get("players", []):
            p = dict(p)
            if p.pop("pro", None) and p.get("nick"):  # en pros.json el nombre mostrado es el de la lista
                p["name"] = p["nick"]
                p["team"] = p.get("demo_team", "")
            p.pop("demo_team", None)
            p.pop("nick", None)
            p["team"] = clean_team(p.get("team", ""))
            db["players"][p["id"]] = p
    min_players = int(cfg.get("min_players_per_demo", 8))
    stats = {"demos": 0, "new": 0, "changed": 0, "errors": 0}
    report = {"messages": [], "players": []}
    seen_now: set[str] = set()
    max_mb = int(cfg.get("max_demo_mb", 1500))

    def note(msg):
        log(msg)
        report["messages"].append(msg)

    sources = []
    if args.only in (None, "faceit"):
        sources.append(faceit_matches(cfg, state))
    if args.only in (None, "urls"):
        sources.append(url_matches(state))
    if args.only in (None, "releases"):
        sources.append(release_matches(state))
    if args.only in (None, "local"):
        sources.append(local_matches(state))

    max_demos = int(cfg.get("max_demos_per_run", 30))
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        for gen in sources:
            for item in gen:
                if stats["demos"] >= max_demos:
                    log(f"Límite de {max_demos} demos por ejecución alcanzado; el resto queda para la próxima.")
                    break
                work = tmp / hashlib.sha1(item["id"].encode()).hexdigest()[:10]
                work.mkdir()
                try:
                    if "path" in item:
                        src = item["path"]
                    elif "faceit_room" in item:
                        src = faceit_room_download(item, work, max_mb)
                    else:
                        src = work / item["name"]
                        log(f"Descargando {item['name']} …")
                        download(item["url"], src, max_mb)
                    for dem in unpack(src, work):
                        res = extract(dem)
                        if len(res["players"]) < min_players:
                            note(f"{dem.name}: solo {len(res['players'])} jugadores con mira; se ignora.")
                            continue
                        teams = {p["team"] for p in res["players"].values() if p["team"]}
                        if args.require_teams and len(teams) < 2:
                            note(f"{dem.name}: no tiene nombres de equipo, así que no parece un partido profesional; se ignora.")
                            continue
                        stats["demos"] += 1
                        real_teams = {clean_team(t) for t in teams} - {""}
                        tournament = len(real_teams) >= 2  # dos equipos con nombre real: partido profesional
                        fm = FACEIT_FILE.search(dem.name) or FACEIT_FILE.search(item["name"]) or (FACEIT_FILE.search(item["id"]) if item["id"].startswith("faceit:") else None)
                        for sid, info in res["players"].items():
                            if fm:  # en los servidores de FACEIT el nombre del jugador es su usuario de FACEIT
                                info = {**info, "faceit": info["name"], "faceit_match": fm.group(1)}
                            if tournament and clean_team(info.get("team", "")):
                                info = {**info, "pro_auto": "torneo"}
                            r = merge(db, sid, info, item["source"], item["date"], res["map"])
                            seen_now.add(sid)
                            if r in ("new", "changed"):
                                stats[r] += 1
                            report["players"].append({"id": sid, "name": info["name"], "team": clean_team(info["team"]), "faceit": info.get("faceit", ""), "status": r})
                        note(f"{dem.name}: {len(res['players'])} jugadores ({res['map'] or 'mapa desconocido'})")
                except Exception as e:  # noqa: BLE001
                    stats["errors"] += 1
                    note(f"Error con {item['name']}: {e}")
                finally:
                    shutil.rmtree(work, ignore_errors=True)

    apply_manual(db, only_hidden=args.only not in (None, "manual"))
    faceit_verify(db, state, cfg)

    # Pro = está en pros.json, o se ha detectado solo (partido de torneo o cuenta verificada en FACEIT),
    # salvo que manual.json diga "pro": false.
    pros = {str(x["id"]): x for x in load_json(PROS, []) if x.get("id")}
    not_pro = {str(e["id"]) for e in load_json(MANUAL, []) if e.get("id") and e.get("pro") is False}
    is_pro = lambda p: p["id"] in pros or (p.get("auto_pro") and p["id"] not in not_pro)  # noqa: E731
    for pid, x in pros.items():  # nombre de la lista (o página indicada) para buscar en Liquipedia
        if pid in db["players"] and (x.get("liquipedia") or x.get("name")):
            db["players"][pid]["lp_name"] = x.get("liquipedia") or x["name"]
    # Equipos: los de la lista que tengan "team" mandan; si no, Liquipedia; si no, el de la demo.
    candidates = {p["id"] for p in db["players"].values() if is_pro(p) and not pros.get(p["id"], {}).get("team")}
    if args.only != "manual":
        liquipedia_teams(db, state, cfg, candidates, seen_now)
    pro_rows, rest = [], []
    for p in db["players"].values():
        if is_pro(p):
            x = pros.get(p["id"], {})
            team = x.get("team") or (p.get("lp_team") if "lp_team" in p else p.get("team", ""))
            status = x.get("status") or ("" if x.get("team") else p.get("lp_status", ""))
            if status == "retired":
                team = ""
            row = {**p, "status": status, "pro": True, "nick": p.get("name", ""), "demo_team": p.get("team", ""), "name": x.get("name") or p.get("name", ""), "team": team}
            row.pop("lp_name", None)
            pro_rows.append(row)
        else:
            row = dict(p)
            row.pop("lp_name", None)
            rest.append(row)
    key = lambda p: (p.get("name") or "").lower()  # noqa: E731
    pro_rows.sort(key=key)
    rest.sort(key=key)
    players = pro_rows + rest
    now = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    for path, rows in ((DATA_PROS, pro_rows), (DATA_PLAYERS, rest)):
        old = previous.get(path, {})
        save_json(path, {"updated": now if rows != old.get("players", []) else old.get("updated"), "players": rows})
    if LEGACY.exists():
        LEGACY.unlink()
    save_json(STATE, state)
    if args.report:
        save_json(args.report, {**stats, **report, "total": len(players)})
    log(f"Hecho: {stats['demos']} demos, {stats['new']} jugadores nuevos, {stats['changed']} cambios de mira, {stats['errors']} errores. Total: {len(players)} jugadores.")
    return 0 if stats["errors"] == 0 or stats["demos"] > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
