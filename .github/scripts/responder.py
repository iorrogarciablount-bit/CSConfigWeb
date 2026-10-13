"""Comenta en el envío lo que ha pasado y lo cierra con la etiqueta correspondiente."""
import json
import os
import subprocess
from pathlib import Path

repo, num = os.environ["REPO"], os.environ["NUM"]
error = os.environ.get("ENVIO_ERROR", "")
report_path = Path(os.environ.get("RUNNER_TEMP", "/tmp")) / "report.json"
rep = json.loads(report_path.read_text(encoding="utf-8")) if report_path.exists() else None

ESTADO = {"new": "nueva", "changed": "cambiada", "same": "sin cambios", "old": "historial"}

if error:
    body, label = f"No he podido procesar el envío: {error}\n\nEdita el formulario o abre uno nuevo con el enlace directo a la demo.", "rechazada"
elif rep is None:
    body, label = "Algo ha fallado al procesar la demo. Lo reviso y te digo.", "error"
elif rep.get("demos", 0) > 0:
    lines = [f"Procesada. {len(rep['players'])} jugadores leídos: **{rep['new']}** nuevos y **{rep['changed']}** con la mira cambiada.", "",
             "| Jugador | Equipo | Mira |", "|---|---|---|"]
    for p in sorted(rep["players"], key=lambda p: (p["team"], p["name"].lower())):
        lines.append(f"| {p['name'] or '—'} | {p['team'] or '—'} | {ESTADO.get(p['status'], p['status'])} |")
    lines += ["", "Los cambios aparecerán en la web en unos minutos. ¡Gracias por aportar!"]
    body, label = "\n".join(lines), "procesada"
else:
    msgs = rep.get("messages") or ["Esta demo ya se había procesado antes."]
    body = "No se ha añadido ninguna mira:\n\n" + "\n".join(f"- {m}" for m in msgs)
    label = "rechazada"

def gh(*args):
    subprocess.run(["gh", *args, "--repo", repo], check=False)

colors = {"procesada": "0E8A16", "rechazada": "B60205", "error": "D93F0B"}
gh("label", "create", label, "--color", colors[label], "--force")
gh("issue", "comment", num, "--body", body)
gh("issue", "edit", num, "--add-label", label)
gh("issue", "edit", num, "--remove-label", "pendiente")
if label != "error":
    gh("issue", "close", num)
print(body)
