const DAYS = ["sun","mon","tue","wed","thu","fri","sat"];
const DAY_LABEL = { sun:"Sunday", mon:"Monday", tue:"Tuesday", wed:"Wednesday", thu:"Thursday", fri:"Friday", sat:"Saturday" };
const LS_KEY = "essen_providers_v1";

function loadProviders() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return PROVIDERS.slice();
}
let providers = loadProviders();

const specSet = new Set();
LOCATIONS.forEach(l => l.specialties.forEach(s => specSet.add(s)));
providers.forEach(p => specSet.add(p.specialty));
const specSel = document.getElementById("spec");
[...specSet].sort().forEach(s => {
  const o = document.createElement("option");
  o.value = s; o.textContent = s; specSel.appendChild(o);
});

const daySel = document.getElementById("day");
const todayIdx = new Date().getDay();
DAYS.forEach((d, i) => {
  const o = document.createElement("option");
  o.value = d;
  o.textContent = DAY_LABEL[d] + (i === todayIdx ? " (today)" : "");
  if (i === todayIdx) o.selected = true;
  daySel.appendChild(o);
});

const map = L.map("map").setView([40.85, -73.88], 12);
L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
  attribution: "&copy; OpenStreetMap &copy; CARTO",
  maxZoom: 19
}).addTo(map);

const markers = {};
const iconDefault = L.divIcon({
  className: "",
  html: '<div style="background:#0b2a5b;color:#fff;width:28px;height:28px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:grid;place-items:center;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.25)"><span style="transform:rotate(45deg);font-weight:800;font-size:14px">+</span></div>',
  iconSize: [28, 28], iconAnchor: [14, 28], popupAnchor: [0, -28]
});
const iconHit = L.divIcon({
  className: "",
  html: '<div style="background:#0e8f8b;color:#fff;width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);display:grid;place-items:center;border:2px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.3)"><span style="transform:rotate(45deg);font-weight:800;font-size:15px">+</span></div>',
  iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -32]
});
const iconPatient = L.divIcon({
  className: "",
  html: '<div style="background:#c2410c;width:16px;height:16px;border-radius:50%;border:3px solid #fff;box-shadow:0 0 0 6px rgba(194,65,12,.25)"></div>',
  iconSize: [16, 16], iconAnchor: [8, 8]
});

let patientMarker = null;
let patientLatLng = null;

