(() => {
  "use strict";
  const CFG = window.AVZONAZUL_CONFIG || {};
  const $ = s => document.querySelector(s);
  const ua = navigator.userAgent;
  const PLATFORM = /android/i.test(ua) ? "android" : (/iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)) ? "ios" : "otro";

  let DATA = null;
  let INDEX = [];          // [{key, place}]
  let lastPlace = null;

  // ---------- utilidades ----------
  const norm = s => (s || "")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[’'`´]/g, " ").replace(/[\/\-–,().]/g, " ")
    .replace(/\s+/g, " ").trim();

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} }
  };

  function status(msg) {
    const el = $("#status");
    if (!msg) { el.hidden = true; return; }
    el.textContent = msg; el.hidden = false;
  }

  // ---------- datos ----------
  async function loadData() {
    const r = await fetch("data.json", { cache: "no-cache" });
    DATA = await r.json();
    INDEX = [];
    for (const p of DATA.places) {
      INDEX.push({ key: norm(p.n), place: p });
      for (const a of (p.al || [])) INDEX.push({ key: norm(a), place: p });
    }
    $("#count").textContent = `${DATA.places.length} municipios`;
    $("#updated").textContent = new Date(DATA.updated).toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" });
  }

  function findExact(name) {
    const k = norm(name);
    if (!k) return null;
    const hit = INDEX.find(e => e.key === k);
    if (hit) return hit.place;
    // nombres compuestos tipo "Donostia/San Sebastián" o "Castelló de la Plana / Castellón de la Plana"
    for (const part of String(name).split(/[\/]/)) {
      const kk = norm(part);
      const h = INDEX.find(e => e.key === kk);
      if (h) return h.place;
    }
    return null;
  }

  function searchPlaces(q) {
    const k = norm(q);
    if (k.length < 2) return [];
    const seen = new Set(), starts = [], contains = [];
    for (const e of INDEX) {
      if (seen.has(e.place.n)) continue;
      if (e.key.startsWith(k)) { starts.push(e.place); seen.add(e.place.n); }
      else if (e.key.includes(" " + k) || e.key.includes(k)) { contains.push(e.place); seen.add(e.place.n); }
    }
    return starts.concat(contains).slice(0, 8);
  }

  // ---------- enlaces a las apps ----------
  function appLinks(app) {
    const links = [];
    const play = app.android
      ? `https://play.google.com/store/apps/details?id=${app.android}`
      : `https://play.google.com/store/search?q=${encodeURIComponent(app.name.split(" (")[0])}&c=apps`;
    const ios = app.ios ? `https://apps.apple.com/es/app/id${app.ios}` : null;

    if (PLATFORM === "android") links.push({ t: "Abrir / descargar", href: play, main: true });
    else if (PLATFORM === "ios") links.push(ios ? { t: "Abrir / descargar", href: ios, main: true } : { t: "Ver la app", href: app.web, main: true });
    else {
      links.push({ t: "Google Play", href: play, main: true });
      if (ios) links.push({ t: "App Store", href: ios });
    }
    if (app.web && !(PLATFORM === "ios" && !ios)) links.push({ t: "Web", href: app.web });
    return links;
  }

  // ---------- pintar resultado ----------
  function render(place, detectedName) {
    const box = $("#result");
    box.innerHTML = "";
    box.hidden = false;
    status(null);

    if (!place) {
      lastPlace = { n: detectedName || "", missing: true };
      box.innerHTML = `
        <div class="place-head"><small>Estás en</small><h2></h2></div>
        <div class="empty">
          <p>Todavía no tenemos datos de este municipio. Mira el cartel del parquímetro: suele indicar la app oficial.</p>
          <p>¿Ya sabes cuál funciona? Cuéntanoslo y la añadimos para el siguiente que aparque aquí.</p>
          <button class="ghost" id="btnReportHere">Añadir este municipio</button>
        </div>`;
      box.querySelector("h2").textContent = detectedName || "Municipio desconocido";
      box.querySelector("#btnReportHere").onclick = () => report(detectedName, true);
      return;
    }

    lastPlace = place;
    store.set("ultimo", place.n);
    const head = document.createElement("div");
    head.className = "place-head";
    head.innerHTML = `<small>Apps que funcionan en</small><h2></h2><p></p>`;
    head.querySelector("h2").textContent = place.n;
    head.querySelector("p").textContent = place.p ? `Provincia de ${place.p}` : "";
    box.appendChild(head);

    const ul = document.createElement("ul");
    ul.className = "apps";
    const tpl = $("#tplApp");
    for (const entry of place.a) {
      const app = DATA.apps[entry.id];
      if (!app) continue;
      const li = tpl.content.firstElementChild.cloneNode(true);
      li.querySelector(".app-name").textContent = app.name;
      li.querySelector(".app-by").textContent = app.by || "";
      const b = li.querySelector(".badge");
      b.classList.add(entry.c);
      b.textContent = entry.c === "reciente" ? "Confirmada" : "Por confirmar";
      const act = li.querySelector(".app-actions");
      for (const l of appLinks(app)) {
        const a = document.createElement("a");
        a.href = l.href; a.textContent = l.t; a.target = "_blank"; a.rel = "noopener";
        if (l.main) a.className = "main";
        act.appendChild(a);
      }
      ul.appendChild(li);
    }
    box.appendChild(ul);

    const legend = document.createElement("div");
    legend.className = "legend";
    legend.textContent = "«Confirmada»: dato de fuentes recientes. «Por confirmar»: sale en listados antiguos; puede haber cambiado.";
    box.appendChild(legend);
    box.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // ---------- localización ----------
  async function reverseGeocode(lat, lon) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&addressdetails=1&accept-language=es&lat=${lat}&lon=${lon}`;
    const r = await fetch(url, { headers: { "Accept": "application/json" } });
    if (!r.ok) throw new Error("geo");
    const j = await r.json();
    const a = j.address || {};
    return {
      candidates: [a.city, a.town, a.village, a.municipality, a.city_district, a.county].filter(Boolean),
      country: a.country_code
    };
  }

  function locate() {
    if (!("geolocation" in navigator)) { status("Tu navegador no permite la localización. Busca el municipio a mano."); return; }
    const btn = $("#btnLocate");
    btn.disabled = true;
    status("Buscando dónde estás…");
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const { candidates, country } = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        if (country && country !== "es") { render(null, candidates[0] || "Fuera de España"); status("De momento AVZonazul solo cubre España."); return; }
        let place = null;
        for (const c of candidates) { place = findExact(c); if (place) break; }
        render(place, candidates[0]);
      } catch (_) {
        status("No hemos podido saber el municipio (¿sin cobertura?). Búscalo a mano.");
      } finally { btn.disabled = false; }
    }, err => {
      btn.disabled = false;
      status(err.code === 1
        ? "Sin permiso de ubicación. Puedes activarlo en el navegador o buscar el municipio a mano."
        : "No hemos podido obtener tu ubicación. Búscalo a mano.");
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 60000 });
  }

  // ---------- buscador ----------
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
          li.innerHTML = `<span>No lo tenemos todavía</span><small>Avisar</small>`;
          li.onclick = () => { close(); render(null, q.value.trim()); };
          list.appendChild(li); list.hidden = false;
        } else close();
        return;
      }
      items.forEach((p, i) => {
        const li = document.createElement("li");
        li.setAttribute("role", "option");
        li.setAttribute("aria-selected", i === sel);
        const s = document.createElement("span"); s.textContent = p.n;
        const sm = document.createElement("small"); sm.textContent = p.p || "";
        li.append(s, sm);
        li.onmousedown = e => { e.preventDefault(); choose(p); };
        list.appendChild(li);
      });
      list.hidden = false;
    };
    q.addEventListener("input", () => { items = searchPlaces(q.value); sel = -1; paint(); });
    q.addEventListener("keydown", e => {
      if (list.hidden) return;
      if (e.key === "ArrowDown") { sel = Math.min(sel + 1, items.length - 1); paint(); e.preventDefault(); }
      else if (e.key === "ArrowUp") { sel = Math.max(sel - 1, 0); paint(); e.preventDefault(); }
      else if (e.key === "Enter") { const p = items[sel >= 0 ? sel : 0]; if (p) choose(p); e.preventDefault(); }
      else if (e.key === "Escape") close();
    });
    q.addEventListener("blur", () => setTimeout(close, 150));
  }

  // ---------- avisos de los usuarios ----------
  function report(name, missing) {
    const muni = name || (lastPlace && lastPlace.n) || "";
    if (CFG.formulario) { window.open(CFG.formulario, "_blank", "noopener"); return; }
    const title = missing ? `Añadir municipio: ${muni}` : `Corrección${muni ? ": " + muni : ""}`;
    const body = `Municipio: ${muni}\nApp que funciona (o que ya no funciona): \nCómo lo sabes (cartel, uso propio…): \n`;
    const url = `https://github.com/${CFG.repo}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    window.open(url, "_blank", "noopener");
  }

  // ---------- instalación ----------
  function setupInstall() {
    let deferred = null;
    window.addEventListener("beforeinstallprompt", e => {
      e.preventDefault(); deferred = e; $("#install").hidden = false;
    });
    $("#btnInstall").onclick = async () => {
      if (deferred) { deferred.prompt(); await deferred.userChoice; deferred = null; $("#install").hidden = true; }
    };
    const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    if (PLATFORM === "ios" && !standalone) {
      $("#install").hidden = false;
      $("#install span").textContent = "En iPhone: pulsa Compartir y luego «Añadir a pantalla de inicio».";
      $("#btnInstall").hidden = true;
    }
  }

  // ---------- arranque ----------
  async function init() {
    if (CFG.nombre) { $("#appName").textContent = CFG.nombre; }
    $("#btnLocate").onclick = locate;
    $("#btnReport").onclick = () => report(lastPlace && lastPlace.n, lastPlace && lastPlace.missing);
    setupSearch();
    setupInstall();
    try { await loadData(); }
    catch (_) { status("No se han podido cargar los datos. Comprueba la conexión."); return; }

    // Si ya dio permiso de ubicación antes, localizamos solo al abrir
    try {
      if (navigator.permissions) {
        const p = await navigator.permissions.query({ name: "geolocation" });
        if (p.state === "granted") { locate(); return; }
      }
    } catch (_) {}
    const prev = store.get("ultimo");
    if (prev) { const p = findExact(prev); if (p) render(p); }
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
  init();
})();
