"""Tras la actualización diaria: contesta en cada envío de sala de FACEIT que se ha procesado desde la cola
(lo que antes quedó "en cola"), con las miras añadidas o el motivo del fallo, para que la página de enviar lo muestre."""
import json
import os
import subprocess
from pathlib import Path

repo = os.environ["REPO"]
path = Path(os.environ.get("RUNNER_TEMP", "/tmp")) / "report.json"
rep = json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
ESTADO = {"new": "nueva", "changed": "cambiada", "same": "sin cambios", "old": "historial"}


def gh(*args):
    subprocess.run(["gh", *args, "--repo", repo], check=False)


for c in rep.get("cola", []):
    if not c.get("issue"):
        continue
    num, players = str(c["issue"]), c.get("players") or []
    new = sum(p["status"] == "new" for p in players)
    changed = sum(p["status"] == "changed" for p in players)
    if c.get("ok"):
        lines = [f"Procesada. {len(players)} jugadores leídos: **{new}** nuevos y **{changed}** con la mira cambiada.", "",
                 "| Jugador | Equipo | Mira |", "|---|---|---|"]
        lines += [f"| {p['name'] or '—'} | {p['team'] or '—'} | {ESTADO.get(p['status'], p['status'])} |"
                  for p in sorted(players, key=lambda p: (p["team"], p["name"].lower()))]
        body, label = "\n".join(lines), "procesada"
    else:
        body = "No se ha añadido ninguna mira:\n\n" + "\n".join(f"- {m}" for m in (c.get("messages") or ["la demo no se pudo procesar."]))
        label = "rechazada"
    summary = {"state": label, "new": new, "changed": changed, "demos": 1 if c.get("ok") else 0,
               "players": [{k: p.get(k, "") for k in ("id", "name", "team", "faceit", "status")} for p in players][:20],
               "messages": (c.get("messages") or [])[:5]}
    body += "\n\n<!-- resultado: " + json.dumps(summary, ensure_ascii=False).replace("-->", "") + " -->"
    gh("label", "create", label, "--color", {"procesada": "0E8A16", "rechazada": "B60205"}[label], "--force")
    gh("issue", "comment", num, "--body", body)
    gh("issue", "edit", num, "--add-label", label, "--remove-label", "en-cola")
    print(f"#{num}: {label}")