function haversine(aLat, aLng, bLat, bLng) {
  const R = 3958.8;
  const dLat = (bLat - aLat) * Math.PI / 180;
  const dLng = (bLng - aLng) * Math.PI / 180;
  const s = Math.sin(dLat/2)**2 + Math.cos(aLat*Math.PI/180)*Math.cos(bLat*Math.PI/180)*Math.sin(dLng/2)**2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

function providersAt(locationId, day, spec) {
  return providers.filter(p =>
    p.locationId === locationId &&
    (!spec || p.specialty === spec) &&
    (!day || p.days.includes(day))
  );
}

function googleDirUrl(loc) {
  const dest = encodeURIComponent(loc.address);
  if (patientLatLng) {
    const origin = patientLatLng.lat + "," + patientLatLng.lng;
    return "https://www.google.com/maps/dir/?api=1&origin=" + origin + "&destination=" + dest + "&travelmode=driving";
  }
  return "https://www.google.com/maps/dir/?api=1&destination=" + dest + "&travelmode=driving";
}

function bindPopup(loc) {
  const day = daySel.value;
  const spec = specSel.value;
  const on = providersAt(loc.id, day, spec);
  const all = providers.filter(p => p.locationId === loc.id && (!spec || p.specialty === spec));
  const list = (on.length ? on : all).map(p => {
    const here = p.days.includes(day);
    return "<div style='font-size:12px;margin:3px 0'>" + (here ? "\u25cf" : "\u25cb") + " <b>" + p.name + "</b> " + p.cred + " \u2014 " + p.specialty + "<br><span style='color:#5b6b82'>" + p.hours + " \u00b7 " + p.days.map(d => d.slice(0,2)).join(" ").toUpperCase() + (p.notes ? " \u00b7 " + p.notes : "") + "</span></div>";
  }).join("") || "<div style='font-size:12px;color:#5b6b82'>No demo providers tagged to this site yet.</div>";
  return "<div class='popup-title'>" + loc.name + "</div><div class='popup-a'>" + loc.address + "<br>" + loc.phone + "</div><div style='font-size:11px;color:#5b6b82;margin-bottom:6px'>" + loc.specialties.join(" \u00b7 ") + "</div>" + list + "<p><a class='dir' href='" + googleDirUrl(loc) + "' target='_blank' rel='noopener'>Google Maps directions</a></p>";
}

LOCATIONS.forEach(loc => {
  const m = L.marker([loc.lat, loc.lng], { icon: iconDefault }).addTo(map);
  m.bindPopup(() => bindPopup(loc));
  m.on("click", () => highlightList(loc.id));
  markers[loc.id] = m;
});

function highlightList(id) {
  document.querySelectorAll(".site").forEach(el => el.classList.toggle("active", el.dataset.id === id));
  const el = document.querySelector('.site[data-id="' + id + '"]');
  if (el) el.scrollIntoView({ block: "nearest" });
}

function renderList(ranked) {
  const day = daySel.value;
  const spec = specSel.value;
  const onlyAvail = document.getElementById("onlyAvail").value === "avail";
  const maxM = parseFloat(document.getElementById("miles").value);
  const list = document.getElementById("list");
  const items = ranked.filter(r => {
    if (patientLatLng && r.miles > maxM) return false;
    if (spec && !r.loc.specialties.includes(spec) && !providers.some(p => p.locationId === r.loc.id && p.specialty === spec)) return false;
    if (onlyAvail && patientLatLng) return providersAt(r.loc.id, day, spec).length > 0;
    return true;
  });

  document.getElementById("count").textContent = items.length + " site" + (items.length === 1 ? "" : "s") + (patientLatLng ? " within " + maxM + " mi" : "");

  if (!items.length) {
    list.innerHTML = '<div class="empty">No sites match those filters. Raise max miles or switch availability to Show all sites.</div>';
    return;
  }

  list.innerHTML = items.map((r, i) => {
    const on = providersAt(r.loc.id, day, spec);
    const miles = patientLatLng ? '<span class="miles">' + r.miles.toFixed(1) + " mi</span>" : "";
    const availHtml = on.length
      ? on.map(p => '<div class="prov"><span><b>' + p.name + "</b> " + p.cred + '<br><span class="meta">' + p.specialty + " \u00b7 " + p.hours + (p.notes ? " \u00b7 " + p.notes : "") + '</span></span><span class="ok">ON ' + DAY_LABEL[day].slice(0,3).toUpperCase() + "</span></div>").join("")
      : '<div class="meta" style="margin-top:6px">No ' + (spec || "listed") + " provider on " + DAY_LABEL[day] + " in the demo roster.</div>";
    return '<div class="site" data-id="' + r.loc.id + '">' + miles + "<h3>" + (i === 0 && patientLatLng ? "Closest \u00b7 " : "") + r.loc.name + '</h3><div class="meta">' + r.loc.address + "<br>" + r.loc.phone + '</div><div class="pills">' + r.loc.specialties.slice(0,4).map(s => '<span class="pill">' + s + "</span>").join("") + '</div><div class="avail">' + availHtml + "</div></div>";
  }).join("");

  list.querySelectorAll(".site").forEach(el => {
    el.addEventListener("click", () => {
      const loc = LOCATIONS.find(l => l.id === el.dataset.id);
      map.setView([loc.lat, loc.lng], 15);
      markers[loc.id].openPopup();
      highlightList(loc.id);
    });
  });
}

function rankedSites() {
  if (!patientLatLng) return LOCATIONS.map(loc => ({ loc, miles: Infinity }));
  return LOCATIONS.map(loc => ({
    loc,
    miles: haversine(patientLatLng.lat, patientLatLng.lng, loc.lat, loc.lng)
  })).sort((a, b) => a.miles - b.miles);
}

function refreshIcons(ranked) {
  const maxM = parseFloat(document.getElementById("miles").value);
  const day = daySel.value;
  const spec = specSel.value;
  LOCATIONS.forEach(loc => {
    const r = ranked.find(x => x.loc.id === loc.id);
    const inRange = !patientLatLng || r.miles <= maxM;
    const has = providersAt(loc.id, day, spec).length > 0;
    markers[loc.id].setIcon(inRange && has && patientLatLng ? iconHit : iconDefault);
    markers[loc.id].setOpacity(inRange ? 1 : 0.35);
  });
}

async function geocode(q) {
  const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(q);
  const res = await fetch(url, { headers: { "Accept": "application/json" } });
  if (!res.ok) throw new Error("Geocoder HTTP " + res.status);
  const data = await res.json();
  if (!data.length) throw new Error("Address not found");
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name };
}

