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
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PIPE = ROOT / "pipeline"
DATA = ROOT / "site" / "data" / "crosshairs.json"
STATE = PIPE / "state.json"
CONFIG = PIPE / "config.json"
MANUAL = PIPE / "manual.json"
URLS = PIPE / "demo_urls.txt"
LOCAL_DIR = PIPE / "demos"

NEW_CODE = re.compile(r"^CS[A-Za-z0-9]{44}$")
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
    if name.endswith((".zip", ".rar", ".7z")):
        exe = shutil.which("7z") or shutil.which("7zz")
        if not exe:
            raise RuntimeError("Hace falta 7-Zip (7z) para abrir archivos .zip/.rar/.7z")
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
        name = url.split("?")[0].rsplit("/", 1)[-1] or "demo.dem"
        yield {"id": f"url:{hid}", "url": url, "name": name, "source": label.strip() or "demo", "date": today()}
        done.add(hid)
    state["urls"] = sorted(done)


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
    if p is None:
        players[sid] = {"id": sid, "name": info["name"], "team": info.get("team", ""), "code": info["code"],
                        "since": date, "seen": date, "source": source, "map": map_name, "history": []}
        return "new"
    if date < p.get("seen", ""):
        # Demo más antigua que lo que ya tenemos: solo sirve para completar el historial.
        if info["code"] != p["code"] and all(h["code"] != info["code"] for h in p["history"]):
            p["history"].append({"code": info["code"], "from": date, "to": date})
            p["history"].sort(key=lambda h: h.get("from") or "")
        return "old"
    if info.get("name"):
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


def apply_manual(db: dict):
    entries = load_json(MANUAL, [])
    for e in entries:
        if not e.get("id") or not e.get("code"):
            continue
        if e.get("hidden"):
            db.get("players", {}).pop(str(e["id"]), None)
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
    ap.add_argument("--only", choices=["faceit", "urls", "local", "manual"], help="usar solo una fuente")
    ap.add_argument("--require-teams", action="store_true", help="descartar demos sin nombres de equipo (envíos de la comunidad)")
    ap.add_argument("--report", type=Path, help="guardar un resumen JSON de la ejecución")
    args = ap.parse_args()

    cfg = load_json(CONFIG, {})
    state = load_json(STATE, {})
    current = load_json(DATA, {"players": []})
    db = {"players": {p["id"]: p for p in current.get("players", [])}}
    min_players = int(cfg.get("min_players_per_demo", 8))
    stats = {"demos": 0, "new": 0, "changed": 0, "errors": 0}
    report = {"messages": [], "players": []}
    max_mb = int(cfg.get("max_demo_mb", 1500))

    def note(msg):
        log(msg)
        report["messages"].append(msg)

    sources = []
    if args.only in (None, "faceit"):
        sources.append(faceit_matches(cfg, state))
    if args.only in (None, "urls"):
        sources.append(url_matches(state))
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
                        for sid, info in res["players"].items():
                            r = merge(db, sid, info, item["source"], item["date"], res["map"])
                            if r in ("new", "changed"):
                                stats[r] += 1
                            report["players"].append({"name": info["name"], "team": info["team"], "status": r})
                        note(f"{dem.name}: {len(res['players'])} jugadores ({res['map'] or 'mapa desconocido'})")
                except Exception as e:  # noqa: BLE001
                    stats["errors"] += 1
                    note(f"Error con {item['name']}: {e}")
                finally:
                    shutil.rmtree(work, ignore_errors=True)

    if args.only in (None, "manual"):
        apply_manual(db)

    players = sorted(db["players"].values(), key=lambda p: (p.get("name") or "").lower())
    changed = players != current.get("players", [])
    out = {"updated": dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat() if changed else current.get("updated"),
           "players": players}
    save_json(DATA, out)
    save_json(STATE, state)
    if args.report:
        save_json(args.report, {**stats, **report, "total": len(players)})
    log(f"Hecho: {stats['demos']} demos, {stats['new']} jugadores nuevos, {stats['changed']} cambios de mira, {stats['errors']} errores. Total: {len(players)} jugadores.")
    return 0 if stats["errors"] == 0 or stats["demos"] > 0 else 1


if __name__ == "__main__":
    sys.exit(main())
