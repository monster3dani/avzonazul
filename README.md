# AVZonazul

Web móvil instalable que te dice **qué app de pago de zona azul funciona en el municipio donde has aparcado**. Funciona en Android y en iPhone. Un proyecto DanLab.

## Publicarla en GitHub Pages (una sola vez)

1. En GitHub, crea un repositorio **público** llamado `avzonazul`.
2. Pulsa **Add file → Upload files**, arrastra **todo el contenido** de esta carpeta (no la carpeta en sí: tienen que verse `index.html`, `data.json`, `icons/`… en la raíz) y pulsa **Commit changes**.
3. Ve a **Settings → Pages**. En *Source* elige **Deploy from a branch**, rama **main**, carpeta **/ (root)** y **Save**.
4. En un par de minutos estará en: `https://monster3dani.github.io/avzonazul/`

Ese enlace es el que compartes. Desde el móvil, la propia web ofrece "Instalar" (Android) o explica cómo añadirla a la pantalla de inicio (iPhone).

## Qué fichero toco para cada cosa

| Quiero… | Fichero |
|---|---|
| Añadir o corregir municipios y apps | `data.json` |
| Cambiar el nombre o poner el formulario de avisos | `config.js` |
| Cambiar el icono | `icons/` (sustituye los PNG manteniendo nombres) |

Al cambiar `data.json` en GitHub, todos los usuarios ven los datos nuevos al abrir la app, sin hacer nada.
Si cambias `app.js`, `styles.css` o `index.html`, sube también el número de `VERSION` en `sw.js` (por ejemplo `avzonazul-v3`) para que los móviles se actualicen.

## Formato de data.json

- `apps`: cada app con su nombre, web y, si se conocen, el id de App Store (`ios`) y el paquete de Google Play (`android`).
- `places`: cada municipio con `n` (nombre), `p` (provincia), `al` (otros nombres, opcional) y `a` (apps que funcionan).
- En cada app del municipio, `c` vale `reciente` (dato confirmado con fuentes recientes) o `por_confirmar` (sale en listados antiguos).

## Avisos de los usuarios

Mientras `formulario` esté vacío en `config.js`, el botón "Avísanos" abre un aviso (issue) en el repositorio de GitHub, que requiere cuenta de GitHub. Lo recomendable es crear un Google Form sencillo (municipio, app, cómo lo sabe) y pegar su enlace en `config.js`.

## Notas

- El municipio se detecta con OpenStreetMap (Nominatim), gratis y sin registro. Para un uso moderado va sobrado.
- La firma DanLab del icono es una versión dibujada aproximada; si quieres la oficial, sustituye `icons/icon.svg` y los PNG por los tuyos.
