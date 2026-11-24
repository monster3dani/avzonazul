(() => {
  "use strict";
  const CFG = window.AVZONAZUL_CONFIG || {};
  const TEXTS = window.AVZ_TEXTS || {};
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const ua = navigator.userAgent;
  const PLATFORM = /android/i.test(ua) ? "android"
    : (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) ? "ios" : "otro";

  let DATA = null, FEST = null, INDEX = [], lastPlace = null, lastView = null, map = null, lastCoords = null;
  let INSTALLED = {};

  // ¿Estamos dentro de la app Android (APK) o en el navegador?
  const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const Plugin = name => (NATIVE && window.Capacitor.Plugins && window.Capacitor.Plugins[name]) || null;
  const DATA_URL = CFG.datos || `https://${(CFG.repo || "").split("/")[0]}.github.io/${(CFG.repo || "").split("/")[1]}/data.json`;
  const BASE_URL = DATA_URL.replace(/data\.json$/, "");

  // ================= utilidades =================
  const norm = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[’'`´]/g, " ").replace(/[\/\-–,().]/g, " ").replace(/\s+/g, " ").trim();
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} }
  };
  const pad = n => String(n).padStart(2, "0");
  const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const toMin = s => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  const clock = s => s.replace(/^0/, "");
  const showTime = s => LANG === "en" ? clock(s) : clock(s).replace(/:00$/, " h");
  function status(msg) { const el = $("#status"); el.hidden = !msg; if (msg) el.textContent = msg; }
  let toastT = null;
  function toast(msg) {
    const el = $("#toast"); el.textContent = msg; el.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { el.hidden = true; }, 3500);
  }
  function openExternal(url) {
    if (NATIVE) location.href = url; else window.open(url, "_blank", "noopener");
  }
  if (NATIVE) {
    document.documentElement.classList.add("native");
    document.addEventListener("click", e => {
      const a = e.target.closest && e.target.closest('a[href^="http"]');
      if (a) { e.preventDefault(); openExternal(a.href); }
    });
  }
  function jsonp(url, timeout = 7000) {
    return new Promise((resolve, reject) => {
      const cb = "avz_cb_" + Math.random().toString(36).slice(2);
      const s = document.createElement("script");
      const done = (fn, v) => { clearTimeout(t); delete window[cb]; s.remove(); fn(v); };
      const t = setTimeout(() => done(reject, new Error("timeout")), timeout);
      window[cb] = data => done(resolve, data);
      s.onerror = () => done(reject, new Error("net"));
      s.src = url + (url.includes("?") ? "&" : "?") + "callback=" + cb;
      document.head.appendChild(s);
    });
  }
  function distance(a, b) {
    const R = 6371000, r = x => x * Math.PI / 180;
    const dLat = r(b.lat - a.lat), dLon = r(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  const fmtDist = m => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0).replace(".", LANG === "en" ? "." : ",")} km`;

  // ================= idiomas =================
  let LANG = store.get("lang") || ((navigator.language || "es").slice(0, 2) === "ca" ? "ca"
    : (navigator.language || "es").slice(0, 2) === "es" ? "es" : (navigator.language ? "en" : "es"));
  if (!TEXTS[LANG]) LANG = "es";
  function T(key, vars) {
    let s = (TEXTS[LANG] && TEXTS[LANG][key]) ?? (TEXTS.es && TEXTS.es[key]) ?? key;
    if (vars && typeof s === "string") for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(v);
    return s;
  }
  const LOCALE = () => ({ es: "es-ES", ca: "ca-ES", en: "en-GB" })[LANG];
  function applyI18n() {
    document.documentElement.lang = LANG;
    $$("[data-i18n]").forEach(el => { el.textContent = T(el.dataset.i18n); });
    $$("[data-i18n-html]").forEach(el => { el.innerHTML = T(el.dataset.i18nHtml); });
    $$("[data-i18n-ph]").forEach(el => { el.placeholder = T(el.dataset.i18nPh); });
    $$("[data-i18n-aria]").forEach(el => { el.setAttribute("aria-label", T(el.dataset.i18nAria)); });
    $$("#before option").forEach(o => { o.textContent = T("before", { n: o.value }); });
    $$(".langs button").forEach(b => b.classList.toggle("on", b.dataset.lang === LANG));
    const note = T("dataLangNote"); $("#langNote").hidden = !note; $("#langNote").textContent = note;
    if (DATA) {
      $("#count").textContent = T("places", { n: DATA.places.length });
      $("#updated").textContent = T("reviewed", { d: new Date(DATA.updated).toLocaleDateString(LOCALE(), { day: "numeric", month: "long", year: "numeric" }) });
    }
  }
  function setLang(l) {
    LANG = l; store.set("lang", l); applyI18n();
    if (lastView) render(lastView.place, lastView.name, lastView.coords, true);
    renderCar(); renderQuick(); runTicket();
  }

  // ================= datos =================
  async function fetchJSON(name) {
    if (NATIVE) {
      // En la APK: datos frescos de la web; si no hay red, la última copia o los que vienen dentro
      try {
        const r = await fetch(BASE_URL + name, { cache: "no-cache" });
        if (!r.ok) throw 0;
        const j = await r.json(); store.set("cache:" + name, j); return j;
      } catch (_) {
        return store.get("cache:" + name) || await (await fetch(name)).json();
      }
    }
    const r = await fetch(name, { cache: "no-cache" });
    return r.json();
  }
  async function loadData() {
    DATA = await fetchJSON("data.json");
    try { FEST = await fetchJSON("festivos.json"); } catch (_) { FEST = null; }
    INDEX = [];
    for (const p of DATA.places) {
      INDEX.push({ key: norm(p.n), place: p });
      for (const a of (p.al || [])) INDEX.push({ key: norm(a), place: p });
    }
  }
  function findExact(name) {
    for (const part of [name, ...String(name || "").split("/")]) {
      const k = norm(part); if (!k) continue;
      const h = INDEX.find(e => e.key === k); if (h) return h.place;
    }
    return null;
  }
  function searchPlaces(q) {
    const k = norm(q); if (k.length < 2) return [];
    const seen = new Set(), starts = [], contains = [];
    for (const e of INDEX) {
      if (seen.has(e.place.n)) continue;
      if (e.key.startsWith(k)) { starts.push(e.place); seen.add(e.place.n); }
      else if (e.key.includes(k)) { contains.push(e.place); seen.add(e.place.n); }
    }
    return starts.concat(contains).slice(0, 8);
  }

  // ================= festivos =================
  function holidayFor(place, date = new Date()) {
    if (!FEST || !place) return null;
    const y = String(date.getFullYear()), md = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    const loc = FEST.local && FEST.local[place.n] && FEST.local[place.n][y];
    if (loc && loc[md]) return loc[md];
    const reg = FEST.prov && FEST.prov[place.p];
    const list = reg && FEST.years && FEST.years[y] && FEST.years[y][reg];
    return (list && list[md]) || null;
  }

  // ================= logos reales =================
  // Se piden a la App Store (icono oficial de cada app) y se guardan 30 días.
  // Plan B: el icono de su web. Plan C: la inicial.
  const LOGO_TTL = 30 * 864e5;
  const logoCache = store.get("logos") || {};
  const pending = {};
  function appleInfo(id) {
    const app = DATA.apps[id];
    const c = logoCache[id];
    if (c && Date.now() - c.t < LOGO_TTL) return Promise.resolve(c);
    if (pending[id]) return pending[id];
    let url = null;
    if (app.ios) url = `https://itunes.apple.com/lookup?id=${app.ios}&country=es`;
    else if (app.q) url = `https://itunes.apple.com/search?term=${encodeURIComponent(app.q)}&country=es&entity=software&limit=1`;
    if (!url) return Promise.resolve(null);
    pending[id] = jsonp(url).then(j => {
      const r = j && j.results && j.results[0];
      if (!r) return null;
      const info = { img: r.artworkUrl512 || r.artworkUrl100, ios: String(r.trackId), t: Date.now() };
      logoCache[id] = info; store.set("logos", logoCache);
      return info;
    }).catch(() => null);
    return pending[id];
  }
  function paintLogo(el, id) {
    const app = DATA.apps[id];
    el.textContent = app.name.replace(/[^A-Za-zÀ-ÿ]/g, "").slice(0, 1).toUpperCase();
    const setImg = (src, fav, onfail) => {
      const img = new Image();
      img.alt = "";
      img.onload = () => { el.textContent = ""; el.classList.toggle("fav", !!fav); el.appendChild(img); };
      img.onerror = onfail || (() => {});
      img.src = src;
    };
    const favicon = () => { if (app.dom) setImg(`https://icons.duckduckgo.com/ip3/${app.dom}.ico`, true); };
    appleInfo(id).then(info => { if (info && info.img) setImg(info.img, false, favicon); else favicon(); });
  }

  // ================= apps instaladas (solo APK) =================
  async function scanInstalled() {
    const A = Plugin("Apps"); if (!A || !DATA) return;
    const apps = {};
    for (const [id, app] of Object.entries(DATA.apps)) apps[id] = app.lbl || [app.name.split(" (")[0]];
    try { const r = await A.installed({ apps }); INSTALLED = (r && r.found) || {}; } catch (_) { INSTALLED = {}; }
  }

  // ================= enlaces a las apps =================
  function appLinks(id) {
    const app = DATA.apps[id];
    if (NATIVE && INSTALLED[id]) {
      const pkg = INSTALLED[id];
      return [{ t: T("openApp"), main: true, fn: () => Plugin("Apps").launch({ package: pkg }).catch(() => {}) }]
        .concat(app.web ? [{ t: T("web"), href: app.web }] : []);
    }
    if (app.webonly) return [{ t: T("openWebPay"), href: app.web, main: true }];
    const iosId = app.ios || (logoCache[id] && logoCache[id].ios);
    const play = app.android ? `https://play.google.com/store/apps/details?id=${app.android}`
      : `https://play.google.com/store/search?q=${encodeURIComponent(app.name.split(" (")[0])}&c=apps`;
    const ios = iosId ? `https://apps.apple.com/es/app/id${iosId}` : null;
    const links = [];
    if (PLATFORM === "android") links.push({ t: T("openDownload"), href: play, main: true });
    else if (PLATFORM === "ios") links.push(ios ? { t: T("openDownload"), href: ios, main: true } : { t: T("seeApp"), href: app.web, main: true });
    else { links.push({ t: "Google Play", href: play, main: true }); if (ios) links.push({ t: "App Store", href: ios }); }
    if (app.web && !(PLATFORM === "ios" && !ios)) links.push({ t: T("web"), href: app.web });
    return links;
  }

  // ================= horarios =================
  function activeSchedule(h, date) {
    const md = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    for (const v of [].concat(h.v || [])) {
      if (md >= v.desde && md <= v.hasta) return { t: v.t, u: v.u || [], verano: true };
    }
    return { t: h.t, u: h.u || [], verano: false };
  }
  function nowState(h, date = new Date()) {
    const s = activeSchedule(h, date);
    const day = ((date.getDay() + 6) % 7) + 1;
    if (s.u.includes(day)) return { cls: "unknown", txt: T("dependsToday", { d: T("dayNames")[day] }) };
    const ranges = s.t.filter(r => day >= r[0] && day <= r[1]).map(r => [toMin(r[2]), toMin(r[3]), r[2], r[3]]).sort((a, b) => a[0] - b[0]);
    if (!ranges.length) return { cls: "free", txt: T("freeToday") };
    const m = date.getHours() * 60 + date.getMinutes();
    for (const r of ranges) {
      if (m >= r[0] && m < r[1]) return { cls: "pay", txt: T("payNow", { t: showTime(r[3]) }) };
      if (m < r[0]) return { cls: "free", txt: T("freeUntil", { t: showTime(r[2]) }) };
    }
    return { cls: "free", txt: T("freeLater") };
  }
  function weekLines(s) {
    const D = T("days"), groups = new Map();
    for (const r of s.t) {
      const k = r[0] === r[1] ? D[r[0]] : `${D[r[0]]}–${D[r[1]]}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(`${clock(r[2])}–${clock(r[3])}`);
    }
    const lines = [...groups].map(([k, v]) => [k, v.join(` ${T("and")} `)]);
    for (const d of s.u) lines.push([D[d], T("byZone")]);
    const covered = d => s.t.some(r => d >= r[0] && d <= r[1]) || s.u.includes(d);
    const free = [6, 7].filter(d => !covered(d)).map(d => D[d]);
    if (free.length) lines.push([free.join(` ${T("and")} `), T("free")]);
    return lines;
  }
  function renderHours(place) {
    const box = $("#rHours");
    const fest = holidayFor(place);
    if (!place.h && !fest) { box.hidden = true; return; }
    box.innerHTML = "";
    const chip = document.createElement("span");
    if (fest) { chip.className = "now free"; chip.textContent = T("holidayToday", { n: fest }); }
    else { const st = nowState(place.h); chip.className = "now " + st.cls; chip.textContent = st.txt; }
    box.appendChild(chip);
    if (place.h) {
      const s = activeSchedule(place.h, new Date());
      const tag = document.createElement("span"); tag.className = "orient"; tag.textContent = s.verano ? T("summer") : T("orient");
      const ul = document.createElement("ul"); ul.className = "week";
      for (const [k, v] of weekLines(s)) {
        const li = document.createElement("li"); const b = document.createElement("b"); b.textContent = k;
        const sp = document.createElement("span"); sp.textContent = v; li.append(b, sp); ul.appendChild(li);
      }
      box.append(tag, ul);
      if (place.h.nota) { const p = document.createElement("p"); p.className = "note"; p.textContent = place.h.nota; box.appendChild(p); }
    }
    box.hidden = false;
  }

  // ================= zona de bajas emisiones =================
  const LABELS = ["0", "ECO", "C", "B", "SIN"];
  function renderZbe(place) {
    const box = $("#rZbe");
    if (!place || !place.zbe) { box.hidden = true; return; }
    const z = place.zbe, mine = store.get("etiqueta");
    box.innerHTML = "";
    const head = document.createElement("div"); head.className = "zbe-head";
    const h = document.createElement("h4"); h.textContent = T("zbeTitle");
    const st = document.createElement("span"); st.className = "zbe-state " + z.e; st.textContent = T("zbe_" + z.e);
    head.append(h, st);
    const lab = document.createElement("div"); lab.className = "zbe-labels";
    const lt = document.createElement("span"); lt.textContent = T("myLabel"); lab.appendChild(lt);
    for (const l of LABELS) {
      const b = document.createElement("button"); b.className = "dgt dgt-" + l.toLowerCase() + (mine === l ? " on" : "");
      b.textContent = l === "SIN" ? T("noLabel") : l;
      b.onclick = () => { store.set("etiqueta", mine === l ? null : l); renderZbe(place); };
      lab.appendChild(b);
    }
    const v = document.createElement("p"); v.className = "zbe-verdict";
    let cls = "neutral", txt;
    if (z.e === "activa") {
      if (!mine) txt = T("zbePick");
      else if (["0", "ECO", "C"].includes(mine)) { cls = "ok"; txt = T("zbeOk", { l: mine }); }
      else if (mine === "B") { cls = "warn"; txt = T("zbeB"); }
      else { cls = "bad"; txt = T("zbeNo"); }
    } else if (z.e === "avisos") {
      if (!mine) txt = T("zbePick");
      else if (mine === "SIN") { cls = "warn"; txt = T("zbeNoWarn"); }
      else { cls = "ok"; txt = T("zbeOk", { l: mine }); }
    } else txt = T("zbeLater");
    v.classList.add(cls); v.textContent = txt;
    box.append(head, lab, v);
    if (z.n) { const p = document.createElement("p"); p.className = "note"; p.textContent = z.n; box.appendChild(p); }
    const a = document.createElement("a"); a.className = "zbe-more"; a.target = "_blank"; a.rel = "noopener";
    a.href = `https://www.google.com/search?q=${encodeURIComponent("ZBE " + place.n)}`; a.textContent = T("zbeMore");
    box.appendChild(a);
    box.hidden = false;
  }

  // ================= mapa =================
  const carIcon = () => L.divIcon({ className: "", html: '<div class="car-pin">🚗</div>', iconSize: [34, 34], iconAnchor: [17, 17] });
  function showMap(lat, lon, zoom, accuracy, mine) {
    const el = $("#map");
    if (!window.L) { el.hidden = true; return; }
    el.hidden = false;
    if (!map) {
      map = L.map(el, { zoomControl: false, attributionControl: true, dragging: true, scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
      map.attributionControl.setPrefix(false);
    }
    map.eachLayer(l => { if (!(l instanceof L.TileLayer)) map.removeLayer(l); });
    map.setView([lat, lon], zoom);
    if (mine) {
      if (accuracy && accuracy < 1500) L.circle([lat, lon], { radius: accuracy, color: "#1A63E0", weight: 1, fillOpacity: .12 }).addTo(map);
      L.marker([lat, lon], { icon: L.divIcon({ className: "", html: '<div class="me-dot"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(map);
    }
    const car = store.get("coche");
    if (car) {
      L.marker([car.lat, car.lon], { icon: carIcon() }).addTo(map);
      if (mine) {
        const d = distance({ lat, lon }, car);
        if (d > 30 && d < 5000) map.fitBounds([[lat, lon], [car.lat, car.lon]], { padding: [40, 40], maxZoom: 17 });
      }
    }
    setTimeout(() => map.invalidateSize(), 60);
  }
  async function mapForPlace(place) {
    const key = "geo:" + place.n;
    let c = store.get(key);
    if (!c) {
      try {
        const q = encodeURIComponent(`${place.n}, ${place.p || ""}, España`);
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=es&q=${q}`);
        const j = await r.json();
        if (j[0]) { c = [+j[0].lat, +j[0].lon]; store.set(key, c); }
      } catch (_) {}
    }
    if (c) showMap(c[0], c[1], 13, null, false); else $("#map").hidden = true;
  }

  // ================= resultado =================
  function render(place, detectedName, coords, quiet) {
    lastView = { place, name: detectedName, coords };
    $("#result").hidden = false; if (!quiet) status(null);
    const apps = $("#rApps"); apps.innerHTML = "";
    if (coords && !quiet) showMap(coords.lat, coords.lon, 16, coords.acc, true);

    if (!place) {
      lastPlace = { n: detectedName || "", missing: true };
      $("#rLabel").textContent = T("youAreIn");
      $("#rName").textContent = detectedName || T("unknownPlace");
      $("#rProv").textContent = "";
      $("#btnFav").hidden = true;
      $("#rHours").hidden = true; $("#rZbe").hidden = true; $("#rEmpty").hidden = false; $("#rLegend").hidden = true;
      if (!coords) $("#map").hidden = true;
      return;
    }
    lastPlace = place; store.set("ultimo", place.n);
    if (!quiet) { addRecent(place.n); if (!coords) mapForPlace(place); }
    $("#rLabel").textContent = T("appsIn");
    $("#rName").textContent = place.n;
    $("#rProv").textContent = place.p ? T("province", { p: place.p }) : "";
    $("#rEmpty").hidden = true; $("#rLegend").hidden = false;
    paintFav();
    renderHours(place);
    renderZbe(place);

    for (const entry of place.a) {
      const app = DATA.apps[entry.id]; if (!app) continue;
      const li = document.createElement("li"); li.className = "app";
      li.innerHTML = `<div class="logo"></div><div class="app-info"><span class="app-name"></span><span class="app-by"></span></div><span class="badge"></span><div class="app-actions"></div>`;
      li.querySelector(".app-name").textContent = app.name;
      li.querySelector(".app-by").textContent = app.by || "";
      const b = li.querySelector(".badge");
      if (NATIVE && INSTALLED[entry.id]) { b.classList.add("installed"); b.textContent = T("installedTag"); }
      else { b.classList.add(entry.c); b.textContent = entry.c === "reciente" ? T("confirmed") : T("toConfirm"); }
      paintLogo(li.querySelector(".logo"), entry.id);
      const act = li.querySelector(".app-actions");
      const fill = () => {
        act.innerHTML = "";
        for (const l of appLinks(entry.id)) {
          let el;
          if (l.fn) { el = document.createElement("button"); el.type = "button"; el.onclick = l.fn; }
          else { el = document.createElement("a"); el.href = l.href; el.target = "_blank"; el.rel = "noopener"; }
          el.textContent = l.t; if (l.main) el.className = "main"; act.appendChild(el);
        }
      };
      fill(); appleInfo(entry.id).then(fill); // si la App Store nos da el id, el enlace va directo a la app
      apps.appendChild(li);
    }
    if (!quiet) $("#result").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ================= recientes y favoritas =================
  const getFavs = () => store.get("favoritas") || [];
  function addRecent(n) {
    const r = (store.get("recientes") || []).filter(x => x !== n);
    r.unshift(n); store.set("recientes", r.slice(0, 6)); renderQuick();
  }
  function paintFav() {
    const btn = $("#btnFav"); if (!lastPlace || lastPlace.missing) { btn.hidden = true; return; }
    const on = getFavs().includes(lastPlace.n);
    btn.hidden = false; btn.classList.toggle("on", on); btn.setAttribute("aria-pressed", on);
    btn.setAttribute("aria-label", on ? T("unfav") : T("fav")); btn.title = btn.getAttribute("aria-label");
  }
  function renderQuick() {
    const box = $("#quick"); if (!DATA) return;
    const favs = getFavs().filter(n => findExact(n));
    const rec = (store.get("recientes") || []).filter(n => !favs.includes(n) && findExact(n));
    box.innerHTML = "";
    const chip = (n, fav) => {
      const b = document.createElement("button"); b.className = "qchip" + (fav ? " qfav" : "");
      b.textContent = (fav ? "★ " : "") + n;
      b.onclick = () => { const p = findExact(n); if (p) { $("#q").value = ""; render(p); } };
      return b;
    };
    favs.slice(0, 8).forEach(n => box.appendChild(chip(n, true)));
    rec.slice(0, Math.max(0, 8 - favs.length)).forEach(n => box.appendChild(chip(n, false)));
    box.hidden = !box.children.length;
  }

  // ================= dónde está mi coche =================
  const mapsUrl = c => `https://www.google.com/maps/dir/?api=1&travelmode=walking&destination=${c.lat},${c.lon}`;
  function ago(t) {
    const m = Math.round((Date.now() - t) / 60000);
    if (m < 1) return T("agoNow");
    if (m < 60) return T("agoMin", { n: m });
    if (m < 48 * 60) return T("agoH", { n: Math.round(m / 60) });
    return T("agoDays", { n: Math.round(m / 1440) });
  }
  function saveCar(coords, placeName) {
    const old = store.get("coche");
    const car = { lat: coords.lat, lon: coords.lon, acc: coords.acc || null, t: Date.now(), place: placeName || (lastPlace && !lastPlace.missing ? lastPlace.n : "") };
    // Si es el mismo sitio, conservamos la foto y la nota
    if (old && distance(old, car) < 60) { car.note = old.note; car.photo = old.photo; }
    store.set("coche", car);
    renderCar(); refreshLiveTicket();
    if (map && lastView && lastView.coords) showMap(lastView.coords.lat, lastView.coords.lon, 16, lastView.coords.acc, true);
    return car;
  }
  function renderCar() {
    const box = $("#car"), car = store.get("coche");
    $("#btnSaveCar").hidden = !!car;
    if (!car) { box.hidden = true; return; }
    box.hidden = false;
    const bits = [T("carSaved", { a: ago(car.t) })];
    if (car.place) bits.push(T("carIn", { p: car.place }));
    if (lastCoords && Date.now() - lastCoords.t < 10 * 60000) {
      const d = distance(lastCoords, car);
      if (d > 30) bits.push(T("carAway", { d: fmtDist(d) }));
    }
    $("#carMeta").textContent = bits.join(" · ");
    $("#carNote").hidden = !car.note; $("#carNote").textContent = car.note || "";
    $("#carThumb").hidden = !car.photo; if (car.photo) $("#carThumb").src = car.photo;
    $("#btnBackCar").href = mapsUrl(car);
    const far = lastCoords && Date.now() - lastCoords.t < 10 * 60000 && distance(lastCoords, car) > 150;
    $("#carHere").hidden = !far;
  }
  function getPosition() {
    return new Promise((resolve, reject) => {
      if (!("geolocation" in navigator)) return reject(new Error("nogeo"));
      navigator.geolocation.getCurrentPosition(
        p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy, t: Date.now() }),
        reject, { enableHighAccuracy: true, timeout: 15000, maximumAge: 15000 });
    });
  }
  async function saveCarNow() {
    status(T("carLocating"));
    try {
      const c = await getPosition(); lastCoords = c;
      status(null); saveCar(c); toast(T("carSavedToast"));
      $("#car").scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (e) { status(e && e.code === 1 ? T("noPerm") : T("noPos")); }
  }
  function resizePhoto(file, max = 900) {
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url); resolve(c.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = reject; img.src = url;
    });
  }
  function setupCar() {
    $("#btnSaveCar").onclick = saveCarNow;
    $("#btnCarHere").onclick = () => { if (lastCoords) { saveCar(lastCoords); toast(T("carSavedToast")); } };
    $("#btnCarForget").onclick = () => { store.del("coche"); renderCar(); refreshLiveTicket(); if (lastView && lastView.coords) showMap(lastView.coords.lat, lastView.coords.lon, 16, lastView.coords.acc, true); };
    $("#btnCarNote").onclick = () => {
      const ed = $("#carNoteEdit"); ed.hidden = !ed.hidden;
      if (!ed.hidden) { $("#carNoteInput").value = (store.get("coche") || {}).note || ""; $("#carNoteInput").focus(); }
    };
    const saveNote = () => {
      const car = store.get("coche"); if (!car) return;
      car.note = $("#carNoteInput").value.trim(); store.set("coche", car); $("#carNoteEdit").hidden = true; renderCar();
    };
    $("#btnCarNoteSave").onclick = saveNote;
    $("#carNoteInput").addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); saveNote(); } });
    $("#btnCarPhoto").onclick = () => $("#carPhotoInput").click();
    $("#carPhotoInput").onchange = async e => {
      const f = e.target.files && e.target.files[0]; e.target.value = "";
      const car = store.get("coche"); if (!f || !car) return;
      try {
        let data = await resizePhoto(f, 900);
        car.photo = data;
        if (!store.set("coche", car)) { car.photo = await resizePhoto(f, 600); store.set("coche", car); }
        renderCar();
      } catch (_) {}
    };
    $("#carThumb").onclick = () => { const car = store.get("coche"); if (car && car.photo) { $("#photoBig").src = car.photo; $("#photoView").showModal(); } };
    $("#photoView").onclick = () => $("#photoView").close();
    setInterval(() => { if (!document.hidden) renderCar(); }, 60000);
  }

  // ================= localización =================
  async function reverseGeocode(lat, lon) {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&accept-language=es&lat=${lat}&lon=${lon}`);
    if (!r.ok) throw new Error("geo");
    const a = (await r.json()).address || {};
    return { candidates: [a.city, a.town, a.village, a.municipality, a.city_district, a.county].filter(Boolean), country: a.country_code };
  }
  function locate(userAsked) {
    if (!("geolocation" in navigator)) { status(T("noGeo")); return; }
    const btn = $("#btnLocate"); btn.disabled = true; btn.classList.add("busy");
    status(T("searching"));
    const end = () => { btn.disabled = false; btn.classList.remove("busy"); };
    navigator.geolocation.getCurrentPosition(async pos => {
      const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy, t: Date.now() };
      lastCoords = coords;
      try {
        const { candidates, country } = await reverseGeocode(coords.lat, coords.lon);
        if (country && country !== "es") { render(null, candidates[0] || T("outSpain"), coords); status(T("onlySpain")); return; }
        let place = null;
        for (const c of candidates) { place = findExact(c); if (place) break; }
        render(place, candidates[0], coords);
        // Coche: si lo ha pedido él y no hay coche guardado reciente, lo guardamos aquí
        const car = store.get("coche");
        if (userAsked && (!car || Date.now() - car.t > 12 * 3600e3)) {
          saveCar(coords, place ? place.n : candidates[0]); toast(T("carSavedToast"));
        } else renderCar();
      } catch (_) { status(T("noPlace")); renderCar(); }
      finally { end(); }
    }, err => {
      end();
      status(err.code === 1 ? T("noPerm") : T("noPos"));
    }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 });
  }

  // ================= buscador =================
  function setupSearch() {
    const q = $("#q"), list = $("#suggest");
    let items = [], sel = -1;
    const close = () => { list.hidden = true; sel = -1; };
    const choose = p => { q.value = p.n; close(); q.blur(); render(p); };
    const paint = () => {
      list.innerHTML = "";
      if (!items.length) {
        if (norm(q.value).length >= 2) {
          const li = document.createElement("li");
          const a = document.createElement("span"); a.textContent = T("notYet");
          const b = document.createElement("small"); b.textContent = T("addIt");
          li.append(a, b);
          li.onmousedown = e => { e.preventDefault(); close(); q.blur(); render(null, q.value.trim()); };
          list.appendChild(li); list.hidden = false;
        } else close();
        return;
      }
      items.forEach((p, i) => {
        const li = document.createElement("li"); li.setAttribute("role", "option"); li.setAttribute("aria-selected", i === sel);
        const s = document.createElement("span"); s.textContent = p.n;
        const sm = document.createElement("small"); sm.textContent = p.p || "";
        li.append(s, sm); li.onmousedown = e => { e.preventDefault(); choose(p); };
        list.appendChild(li);
      });
      list.hidden = false;
    };
    q.addEventListener("input", () => { items = searchPlaces(q.value); sel = -1; paint(); });
    q.addEventListener("keydown", e => {
      if (e.key === "Enter") {
        const p = items[sel >= 0 ? sel : 0];
        if (p) choose(p); else if (norm(q.value).length >= 2) { close(); q.blur(); render(null, q.value.trim()); }
        e.preventDefault(); return;
      }
      if (list.hidden) return;
      if (e.key === "ArrowDown") { sel = Math.min(sel + 1, items.length - 1); paint(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { sel = Math.max(sel - 1, 0); paint(); e.preventDefault(); }
      else if (e.key === "Escape") close();
    });
    q.addEventListener("blur", () => setTimeout(close, 150));
  }

  // ================= aviso de fin de tiempo =================
  let ticketTimer = null;
  function setupTimer() {
    let minutes = 0;
    const chips = $$("#chips button");
    const custom = $("#customMin"), start = $("#btnStart");
    const select = m => {
      minutes = m; chips.forEach(c => c.classList.toggle("on", +c.dataset.min === m && !custom.value));
      custom.parentElement.classList.toggle("on", !!custom.value); start.disabled = !(minutes >= 5);
    };
    chips.forEach(c => c.onclick = () => { custom.value = ""; select(+c.dataset.min); });
    custom.oninput = () => select(+custom.value || 0);
    start.onclick = async () => {
      if (!(minutes >= 5)) return;
      if (NATIVE) await nativeNotifyReady();
      else if ("Notification" in window && Notification.permission === "default") { try { await Notification.requestPermission(); } catch (_) {} }
      const now = Date.now();
      store.set("ticket", { place: (lastPlace && lastPlace.n) || "Zona azul", start: now, end: now + minutes * 60000, before: +$("#before").value, notified: false });
      custom.value = ""; select(0); runTicket(); scheduleNative(); refreshLiveTicket();
      window.scrollTo({ top: 0, behavior: "smooth" });
      // Al empezar un ticket, guardamos dónde está el coche si no lo teníamos
      const car = store.get("coche");
      const stale = !car || Date.now() - car.t > 3 * 3600e3 || (lastCoords && distance(lastCoords, car) > 150);
      if (stale) {
        if (lastCoords && Date.now() - lastCoords.t < 10 * 60000) { saveCar(lastCoords); toast(T("carSavedToast")); }
        else getPosition().then(c => { lastCoords = c; saveCar(c); toast(T("carSavedToast")); }).catch(() => {});
      }
    };
    $$("#ticketBar [data-add]").forEach(b => b.onclick = () => {
      const t = store.get("ticket"); if (!t) return;
      const base = Math.max(t.end, Date.now()); t.end = base + (+b.dataset.add) * 60000; t.notified = false; store.set("ticket", t);
      runTicket(); scheduleNative(); refreshLiveTicket();
    });
    $("#tbStop").onclick = () => { store.del("ticket"); runTicket(); scheduleNative(); refreshLiveTicket(); };
    document.addEventListener("visibilitychange", () => { if (!document.hidden) runTicket(); });
    runTicket();
  }
  // --- Avisos programados en el sistema (solo APK): suenan aunque la app esté cerrada ---
  async function nativeNotifyReady() {
    const LN = Plugin("LocalNotifications"); if (!LN) return false;
    try {
      let p = await LN.checkPermissions();
      if (p.display !== "granted") p = await LN.requestPermissions();
      try { await LN.createChannel({ id: "ticket", name: T("nChannel"), importance: 5, visibility: 1, vibration: true }); } catch (_) {}
      try { await LN.registerActionTypes({ types: [{ id: "ticket", actions: [{ id: "coche", title: T("backToCar") }] }] }); } catch (_) {}
      return p.display === "granted";
    } catch (_) { return false; }
  }
  async function scheduleNative() {
    const LN = Plugin("LocalNotifications"); if (!LN) return;
    try { await LN.cancel({ notifications: [{ id: 101 }, { id: 102 }] }); } catch (_) {}
    const t = store.get("ticket"); if (!t) return;
    const now = Date.now(), list = [];
    const warnAt = t.end - t.before * 60000;
    const body = T("nBody", { p: t.place, t: hhmm(new Date(t.end)) });
    const common = { channelId: "ticket", actionTypeId: "ticket" };
    if (warnAt > now + 5000) list.push({ id: 101, title: T("nLeftTitle", { n: t.before }), body, ...common, schedule: { at: new Date(warnAt), allowWhileIdle: true } });
    if (t.end > now + 5000) list.push({ id: 102, title: T("nOverTitle"), body: T("nOverBody", { p: t.place }), ...common, schedule: { at: new Date(t.end), allowWhileIdle: true } });
    if (list.length) { try { await LN.schedule({ notifications: list }); } catch (_) {} }
  }
  // --- Notificación fija con la cuenta atrás (solo APK) ---
  async function refreshLiveTicket() {
    const TK = Plugin("Ticket"); if (!TK) return;
    const t = store.get("ticket"), car = store.get("coche");
    try {
      if (!t || t.end < Date.now()) { await TK.hide(); return; }
      await TK.show({
        title: T("nLiveTitle", { p: t.place }), text: T("nLiveText", { t: hhmm(new Date(t.end)) }), end: t.end,
        channel: T("nLiveChannel"), carLabel: T("backToCar"),
        ...(car ? { lat: car.lat, lon: car.lon } : {})
      });
    } catch (_) {}
  }
  async function notify(t) {
    const left = Math.max(0, Math.round((t.end - Date.now()) / 60000));
    const title = left > 0 ? T("nLeftTitle", { n: left }) : T("nOverTitle");
    const body = T("nBody", { p: t.place, t: hhmm(new Date(t.end)) });
    try { navigator.vibrate && navigator.vibrate([300, 150, 300, 150, 600]); } catch (_) {}
    if (NATIVE) return; // en la APK ya lo avisa el sistema
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) reg.showNotification(title, { body, tag: "avz-ticket", renotify: true, requireInteraction: true, icon: "icons/icon-192.png", badge: "icons/favicon.png", vibrate: [300, 150, 300] });
      else new Notification(title, { body, icon: "icons/icon-192.png" });
    } catch (_) {}
  }
  function runTicket() {
    clearInterval(ticketTimer);
    const bar = $("#ticketBar"), t = store.get("ticket");
    if (!t) { bar.hidden = true; return; }
    bar.hidden = false;
    $("#tbPlace").textContent = t.place;
    const tick = () => {
      const cur = store.get("ticket"); if (!cur) { bar.hidden = true; clearInterval(ticketTimer); return; }
      const ms = cur.end - Date.now(), abs = Math.abs(ms);
      const h = Math.floor(abs / 3600000), m = Math.floor(abs / 60000) % 60, s = Math.floor(abs / 1000) % 60;
      $("#tbTime").textContent = (ms < 0 ? "−" : "") + (h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`);
      $("#tbFill").style.width = Math.max(0, Math.min(100, ms / (cur.end - cur.start) * 100)) + "%";
      bar.classList.toggle("warn", ms > 0 && ms <= cur.before * 60000);
      bar.classList.toggle("over", ms <= 0);
      $("#tbEnd").textContent = ms <= 0 ? T("expiredAt", { t: hhmm(new Date(cur.end)) }) : T("endsAt", { t: hhmm(new Date(cur.end)), n: cur.before });
      if (!cur.notified && ms <= cur.before * 60000) { cur.notified = true; store.set("ticket", cur); notify(cur); }
    };
    tick(); ticketTimer = setInterval(tick, 1000);
  }

  // ================= formulario de avisos =================
  function formTarget() {
    // En config.js va el enlace "rellenado previamente" de Google Forms con las palabras
    // MUNICIPIO, ESTADO, APP y COMENTARIO en cada pregunta. De ahí sacamos los campos.
    if (!CFG.formulario) return null;
    try {
      const u = new URL(CFG.formulario), f = {};
      for (const [k, v] of u.searchParams) if (k.startsWith("entry.")) f[v.trim().toUpperCase()] = k;
      if (!f.MUNICIPIO || !f.APP) return null;
      return { action: u.origin + u.pathname.replace(/\/viewform.*$/, "/formResponse"), f };
    } catch (_) { return null; }
  }
  function setupReport() {
    const dlg = $("#sheet"), sel = $("#fApp");
    const fillApps = (preferred) => {
      sel.innerHTML = "";
      const add = (v, t, extra) => { const o = document.createElement("option"); o.value = v; o.textContent = t; if (extra) Object.assign(o, extra); sel.appendChild(o); };
      add("", T("fChoose"), { disabled: true, selected: true });
      const ids = Object.keys(DATA.apps).sort((a, b) => DATA.apps[a].name.localeCompare(DATA.apps[b].name, "es"));
      const group = (label, list) => {
        if (!list.length) return;
        const g = document.createElement("optgroup"); g.label = label;
        list.forEach(id => { const o = document.createElement("option"); o.value = DATA.apps[id].name; o.textContent = DATA.apps[id].name; g.appendChild(o); });
        sel.appendChild(g);
      };
      group(T("fHere"), ids.filter(id => preferred.includes(id)));
      group(preferred.length ? T("fOthers") : T("fKnown"), ids.filter(id => !preferred.includes(id)));
      add("__otra", T("fOther"));
    };
    sel.onchange = () => { $("#fOtherWrap").hidden = sel.value !== "__otra"; $("#fOther").required = sel.value === "__otra"; };
    window.openReport = (muni) => {
      const place = lastPlace && !lastPlace.missing ? lastPlace : null;
      fillApps(place ? place.a.map(a => a.id) : []);
      $("#fMuni").value = muni || (lastPlace && lastPlace.n) || "";
      $("#fOther").value = ""; $("#fNote").value = ""; $("#fOtherWrap").hidden = true;
      $("#fOk").hidden = true; $("#fSend").hidden = false;
      document.querySelector('input[name="estado"][value="Funciona"]').checked = true;
      dlg.showModal();
    };
    $("#sheetClose").onclick = () => dlg.close();
    dlg.addEventListener("click", e => { if (e.target === dlg) dlg.close(); });
    $("#reportForm").addEventListener("submit", async e => {
      e.preventDefault();
      const muni = $("#fMuni").value.trim();
      const app = sel.value === "__otra" ? $("#fOther").value.trim() : sel.value;
      const estado = document.querySelector('input[name="estado"]:checked').value;
      const nota = $("#fNote").value.trim();
      if (!muni || !app) return;
      const tgt = formTarget();
      if (tgt) {
        const body = new URLSearchParams();
        body.set(tgt.f.MUNICIPIO, muni); body.set(tgt.f.APP, app);
        if (tgt.f.ESTADO) body.set(tgt.f.ESTADO, estado);
        if (tgt.f.COMENTARIO) body.set(tgt.f.COMENTARIO, nota);
        try { await fetch(tgt.action, { method: "POST", mode: "no-cors", body }); } catch (_) {}
        $("#fSend").hidden = true; $("#fOk").hidden = false;
        setTimeout(() => dlg.close(), 1800);
      } else {
        const title = `${estado === "Funciona" ? "Añadir" : "Quitar"}: ${app} en ${muni}`;
        const text = `Municipio: ${muni}\nApp: ${app}\nQué pasa: ${estado}\nComentario: ${nota}\n`;
        openExternal(`https://github.com/${CFG.repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`);
        dlg.close();
      }
    });
  }

  // ================= instalación =================
  function setupInstall() {
    let deferred = null;
    window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; $("#install").hidden = false; });
    $("#btnInstall").onclick = async () => { if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; $("#install").hidden = true; } };
    const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    if (NATIVE) return;
    // En Android desde el navegador: ofrecer la app de verdad (APK)
    if (PLATFORM === "android") {
      const a = $("#apkLink");
      a.href = `https://github.com/${CFG.repo}/releases/latest/download/AVZonazul.apk`;
      a.hidden = false;
    }
    if (PLATFORM === "ios" && !standalone) {
      $("#install").hidden = false;
      $("#installText").dataset.i18n = "iosInstall"; $("#installText").textContent = T("iosInstall");
      $("#btnInstall").hidden = true;
    }
  }

  // ================= arranque =================
  async function init() {
    applyI18n();
    $$(".langs button").forEach(b => b.onclick = () => setLang(b.dataset.lang));
    $("#btnLocate").onclick = () => locate(true);
    $("#btnReport").onclick = () => window.openReport();
    $("#btnAddHere").onclick = () => window.openReport(lastPlace && lastPlace.n);
    $("#btnFav").onclick = () => {
      if (!lastPlace || lastPlace.missing) return;
      const f = getFavs(), i = f.indexOf(lastPlace.n);
      if (i >= 0) f.splice(i, 1); else f.unshift(lastPlace.n);
      store.set("favoritas", f); paintFav(); renderQuick();
    };
    setupSearch(); setupInstall(); setupCar();
    try { await loadData(); } catch (_) { status(T("noData")); return; }
    applyI18n(); renderQuick(); renderCar();
    setupReport(); setupTimer();
    if (NATIVE) {
      await scanInstalled();
      document.addEventListener("visibilitychange", async () => {
        if (document.hidden) return;
        await scanInstalled(); if (lastView) render(lastView.place, lastView.name, lastView.coords, true);
      });
      refreshLiveTicket();
      const LN = Plugin("LocalNotifications");
      if (LN) {
        try { await LN.registerActionTypes({ types: [{ id: "ticket", actions: [{ id: "coche", title: T("backToCar") }] }] }); } catch (_) {}
        try {
          LN.addListener("localNotificationActionPerformed", ev => {
            const car = store.get("coche");
            if (ev && ev.actionId === "coche" && car) openExternal(mapsUrl(car));
            else if (car) $("#car").scrollIntoView({ behavior: "smooth", block: "center" });
          });
        } catch (_) {}
      }
    }
    try {
      if (navigator.permissions) {
        const p = await navigator.permissions.query({ name: "geolocation" });
        if (p.state === "granted") { locate(false); return; }
      }
    } catch (_) {}
    const prev = store.get("ultimo");
    if (prev) { const p = findExact(prev); if (p) render(p); }
  }

  // ================= versión y actualizaciones =================
  $("#ver").textContent = "v" + (window.AVZ_VERSION || "?");

  // --- APK: busca versión nueva en GitHub (Releases), la descarga y abre el instalador ---
  const newer = (a, b) => {
    const x = String(a).replace(/^v/, "").split(".").map(Number), y = String(b).replace(/^v/, "").split(".").map(Number);
    for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); }
    return false;
  };
  async function checkApkUpdate(force) {
    const last = store.get("updCheck") || 0;
    if (!force && Date.now() - last < 3 * 3600e3) return;
    store.set("updCheck", Date.now());
    try {
      const r = await fetch(`https://api.github.com/repos/${CFG.repo}/releases/latest`, { headers: { Accept: "application/vnd.github+json" }, cache: "no-cache" });
      if (!r.ok) return;
      const rel = await r.json();
      const asset = (rel.assets || []).find(a => /\.apk$/i.test(a.name));
      if (!asset || !newer(rel.tag_name, window.AVZ_VERSION)) return;
      const ver = String(rel.tag_name).replace(/^v/, "");
      $("#updText").textContent = T("updNew", { v: ver });
      $("#updBar").hidden = false;
      const btn = $("#btnUpd");
      btn.textContent = T("update"); btn.disabled = false;
      btn.onclick = async () => {
        const U = Plugin("Updater");
        if (!U) { openExternal(asset.browser_download_url); return; }
        try {
          const ok = await U.canInstall();
          if (!ok.allowed) { $("#updText").textContent = T("updPerm"); await U.openInstallSettings(); return; }
          btn.disabled = true; btn.textContent = T("downloading");
          const h = await U.addListener("progress", p => { btn.textContent = T("downloadingP", { p: p.percent }); });
          await U.downloadAndInstall({ url: asset.browser_download_url });
          try { h.remove(); } catch (_) {}
          btn.disabled = false; btn.textContent = T("installBtn");
        } catch (e) {
          btn.disabled = false; btn.textContent = T("retry");
          $("#updText").textContent = T("updFail");
        }
      };
    } catch (_) {}
  }
  if (NATIVE) {
    window.addEventListener("load", () => checkApkUpdate(true));
    document.addEventListener("visibilitychange", () => { if (!document.hidden) checkApkUpdate(false); });
  } else if ("serviceWorker" in navigator) {
    window.addEventListener("load", async () => {
      let reg;
      try { reg = await navigator.serviceWorker.register("sw.js"); } catch (_) { return; }
      const offer = w => {
        if (!w || !navigator.serviceWorker.controller) return; // primera instalación: nada que avisar
        $("#updBar").hidden = false;
        $("#btnUpd").onclick = () => { $("#btnUpd").textContent = T("updating"); w.postMessage("actualizar"); };
      };
      if (reg.waiting) offer(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w && w.addEventListener("statechange", () => { if (w.state === "installed") offer(w); });
      });
      document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
    });
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloading) { reloading = true; location.reload(); } });
  }
  init();
})();