async function runSearch() {
  const q = document.getElementById("addr").value.trim();
  if (!q) {
    patientLatLng = null;
    if (patientMarker) { map.removeLayer(patientMarker); patientMarker = null; }
    const ranked = rankedSites();
    renderList(ranked);
    refreshIcons(ranked);
    return;
  }
  const btn = document.getElementById("go");
  btn.textContent = "Searching...";
  try {
    const hit = await geocode(q);
    patientLatLng = { lat: hit.lat, lng: hit.lng };
    if (patientMarker) map.removeLayer(patientMarker);
    patientMarker = L.marker([hit.lat, hit.lng], { icon: iconPatient }).addTo(map)
      .bindPopup("<b>Patient address</b><br>" + hit.label);
    const ranked = rankedSites();
    renderList(ranked);
    refreshIcons(ranked);
    const maxM = parseFloat(document.getElementById("miles").value);
    const pts = [[hit.lat, hit.lng]];
    ranked.filter(r => r.miles <= maxM).slice(0, 8).forEach(r => pts.push([r.loc.lat, r.loc.lng]));
    map.fitBounds(pts, { padding: [40, 40] });
    if (ranked[0]) highlightList(ranked[0].loc.id);
  } catch (err) {
    alert("Could not locate that address. Try a full street + borough, e.g. 950 Anderson Ave, Bronx, NY.\n\n" + err.message);
  } finally {
    btn.textContent = "Find closest + available";
  }
}

document.getElementById("go").addEventListener("click", runSearch);
document.getElementById("addr").addEventListener("keydown", e => { if (e.key === "Enter") runSearch(); });
["day","spec","miles","onlyAvail"].forEach(id => {
  document.getElementById(id).addEventListener("change", () => {
    const ranked = rankedSites();
    renderList(ranked);
    refreshIcons(ranked);
  });
});
document.getElementById("reset").addEventListener("click", () => {
  document.getElementById("addr").value = "";
  patientLatLng = null;
  if (patientMarker) { map.removeLayer(patientMarker); patientMarker = null; }
  map.setView([40.85, -73.88], 12);
  const ranked = rankedSites();
  renderList(ranked);
  refreshIcons(ranked);
});

document.getElementById("edit").addEventListener("click", () => {
  document.getElementById("rosterJson").value = JSON.stringify(providers, null, 2);
  document.getElementById("editor").showModal();
});
document.getElementById("cancelEdit").addEventListener("click", () => document.getElementById("editor").close());
document.getElementById("saveEdit").addEventListener("click", () => {
  try {
    const next = JSON.parse(document.getElementById("rosterJson").value);
    if (!Array.isArray(next)) throw new Error("Must be an array");
    providers = next;
    localStorage.setItem(LS_KEY, JSON.stringify(providers));
    document.getElementById("editor").close();
    const ranked = rankedSites();
    renderList(ranked);
    refreshIcons(ranked);
  } catch (e) {
    alert("Invalid JSON: " + e.message);
  }
});

renderList(rankedSites());
