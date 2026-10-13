# CSConfig

Web de miras de CS2: base de datos con las miras de jugadores profesionales, sacadas de demos de partidas reales y actualizada a diario, más un conversor de códigos antiguos (`CSGO-…`) al formato nuevo (`CS…`) de la actualización Rush Hour.

- `site/` contiene la web estática. Se publica tal cual, sin compilar nada.
  - `index.html` es la página de inicio, con la base de datos de miras.
  - `conversor/` es la herramienta de conversión.
  - `assets/crosshair.js` lee y escribe códigos; el formato está comprobado con 30 códigos reales exportados del juego.
  - `data/pros.json` y `data/players.json` son los datos: los pros identificados y el resto de jugadores. Los genera el pipeline; no hace falta editarlos a mano.
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

### 4. Formulario de envío en la web

La página **Enviar demo** (`site/enviar/`) deja que cualquiera mande el enlace de una partida sin cuenta de GitHub. Por dentro, una función de Cloudflare (`functions/api/`) crea el envío en GitHub y la página va mostrando su estado, con los jugadores añadidos al terminar.

Para activarlo, en Cloudflare entra en **Workers & Pages → tu proyecto → Settings → Variables and Secrets** y añade:

| Nombre | Tipo | Valor |
|---|---|---|
| `GITHUB_REPO` | Text | `iorrogarciablount-bit/CSConfigWeb` |
| `GITHUB_TOKEN` | Secret | Token *fine-grained* de GitHub (Settings → Developer settings → Fine-grained tokens) con acceso solo a este repositorio y permiso **Issues: Read and write** |
| `TURNSTILE_SITEKEY` | Text | Clave pública del widget anti-bots |
| `TURNSTILE_SECRET` | Secret | Clave secreta del widget |

Las claves de Turnstile se crean gratis en Cloudflare, en **Turnstile → Add widget**, añadiendo el dominio de la web. Después vuelve a desplegar el proyecto (**Deployments → Retry deployment**).

Los envíos de la web quedan siempre con la etiqueta `pendiente`. Ponles `aprobada` desde GitHub, también desde la app del móvil, y se procesan solos.

Los enlaces de salas de FACEIT (`faceit.com/…/cs2/room/…`) funcionarán cuando FACEIT apruebe el acceso a la Downloads API. Hasta entonces, el envío se descarta con un aviso; los enlaces directos a demos funcionan ya.

### 4b. Envíos desde GitHub

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

El `id` es el SteamID64 del jugador, el mismo que aparece en los archivos de datos y en el enlace a su perfil de Steam en la web.

Las peticiones de retirada llegan como *issues* con la etiqueta `retirada`: añade el SteamID a `manual.json` con `"hidden": true`.

### 6. Pros

Un jugador aparece en la pestaña **Pros** si se cumple cualquiera de estas condiciones:

- **Partido de torneo:** la demo tiene dos equipos con nombre real, no los `team_xxx` de FACEIT. Sus jugadores pasan a Pros solos, con ese equipo.
- **Cuenta verificada en FACEIT:** se comprueba con la Data API, así que necesita el secreto `FACEIT_API_KEY`, que se obtiene al momento sin aprobación. Cada jugador se revisa como mucho una vez cada 30 días.
- **Lista manual:** está en `pipeline/pros.json`, que además fija su nombre y equipo reales.

**Equipos:** para los pros sin equipo fijado en `pros.json`, el equipo y si están retirados se consultan en [Liquipedia](https://liquipedia.net/counterstrike/) (CC BY-SA 3.0, citado al pie de la web). La consulta se hace cada vez que un pro aparece en una demo nueva y, si no, cada 14 días, respetando el límite de Liquipedia de una consulta cada 2 segundos. Si un pro está retirado, la web muestra «Retirado» en lugar del equipo. En `pros.json` puedes fijar `"team"` o `"status": "retired"` a mano.

Para quitar a alguien de Pros aunque se haya detectado solo, añade a `manual.json` una línea como `{ "id": "SteamID64", "pro": false }`. Todos los demás jugadores siguen guardados y se pueden buscar en la pestaña **Jugadores**.

```json
[
  { "id": "76561198386265483", "name": "donk", "team": "Team Spirit" }
]
```

Para añadir un pro, busca su SteamID64 en la ficha de la pestaña Jugadores (enlace «Perfil de Steam») y añade una línea. Al guardar el archivo se actualiza la web sola y el jugador pasa a la pestaña Pros.

## Cómo se decide cada mira

- De cada demo se toma la mira que tenía cada jugador al final del partido.
- Si un jugador aparece con una mira distinta en una demo más reciente, esa pasa a ser la actual y la anterior se guarda en su historial.
- Las demos más antiguas que lo ya guardado solo completan el historial.
- El equipo sale del nombre de equipo de la demo. El nombre del jugador sale de su nombre en la partida, salvo que lo corrijas en `manual.json`.
- Las demos con menos de 8 jugadores con mira válida se ignoran (por ejemplo, entrenamientos). Se ajusta en `config.json`.

## Aviso

Proyecto independiente. No está afiliado ni respaldado por Valve ni por los equipos o jugadores que aparecen.
