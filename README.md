# CSConfig

Web de miras de CS2: base de datos con las miras de jugadores profesionales, sacadas de demos de partidas reales y actualizada a diario, más un conversor de códigos antiguos (`CSGO-…`) al formato nuevo (`CS…`) de la actualización Rush Hour.

- `site/` contiene la web estática. Se publica tal cual, sin compilar nada.
  - `index.html` es la página de inicio, con la base de datos de miras.
  - `conversor/` es la herramienta de conversión.
  - `assets/crosshair.js` lee y escribe códigos; el formato está comprobado con 30 códigos reales exportados del juego.
  - `data/crosshairs.json` son los datos. Los genera el pipeline; no hace falta editarlos a mano.
- `pipeline/update.py` descarga demos, extrae la mira de cada jugador con [demoparser2](https://github.com/LaihoE/demoparser) y actualiza los datos con historial de cambios.
- `.github/workflows/update.yml` ejecuta el pipeline cada día y guarda los cambios.

## Puesta en marcha

### 1. Publicar la web en Cloudflare Pages

1. En Cloudflare entra en **Workers & Pages → Create → Pages → Connect to Git** y elige este repositorio.
2. Configuración de compilación:
   - Framework preset: `None`
   - Build command: déjalo vacío
   - Build output directory: `site`
3. Guarda. Cada vez que el workflow actualice los datos, Cloudflare vuelve a publicar la web sola.
4. Opcional: en **Custom domains** añade tu dominio.

### 2. Activar la actualización automática (FACEIT)

1. Crea una cuenta de desarrollador en [developers.faceit.com](https://developers.faceit.com), crea una app y genera una **Server-side API key**.
2. Solicita acceso a la **Downloads API** (necesaria para bajar demos) en el formulario `fce.gg/downloads-api-application`. FACEIT avisa de que puede tardar hasta 30 días.
3. En GitHub ve a **Settings → Secrets and variables → Actions** y crea estos secretos:
   - `FACEIT_API_KEY`: la clave de la Data API.
   - `FACEIT_DOWNLOADS_TOKEN`: el token con permiso de descargas, cuando te lo aprueben.
4. En `pipeline/config.json` añade los hubs o campeonatos de FACEIT que quieres seguir. El ID está en la URL del hub o campeonato:

```json
"faceit": {
  "hubs": [{ "id": "ID-DEL-HUB", "label": "FPL" }],
  "championships": [{ "id": "ID-DEL-CAMPEONATO", "label": "Nombre del torneo" }],
  "matches_per_source": 10
}
```

Mientras falte algún secreto, el pipeline se salta FACEIT y sigue con las demás fuentes sin fallar.

### 3. Añadir demos a mano (funciona desde el primer día)

Las demos que bajas de FACEIT vienen en un `.zip` con un archivo `.dem` dentro. No hace falta descomprimirlas: el sistema abre el zip directamente.

**Arrastrando archivos en GitHub (sin instalar nada)**

1. Ve a **Releases → Draft a new release**, o abre el borrador «Demos» si ya existe.
2. Ponle un nombre que sirva de fuente, por ejemplo `FPL · 13 oct`, y crea una etiqueta nueva, por ejemplo `demos-2026-10-13`.
3. Arrastra los `.zip` al recuadro de archivos. Admite hasta 2 GB por archivo.
4. Pulsa **Publish release**. Las demos se procesan solas y la web se actualiza en unos minutos.

Cada archivo se procesa una sola vez. Las releases no cuentan para el tamaño del repositorio.

**Desde tu PC con doble clic (Windows)**

1. Instala [Git](https://git-scm.com/download/win) y [Python](https://www.python.org/downloads/), marcando «Add python.exe to PATH».
2. Clona el repositorio una vez: `git clone https://github.com/iorrogarciablount-bit/CSConfigWeb.git`.
3. Copia los `.zip` (o `.dem`, `.rar`, `.7z`) a `pipeline\demos\`.
4. Haz doble clic en `procesar-demos.bat`. Actualiza, procesa y sube las miras solo.

Para los `.rar` y `.7z` hace falta [7-Zip](https://www.7-zip.org), que se detecta solo. Las demos no se suben al repositorio porque pesan demasiado; ya están en `.gitignore`.

**Con un enlace directo**

Pega la URL en **Enviar demo**, en la web, o en **Actions → Actualizar miras → Run workflow**. También puedes añadir varias a `pipeline/demo_urls.txt`, una por línea.

### 4. Envíos de la comunidad

Cualquiera puede enviar una demo desde el botón **Enviar demo** de la web, que abre el formulario de *issues* del repositorio. Necesita una cuenta de GitHub.

- **Tus envíos**, y los de colaboradores del repo, se procesan al momento.
- **Los de otras personas** quedan con la etiqueta `pendiente`. Revisa que el enlace sea de un partido profesional y ponle la etiqueta `aprobada`: se procesa solo.
- **Respuesta:** el bot contesta en el propio envío con los jugadores añadidos y lo cierra con la etiqueta `procesada` o `rechazada`.
- **Filtros:** se descartan las demos sin nombres de equipo (matchmaking, partidas de amigos), las de menos de 8 jugadores y los archivos de más de `max_demo_mb` MB, que se ajusta en `config.json`.

### 5. Correcciones manuales

`pipeline/manual.json` permite añadir un jugador, corregir su nombre o equipo, u ocultarlo:

```json
[
  { "id": "76561198000000000", "name": "Jugador", "team": "Equipo", "code": "CS…", "source": "Stream oficial", "date": "2026-10-13" },
  { "id": "76561198000000001", "hidden": true }
]
```

El `id` es el SteamID64 del jugador, el mismo que aparece en `crosshairs.json`.

## Cómo se decide cada mira

- De cada demo se toma la mira que tenía cada jugador al final del partido.
- Si un jugador aparece con una mira distinta en una demo más reciente, esa pasa a ser la actual y la anterior se guarda en su historial.
- Las demos más antiguas que lo ya guardado solo completan el historial.
- El equipo sale del nombre de equipo de la demo. El nombre del jugador sale de su nombre en la partida, salvo que lo corrijas en `manual.json`.
- Las demos con menos de 8 jugadores con mira válida se ignoran (por ejemplo, entrenamientos). Se ajusta en `config.json`.

## Aviso

Proyecto independiente. No está afiliado ni respaldado por Valve ni por los equipos o jugadores que aparecen.
