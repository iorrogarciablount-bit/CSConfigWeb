"""Recoge demos de la carpeta de Descargas y archiva las ya procesadas.

Lo usa procesar-demos.bat para que no haya que mover archivos a mano:

  python pipeline/recoger_demos.py             mueve a pipeline/demos/ las demos de Descargas
  python pipeline/recoger_demos.py --archivar  mueve las ya procesadas a pipeline/demos/procesadas/

Solo toca archivos que son demos de CS2 de verdad: .dem, .dem.gz, .dem.zst, o .zip/.rar/.7z
que contienen algún .dem. Ignora lo que tenga más de DIAS días.

La carpeta de Descargas se puede cambiar con la variable CSCONFIG_DESCARGAS.
"""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
import zipfile
from pathlib import Path

PIPE = Path(__file__).resolve().parent
DEMOS = PIPE / "demos"
DONE_DIR = DEMOS / "procesadas"
STATE = PIPE / "state.json"
DIAS = 14
DIRECT = (".dem", ".dem.gz", ".dem.zst")
ARCHIVES = (".zip", ".rar", ".7z")


def downloads_dir() -> Path:
    custom = os.environ.get("CSCONFIG_DESCARGAS")
    if custom:
        return Path(custom).expanduser()
    home = Path.home()
    for cand in (home / "Downloads", home / "Descargas", home / "OneDrive" / "Downloads"):
        if cand.is_dir():
            return cand
    return home / "Downloads"


def seven_zip() -> str | None:
    exe = shutil.which("7z") or shutil.which("7zz")
    for cand in (r"C:\Program Files\7-Zip\7z.exe", r"C:\Program Files (x86)\7-Zip\7z.exe"):
        if not exe and Path(cand).exists():
            exe = cand
    return exe


def has_demo(path: Path) -> bool:
    """¿Es una demo, o un comprimido que contiene alguna?"""
    name = path.name.lower()
    if name.endswith(DIRECT):
        return True
    try:
        if name.endswith(".zip"):
            with zipfile.ZipFile(path) as z:
                return any(n.lower().endswith(DIRECT) for n in z.namelist())
        if name.endswith((".rar", ".7z")):
            exe = seven_zip()
            if not exe:
                print(f"  ! {path.name}: hace falta 7-Zip para mirar dentro de los .rar/.7z (https://www.7-zip.org)")
                return False
            out = subprocess.run([exe, "l", "-ba", str(path)], capture_output=True, text=True, timeout=60)
            return out.returncode == 0 and ".dem" in out.stdout.lower()
    except (zipfile.BadZipFile, OSError, subprocess.SubprocessError):
        return False
    return False


def collect() -> int:
    src = downloads_dir()
    if not src.is_dir():
        print(f"  No encuentro la carpeta de descargas ({src}). Puedes indicarla con CSCONFIG_DESCARGAS.")
        return 0
    DEMOS.mkdir(parents=True, exist_ok=True)
    limit = time.time() - DIAS * 86400
    moved = 0
    for f in sorted(src.iterdir()):
        low = f.name.lower()
        if not f.is_file() or not low.endswith(DIRECT + ARCHIVES) or f.stat().st_mtime < limit:
            continue
        if low.endswith((".crdownload", ".part")):
            continue
        if not has_demo(f):
            continue
        dest = DEMOS / f.name
        if dest.exists() or (DONE_DIR / f.name).exists():
            print(f"  = {f.name}: ya estaba, no se mueve")
            continue
        size = f.stat().st_size / 1e6
        shutil.move(str(f), dest)
        print(f"  + {f.name} ({size:.0f} MB)")
        moved += 1
    print(f"  {moved} demo(s) recogida(s) de {src}" if moved else f"  No hay demos nuevas en {src}")
    return moved


def archive() -> int:
    """Mueve a procesadas/ las demos que update.py ya marcó como hechas (mismo id que local_matches)."""
    if not DEMOS.is_dir():
        return 0
    try:
        done = set(json.loads(STATE.read_text(encoding="utf-8")).get("local", []))
    except (OSError, ValueError):
        return 0
    DONE_DIR.mkdir(parents=True, exist_ok=True)
    n = 0
    for f in sorted(DEMOS.iterdir()):
        if f.is_dir() or f.name.startswith("."):
            continue
        hid = hashlib.sha1(f"{f.name}:{f.stat().st_size}".encode()).hexdigest()[:16]
        if hid in done:
            shutil.move(str(f), DONE_DIR / f.name)
            n += 1
    if n:
        size = sum(p.stat().st_size for p in DONE_DIR.iterdir() if p.is_file()) / 1e9
        print(f"  {n} demo(s) archivada(s) en {DONE_DIR} ({size:.1f} GB en total; puedes borrarlas cuando quieras)")
    return n


if __name__ == "__main__":
    archive() if "--archivar" in sys.argv else collect()
