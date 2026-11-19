(() => {
  "use strict";
  const CFG = window.AVZONAZUL_CONFIG || {};
  const $ = s => document.querySelector(s);
  const ua = navigator.userAgent;
  const PLATFORM = /android/i.test(ua) ? "android"
    : (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) ? "ios" : "otro";

  let DATA = null, INDEX = [], lastPlace = null, map = null;

  // ¿Estamos dentro de la app Android (APK) o en el navegador?
  const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const Plugin = name => (NATIVE && window.Capacitor.Plugins && window.Capacitor.Plugins[name]) || null;
  const DATA_URL = CFG.datos || `https://${(CFG.repo || "").split("/")[0]}.github.io/${(CFG.repo || "").split("/")[1]}/data.json`;
  // Abrir enlaces de fuera (tiendas, webs) en el navegador o la app que toque
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

  // ================= utilidades =================
  const norm = s => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[’'`´]/g, " ").replace(/[\/\-–,().]/g, " ").replace(/\s+/g, " ").trim();
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} },
    del(k) { try { localStorage.removeItem(k); } catch (_) {} }
  };
  const pad = n => String(n).padStart(2, "0");
  const hhmm = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const toMin = s => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
  const showTime = s => s.replace(/^0/, "").replace(/:00$/, " h");
  const clock = s => s.replace(/^0/, "");
  function status(msg) { const el = $("#status"); el.hidden = !msg; if (msg) el.textContent = msg; }

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

  // ================= datos =================
  async function loadData() {
    if (NATIVE) {
      // En la APK: datos frescos de la web; si no hay red, la última copia o los que vienen dentro
      try {
        const r = await fetch(DATA_URL, { cache: "no-cache" });
        if (!r.ok) throw 0;
        DATA = await r.json(); store.set("datos", DATA);
      } catch (_) {
        DATA = store.get("datos") || await (await fetch("data.json")).json();
      }
    } else {
      const r = await fetch("data.json", { cache: "no-cache" });
      DATA = await r.json();
    }
    INDEX = [];
    for (const p of DATA.places) {
      INDEX.push({ key: norm(p.n), place: p });
      for (const a of (p.al || [])) INDEX.push({ key: norm(a), place: p });
    }
    $("#count").textContent = `${DATA.places.length} municipios`;
    $("#updated").textContent = new Date(DATA.updated).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
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

  // ================= enlaces a las apps =================
  function appLinks(id) {
    const app = DATA.apps[id];
    if (app.webonly) return [{ t: "Abrir la web de pago", href: app.web, main: true }];
    const iosId = app.ios || (logoCache[id] && logoCache[id].ios);
    const play = app.android ? `https://play.google.com/store/apps/details?id=${app.android}`
      : `https://play.google.com/store/search?q=${encodeURIComponent(app.name.split(" (")[0])}&c=apps`;
    const ios = iosId ? `https://apps.apple.com/es/app/id${iosId}` : null;
    const links = [];
    if (PLATFORM === "android") links.push({ t: "Abrir / descargar", href: play, main: true });
    else if (PLATFORM === "ios") links.push(ios ? { t: "Abrir / descargar", href: ios, main: true } : { t: "Ver la app", href: app.web, main: true });
    else { links.push({ t: "Google Play", href: play, main: true }); if (ios) links.push({ t: "App Store", href: ios }); }
    if (app.web && !(PLATFORM === "ios" && !ios)) links.push({ t: "Web", href: app.web });
    return links;
  }

  // ================= horarios =================
  const DAYS = ["", "L", "M", "X", "J", "V", "S", "D"];
  const DAY_NAMES = ["", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
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
    if (s.u.includes(day)) return { cls: "unknown", txt: `Hoy ${DAY_NAMES[day]}: depende de la zona, mira el cartel` };
    const ranges = s.t.filter(r => day >= r[0] && day <= r[1]).map(r => [toMin(r[2]), toMin(r[3]), r[2], r[3]]).sort((a, b) => a[0] - b[0]);
    if (!ranges.length) return { cls: "free", txt: "Hoy no se paga" };
    const m = date.getHours() * 60 + date.getMinutes();
    for (const r of ranges) {
      if (m >= r[0] && m < r[1]) return { cls: "pay", txt: `Ahora se paga · hasta las ${showTime(r[3])}` };
      if (m < r[0]) return { cls: "free", txt: `Ahora es gratis · se paga desde las ${showTime(r[2])}` };
    }
    return { cls: "free", txt: "Hoy ya no se paga" };
  }
  function weekLines(s) {
    const groups = new Map();
    for (const r of s.t) {
      const k = r[0] === r[1] ? DAYS[r[0]] : `${DAYS[r[0]]}–${DAYS[r[1]]}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(`${clock(r[2])}–${clock(r[3])}`);
    }
    const lines = [...groups].map(([k, v]) => [k, v.join(" y ")]);
    for (const d of s.u) lines.push([DAYS[d], "según la zona"]);
    const covered = d => s.t.some(r => d >= r[0] && d <= r[1]) || s.u.includes(d);
    const free = [6, 7].filter(d => !covered(d)).map(d => DAYS[d]);
    if (free.length) lines.push([free.join(" y "), "gratis"]);
    return lines;
  }
  function renderHours(place) {
    const box = $("#rHours");
    if (!place.h) { box.hidden = true; return; }
    const h = place.h, s = activeSchedule(h, new Date()), st = nowState(h);
    box.innerHTML = "";
    const chip = document.createElement("span"); chip.className = "now " + st.cls; chip.textContent = st.txt;
    const tag = document.createElement("span"); tag.className = "orient"; tag.textContent = s.verano ? "horario de verano" : "orientativo";
    const ul = document.createElement("ul"); ul.className = "week";
    for (const [k, v] of weekLines(s)) {
      const li = document.createElement("li"); const b = document.createElement("b"); b.textContent = k;
      const sp = document.createElement("span"); sp.textContent = v; li.append(b, sp); ul.appendChild(li);
    }
    box.append(chip, tag, ul);
    if (h.nota) { const p = document.createElement("p"); p.className = "note"; p.textContent = h.nota; box.appendChild(p); }
    box.hidden = false;
  }

  // ================= mapa =================
  function showMap(lat, lon, zoom, accuracy, mine) {
    const el = $("#map");
    if (!window.L) { el.hidden = true; return; }
    el.hidden = false;
    if (!map) {
      map = L.map(el, { zoomControl: false, attributionControl: true, dragging: true, scrollWheelZoom: false });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19, attribution: "© OpenStreetMap"
      }).addTo(map);
      map.attributionControl.setPrefix(false);
    }
    map.eachLayer(l => { if (!(l instanceof L.TileLayer)) map.removeLayer(l); });
    map.setView([lat, lon], zoom);
    if (mine) {
      if (accuracy && accuracy < 1500) L.circle([lat, lon], { radius: accuracy, color: "#1A63E0", weight: 1, fillOpacity: .12 }).addTo(map);
      L.marker([lat, lon], { icon: L.divIcon({ className: "", html: '<div class="me-dot"></div>', iconSize: [22, 22], iconAnchor: [11, 11] }) }).addTo(map);
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
  function render(place, detectedName, coords) {
    $("#result").hidden = false; status(null);
    const apps = $("#rApps"); apps.innerHTML = "";
    if (coords) showMap(coords.lat, coords.lon, 16, coords.acc, true);

    if (!place) {
      lastPlace = { n: detectedName || "", missing: true };
      $("#rLabel").textContent = "Estás en";
      $("#rName").textContent = detectedName || "Municipio desconocido";
      $("#rProv").textContent = "";
      $("#rHours").hidden = true; $("#rEmpty").hidden = false; $("#rLegend").hidden = true;
      if (!coords) $("#map").hidden = true;
      return;
    }
    lastPlace = place; store.set("ultimo", place.n);
    if (!coords) mapForPlace(place);
    $("#rLabel").textContent = "Apps que funcionan en";
    $("#rName").textContent = place.n;
    $("#rProv").textContent = place.p ? `Provincia de ${place.p}` : "";
    $("#rEmpty").hidden = true; $("#rLegend").hidden = false;
    renderHours(place);

    for (const entry of place.a) {
      const app = DATA.apps[entry.id]; if (!app) continue;
      const li = document.createElement("li"); li.className = "app";
      li.innerHTML = `<div class="logo"></div><div class="app-info"><span class="app-name"></span><span class="app-by"></span></div><span class="badge"></span><div class="app-actions"></div>`;
      li.querySelector(".app-name").textContent = app.name;
      li.querySelector(".app-by").textContent = app.by || "";
      const b = li.querySelector(".badge"); b.classList.add(entry.c); b.textContent = entry.c === "reciente" ? "Confirmada" : "Por confirmar";
      paintLogo(li.querySelector(".logo"), entry.id);
      const act = li.querySelector(".app-actions");
      const fill = () => {
        act.innerHTML = "";
        for (const l of appLinks(entry.id)) {
          const a = document.createElement("a"); a.href = l.href; a.textContent = l.t; a.target = "_blank"; a.rel = "noopener";
          if (l.main) a.className = "main"; act.appendChild(a);
        }
      };
      fill(); appleInfo(entry.id).then(fill); // si la App Store nos da el id, el enlace va directo a la app
      apps.appendChild(li);
    }
    $("#result").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ================= localización =================
  async function reverseGeocode(lat, lon) {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&accept-language=es&lat=${lat}&lon=${lon}`);
    if (!r.ok) throw new Error("geo");
    const a = (await r.json()).address || {};
    return { candidates: [a.city, a.town, a.village, a.municipality, a.city_district, a.county].filter(Boolean), country: a.country_code };
  }
  function locate() {
    if (!("geolocation" in navigator)) { status("Tu navegador no permite la localización. Busca el municipio a mano."); return; }
    const btn = $("#btnLocate"); btn.disabled = true; btn.classList.add("busy");
    status("Buscando dónde estás…");
    const end = () => { btn.disabled = false; btn.classList.remove("busy"); };
    navigator.geolocation.getCurrentPosition(async pos => {
      const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy };
      try {
        const { candidates, country } = await reverseGeocode(coords.lat, coords.lon);
        if (country && country !== "es") { render(null, candidates[0] || "Fuera de España", coords); status("De momento AVZonazul solo cubre España."); return; }
        let place = null;
        for (const c of candidates) { place = findExact(c); if (place) break; }
        render(place, candidates[0], coords);
      } catch (_) { status("No hemos podido saber el municipio (¿sin cobertura?). Búscalo a mano."); }
      finally { end(); }
    }, err => {
      end();
      status(err.code === 1 ? "Sin permiso de ubicación. Actívalo en el navegador o busca el municipio a mano."
        : "No hemos podido obtener tu ubicación. Búscalo a mano.");
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
          li.innerHTML = `<span>No lo tenemos todavía</span><small>Añadirlo</small>`;
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
    const chips = [...document.querySelectorAll("#chips button")];
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
      custom.value = ""; select(0); runTicket(); scheduleNative();
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    document.querySelectorAll("#ticketBar [data-add]").forEach(b => b.onclick = () => {
      const t = store.get("ticket"); if (!t) return;
      const base = Math.max(t.end, Date.now()); t.end = base + (+b.dataset.add) * 60000; t.notified = false; store.set("ticket", t); runTicket(); scheduleNative();
    });
    $("#tbStop").onclick = () => { store.del("ticket"); runTicket(); scheduleNative(); };
    document.addEventListener("visibilitychange", () => { if (!document.hidden) runTicket(); });
    runTicket();
  }
  // --- Avisos programados en el sistema (solo APK): suenan aunque la app esté cerrada ---
  async function nativeNotifyReady() {
    const LN = Plugin("LocalNotifications"); if (!LN) return false;
    try {
      let p = await LN.checkPermissions();
      if (p.display !== "granted") p = await LN.requestPermissions();
      try {
        await LN.createChannel({ id: "ticket", name: "Fin del ticket", description: "Aviso antes de que se acabe el tiempo de zona azul", importance: 5, visibility: 1, vibration: true });
      } catch (_) {}
      return p.display === "granted";
    } catch (_) { return false; }
  }
  async function scheduleNative() {
    const LN = Plugin("LocalNotifications"); if (!LN) return;
    try { await LN.cancel({ notifications: [{ id: 101 }, { id: 102 }] }); } catch (_) {}
    const t = store.get("ticket"); if (!t) return;
    const now = Date.now(), list = [];
    const warnAt = t.end - t.before * 60000;
    const body = `${t.place}: tu ticket acaba a las ${hhmm(new Date(t.end))}. Amplíalo desde la app de pago.`;
    if (warnAt > now + 5000) list.push({ id: 101, title: `Quedan ${t.before} min de zona azul`, body, channelId: "ticket", schedule: { at: new Date(warnAt), allowWhileIdle: true } });
    if (t.end > now + 5000) list.push({ id: 102, title: "Se ha acabado tu ticket", body: `${t.place}: el tiempo de zona azul ha terminado.`, channelId: "ticket", schedule: { at: new Date(t.end), allowWhileIdle: true } });
    if (list.length) { try { await LN.schedule({ notifications: list }); } catch (_) {} }
  }
  async function notify(t) {
    const left = Math.max(0, Math.round((t.end - Date.now()) / 60000));
    const title = left > 0 ? `Quedan ${left} min de zona azul` : "Se ha acabado tu ticket";
    const body = `${t.place}: tu ticket acaba a las ${hhmm(new Date(t.end))}. Amplíalo desde la app de pago.`;
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
    $("#tbEnd").textContent = `Acaba a las ${hhmm(new Date(t.end))} · aviso ${t.before} min antes`;
    const tick = () => {
      const cur = store.get("ticket"); if (!cur) { bar.hidden = true; clearInterval(ticketTimer); return; }
      const ms = cur.end - Date.now(), abs = Math.abs(ms);
      const h = Math.floor(abs / 3600000), m = Math.floor(abs / 60000) % 60, s = Math.floor(abs / 1000) % 60;
      $("#tbTime").textContent = (ms < 0 ? "−" : "") + (h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`);
      $("#tbFill").style.width = Math.max(0, Math.min(100, ms / (cur.end - cur.start) * 100)) + "%";
      bar.classList.toggle("warn", ms > 0 && ms <= cur.before * 60000);
      bar.classList.toggle("over", ms <= 0);
      if (ms <= 0) $("#tbEnd").textContent = `Caducó a las ${hhmm(new Date(cur.end))}`;
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
      add("", "Elige la app…", { disabled: true, selected: true });
      const ids = Object.keys(DATA.apps).sort((a, b) => DATA.apps[a].name.localeCompare(DATA.apps[b].name, "es"));
      const group = (label, list) => {
        if (!list.length) return;
        const g = document.createElement("optgroup"); g.label = label;
        list.forEach(id => { const o = document.createElement("option"); o.value = DATA.apps[id].name; o.textContent = DATA.apps[id].name; g.appendChild(o); });
        sel.appendChild(g);
      };
      group("Las que tenemos aquí", ids.filter(id => preferred.includes(id)));
      group(preferred.length ? "Otras apps conocidas" : "Apps conocidas", ids.filter(id => !preferred.includes(id)));
      add("__otra", "Otra (escribe el nombre)…");
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
      $("#install span").textContent = "En iPhone: pulsa Compartir y luego «Añadir a pantalla de inicio».";
      $("#btnInstall").hidden = true;
    }
  }

  // ================= arranque =================
  async function init() {
    $("#btnLocate").onclick = locate;
    $("#btnReport").onclick = () => window.openReport();
    $("#btnAddHere").onclick = () => window.openReport(lastPlace && lastPlace.n);
    setupSearch(); setupInstall();
    try { await loadData(); } catch (_) { status("No se han podido cargar los datos. Comprueba la conexión."); return; }
    setupReport(); setupTimer();
    try {
      if (navigator.permissions) {
        const p = await navigator.permissions.query({ name: "geolocation" });
        if (p.state === "granted") { locate(); return; }
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
      $("#updText").textContent = `Hay una versión nueva de AVZonazul (${ver})`;
      $("#updBar").hidden = false;
      const btn = $("#btnUpd");
      btn.textContent = "Actualizar"; btn.disabled = false;
      btn.onclick = async () => {
        const U = Plugin("Updater");
        if (!U) { openExternal(asset.browser_download_url); return; }
        try {
          const ok = await U.canInstall();
          if (!ok.allowed) {
            $("#updText").textContent = "Permite a AVZonazul instalar apps (solo esta vez) y vuelve a pulsar Actualizar";
            await U.openInstallSettings(); return;
          }
          btn.disabled = true; btn.textContent = "Descargando…";
          const h = await U.addListener("progress", p => { btn.textContent = `Descargando ${p.percent}%`; });
          await U.downloadAndInstall({ url: asset.browser_download_url });
          try { h.remove(); } catch (_) {}
          btn.disabled = false; btn.textContent = "Instalar";
        } catch (e) {
          btn.disabled = false; btn.textContent = "Reintentar";
          $("#updText").textContent = "No se pudo descargar. Revisa la conexión.";
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
        $("#btnUpd").onclick = () => { $("#btnUpd").textContent = "Actualizando…"; w.postMessage("actualizar"); };
      };
      if (reg.waiting) offer(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w && w.addEventListener("statechange", () => { if (w.state === "installed") offer(w); });
      });
      // Al volver a la app, mira si hay versión nueva
      document.addEventListener("visibilitychange", () => { if (!document.hidden) reg.update().catch(() => {}); });
    });
    let reloading = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => { if (!reloading) { reloading = true; location.reload(); } });
  }
  init();
})();
