// Preparación de la APK. Lo ejecuta GitHub al fabricarla; no hace falta tocarlo.
//   node native/prepare.js web                 -> copia la web a www/
//   node native/prepare.js android <versión>   -> ajusta el proyecto Android
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const [, , mode, version] = process.argv;

function copy(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const f of fs.readdirSync(src)) copy(path.join(src, f), path.join(dst, f));
  } else {
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
  }
}
function patch(file, fn) {
  const before = fs.readFileSync(file, "utf8");
  const after = fn(before);
  if (after === before) throw new Error("No se pudo modificar " + file);
  fs.writeFileSync(file, after);
}

if (mode === "web") {
  const WWW = path.join(ROOT, "www");
  fs.rmSync(WWW, { recursive: true, force: true });
  for (const f of ["index.html", "styles.css", "app.js", "config.js", "version.js", "data.json", "manifest.webmanifest", "lib", "fonts", "icons"]) {
    copy(path.join(ROOT, f), path.join(WWW, f));
  }
  console.log("Web copiada a www/");
} else if (mode === "android") {
  if (!/^\d+\.\d+\.\d+$/.test(version || "")) throw new Error("Versión no válida: " + version);
  const APP = path.join(ROOT, "android", "app");
  const MAIN = path.join(APP, "src", "main");

  // Iconos, pantalla de arranque e icono de notificación
  copy(path.join(__dirname, "res"), path.join(MAIN, "res"));
  // Código Java propio (actualizador)
  copy(path.join(__dirname, "java"), path.join(MAIN, "java", "net", "danlab", "avzonazul"));

  // Permisos
  patch(path.join(MAIN, "AndroidManifest.xml"), s => s.replace("</manifest>", `
    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />
    <uses-permission android:name="android.permission.USE_EXACT_ALARM" />
    <uses-permission android:name="android.permission.SCHEDULE_EXACT_ALARM" android:maxSdkVersion="32" />
</manifest>`));

  // Versión y firma
  const [a, b, c] = version.split(".").map(Number);
  const code = a * 10000 + b * 100 + c;
  patch(path.join(APP, "build.gradle"), s => s
    .replace(/versionCode \d+/, `versionCode ${code}`)
    .replace(/versionName "[^"]*"/, `versionName "${version}"`)
    .replace(/android \{/, `android {
    signingConfigs {
        release {
            storeFile file(System.getenv("AVZ_KEYSTORE"))
            storePassword System.getenv("AVZ_KS_PASS")
            keyAlias "avzonazul"
            keyPassword System.getenv("AVZ_KS_PASS")
        }
    }`)
    .replace(/release \{\s*\n(\s*)minifyEnabled false/, (m, sp) => `release {\n${sp}signingConfig signingConfigs.release\n${sp}minifyEnabled false`));
  const g = fs.readFileSync(path.join(APP, "build.gradle"), "utf8");
  if (!g.includes("signingConfig signingConfigs.release")) throw new Error("No se pudo configurar la firma");
  console.log(`Android preparado: versión ${version} (${code})`);
} else {
  throw new Error("Uso: node native/prepare.js web|android <versión>");
}
