"""Saca la URL y la etiqueta del formulario de envío y las deja en variables de entorno seguras."""
import os
import re

body = os.environ.get("ISSUE_BODY", "")


def section(title: str) -> str:
    m = re.search(rf"###\s*{re.escape(title)}\s*\n+(.*?)(?=\n###|\Z)", body, re.S)
    val = (m.group(1) if m else "").strip()
    return "" if val == "_No response_" else val


url_text = section("Enlace a la demo") or body
m = re.search(r"https://[^\s<>\"'`)]+", url_text)
url = m.group(0) if m else ""
label = re.sub(r"[\r\n\t]+", " ", section("Torneo o partido"))
label = re.sub(r"[^\w\s·.,:&'()/-]", "", label, flags=re.U).strip()[:80] or "Envío de la comunidad"

ok = bool(url) and len(url) < 2000
with open(os.environ["GITHUB_ENV"], "a", encoding="utf-8") as f:
    if ok:
        f.write(f"DEMO_URL={url} {label}\n")
    f.write(f"ENVIO_ERROR={'' if ok else 'No encuentro un enlace https:// a la demo en el formulario.'}\n")
with open(os.environ["GITHUB_OUTPUT"], "a", encoding="utf-8") as f:
    f.write(f"ok={'true' if ok else 'false'}\n")
print("URL:", url or "(ninguna)", "| Etiqueta:", label)
