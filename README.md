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
| Añadir horarios | `data.json` (ver «Horarios») |

Al cambiar `data.json` en GitHub, todos los usuarios ven los datos nuevos al abrir la app, sin hacer nada.
Si cambias cualquier otro fichero de la app, sube el número en `version.js`. Los móviles verán «Hay una versión nueva» y se actualizan con un toque.

**Cómo numerar** (`1.1.0`):
- Arreglo pequeño → el último número (`1.1.0` → `1.1.1`).
- Novedades → el del medio (`1.1.1` → `1.2.0`).
- Cambio enorme → el primero (`1.9.0` → `2.0.0`).

Historial: 1.0.0 primera versión · 1.1.0 portada nueva, mapa, logos, horarios, aviso de ticket y formulario con lista de apps · 1.2.0 app Android (APK), logo DanLab oficial y más ciudades.

## Formato de data.json

- `apps`: cada app con su nombre, web y, si se conocen, el id de App Store (`ios`) y el paquete de Google Play (`android`).
- `places`: cada municipio con `n` (nombre), `p` (provincia), `al` (otros nombres, opcional) y `a` (apps que funcionan).
- En cada app del municipio, `c` vale `reciente` (dato confirmado con fuentes recientes) o `por_confirmar` (sale en listados antiguos).

## Avisos de los usuarios (Google Form)

Los avisos que manda la gente desde la app pueden llegarte directamente a una hoja de Google, sin que nadie necesite cuenta:

1. Entra en forms.google.com y crea un formulario en blanco llamado "Avisos AVZonazul".
2. Añade 4 preguntas de tipo **Respuesta corta**, en este orden: `Municipio`, `Qué pasa`, `App` y `Comentario`.
3. Menú de los tres puntos (arriba a la derecha) → **Obtener enlace rellenado previamente**.
4. En cada pregunta escribe exactamente, en mayúsculas: `MUNICIPIO`, `ESTADO`, `APP` y `COMENTARIO`. Pulsa **Obtener enlace** y luego **Copiar enlace**.
5. Pega ese enlace entre las comillas de `formulario:` en `config.js` y súbelo a GitHub.

Las respuestas aparecen en la pestaña **Respuestas** del formulario (puedes enlazarlas a una hoja de cálculo). Mientras `formulario` esté vacío, los avisos abren una incidencia en GitHub.

## Horarios

Cada municipio puede llevar `h` con su horario orientativo:

```json
"h": {
  "t": [[1,5,"09:00","14:00"], [1,5,"16:00","20:00"], [6,6,"09:00","14:00"]],
  "u": [6],
  "v": {"desde":"08-01","hasta":"08-31","t":[[1,5,"09:00","15:00"]]},
  "nota": "Texto libre"
}
```

- `t`: tramos de pago `[día desde, día hasta, hora inicio, hora fin]` (1 = lunes … 7 = domingo).
- `u`: días en que depende de la zona (la app dice «mira el cartel»).
- `v`: horario especial de verano entre dos fechas (mes-día).

## Notas

- El municipio se detecta con OpenStreetMap (Nominatim), gratis y sin registro. Para un uso moderado va sobrado.
- La firma DanLab del icono es una versión dibujada aproximada; si quieres la oficial, sustituye `icons/icon.svg` y los PNG por los tuyos.

## App Android (APK)

GitHub fabrica el APK solo cada vez que cambias `version.js`, y lo publica en **Releases** con el nombre `AVZonazul.apk`.

**Una sola vez:** en el repositorio, **Settings → Secrets and variables → Actions → New repository secret**:
- Name: `AVZ_KS_PASS`
- Secret: la contraseña de firma (te la pasé aparte; guárdala, sin ella no se pueden fabricar actualizaciones).

**Cómo se instala:** desde el móvil, abre la web y pulsa «Descargar la app para Android», o entra en Releases y descarga `AVZonazul.apk`.

**Cómo se actualiza:** sube el número de `version.js`. GitHub fabrica la versión nueva (pestaña **Actions**, unos 5 minutos) y la app avisa «Hay una versión nueva» → **Actualizar** → **Instalar**.

**Qué hace distinto la APK:**
- El aviso de fin de ticket lo programa Android: suena aunque la app esté cerrada o el móvil bloqueado.
- Los datos (`data.json`) los lee de la web, así que siguen actualizándose sin fabricar otra APK.

Ficheros de la parte Android: `native/` (iconos, actualizador, preparación), `package.json`, `capacitor.config.json` y `.github/workflows/apk.yml`. La clave de firma es `native/avzonazul.keystore`: no la borres ni la cambies, o las actualizaciones no se podrán instalar encima.
