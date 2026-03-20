let map, marker, autocomplete;

// Minimal fallback catalog (RA hours, Dec degrees, Mag)
const FALLBACK_STARS = [
  { ra: 6.7525, dec: -16.7161, mag: -1.46, name: "Sirius" },
  { ra: 14.261, dec: 19.1825, mag: -0.05, name: "Arcturus" },
  { ra: 5.2423, dec: -8.2016, mag: 0.18, name: "Rigel" },
  { ra: 5.9195, dec: 7.4071, mag: 0.50, name: "Betelgeuse" },
  { ra: 7.655, dec: 5.225, mag: 0.38, name: "Procyon" },
  { ra: 18.6156, dec: 38.7837, mag: 0.03, name: "Vega" },
  { ra: 20.6905, dec: 45.2803, mag: 0.25, name: "Deneb" },
  { ra: 19.8464, dec: 8.8683, mag: 0.77, name: "Altair" },
  { ra: 16.4901, dec: -26.432, mag: 1.06, name: "Antares" },
  { ra: 13.4199, dec: -11.1614, mag: 0.98, name: "Spica" },
];

let CATALOG_CACHE = null;
let CONSTELLATION_CACHE = null;
let CATALOG_SOURCE = "unknown";

function applyMapLocation(lat, lng, zoom = 8) {
  if (!map || !marker) return;
  const pos = { lat, lng };
  map.setCenter(pos);
  map.setZoom(zoom);
  marker.position = pos; // AdvancedMarkerElement
  setValue("coord", `${lat.toFixed(6)},${lng.toFixed(6)}`);
}

async function setupAddressSearch() {
  if (!window.google?.maps?.places) return;

  const searchHost =
    document.getElementById("search-host") ||
    document.getElementById("search")?.parentElement ||
    document.body;

  // Optional: remove old text input if present
  const oldInput = document.getElementById("search");
  if (oldInput) oldInput.style.display = "none";

  // New Places web component
  const placeEl = new google.maps.places.PlaceAutocompleteElement({
    // optional component restrictions:
    // componentRestrictions: { country: ["fi", "gb", "us"] },
  });

  placeEl.id = "place-autocomplete";
  placeEl.style.width = "320px";
  searchHost.appendChild(placeEl);

  // New event shape (recommended)
  placeEl.addEventListener("gmp-select", async (ev) => {
    try {
      const prediction = ev.placePrediction;
      if (!prediction) return;
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ["location", "displayName", "formattedAddress"] });
      if (!place.location) return;
      applyMapLocation(place.location.lat(), place.location.lng(), 10);
    } catch (e) {
      console.warn("Place selection failed:", e);
    }
  });

  // Compatibility with earlier event payloads
  placeEl.addEventListener("gmp-placeselect", async (ev) => {
    try {
      const place = ev.place;
      if (!place) return;
      if (typeof place.fetchFields === "function") {
        await place.fetchFields({ fields: ["location"] });
      }
      if (!place.location) return;
      applyMapLocation(place.location.lat(), place.location.lng(), 10);
    } catch (e) {
      console.warn("Place selection failed:", e);
    }
  });
}

const GOOGLE_MAP_ID = "YOUR_MAP_ID"; // create in Google Cloud -> Maps Management -> Map IDs

window.initMap = async function () {
  const center = { lat: 60.186, lng: 24.959 };

  map = new google.maps.Map(document.getElementById("map"), {
    center,
    zoom: 5,
    mapId: GOOGLE_MAP_ID,
  });

  const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");
  marker = new AdvancedMarkerElement({
    map,
    position: center,
    title: "Selected location",
  });

  setValue("coord", `${center.lat},${center.lng}`);

  map.addListener("click", (e) => {
    applyMapLocation(e.latLng.lat(), e.latLng.lng(), map.getZoom());
  });

  await setupAddressSearch();
};

function setValue(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function getValue(id, fallback = "") {
  const el = document.getElementById(id);
  return el ? String(el.value ?? "").trim() : fallback;
}

function getBool(id, fallback = false) {
  const el = document.getElementById(id);
  if (!el) return fallback;
  if (el.type === "checkbox") return !!el.checked;
  const v = String(el.value ?? "").trim().toLowerCase();
  if (!v) return fallback;
  return ["1", "true", "yes", "y", "on"].includes(v);
}

function parseCoord(value) {
  const [latS, lonS] = value.split(",").map((x) => x.trim());
  const lat = Number(latS);
  const lon = Number(lonS);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("Invalid coord");
  return { lat, lon };
}

function parseDottedDate(dateStr) {
  const [dd, mm, yyyy] = String(dateStr).trim().split(".").map(Number);
  if (![dd, mm, yyyy].every(Number.isFinite)) throw new Error("Invalid date format, expected DD.MM.YYYY");
  return { dd, mm, yyyy };
}

function parseFlexibleTime(timeStr) {
  // accepts HH.MM.SS or HH:MM:SS
  const parts = String(timeStr).trim().replaceAll(":", ".").split(".").map(Number);
  const [HH = 0, MM = 0, SS = 0] = parts;
  if (![HH, MM, SS].every(Number.isFinite)) throw new Error("Invalid time format, expected HH.MM.SS");
  return { HH, MM, SS };
}

function parseDateTimeToUtc(dateStr, timeStr, utcHours = 0, summertime = false) {
  const { dd, mm, yyyy } = parseDottedDate(dateStr);
  const { HH, MM, SS } = parseFlexibleTime(timeStr);
  const offset = Number(utcHours || 0) + (summertime ? 1 : 0);
  return new Date(Date.UTC(yyyy, mm - 1, dd, HH - offset, MM, SS));
}

function degToRad(d) { return (d * Math.PI) / 180; }
function radToDeg(r) { return (r * 180) / Math.PI; }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

// safe positive modulo helper (needed by sidereal calculations)
function mod(a, n) {
  return ((a % n) + n) % n;
}

function julianDate(dateUtc) {
  return dateUtc.getTime() / 86400000 + 2440587.5;
}

function localSiderealHours(dateUtc, lonDeg) {
  // Meeus-style GMST -> LST
  const jd = julianDate(dateUtc);
  const d = jd - 2451545.0;
  const gmst = mod(18.697374558 + 24.06570982441908 * d, 24);
  return mod(gmst + lonDeg / 15.0, 24);
}

function eqToAltAz(raHours, decDeg, latDeg, lonDeg, dateUtc) {
  const lst = localSiderealHours(dateUtc, lonDeg);
  let haDeg = (lst - raHours) * 15.0;
  haDeg = mod(haDeg + 180, 360) - 180; // [-180, 180)

  const ha = degToRad(haDeg);
  const dec = degToRad(decDeg);
  const lat = degToRad(latDeg);

  const sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(ha);
  const alt = Math.asin(clamp(sinAlt, -1, 1));

  // azimuth from north, eastward
  const y = Math.sin(ha);
  const x = Math.cos(ha) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat);
  let az = Math.atan2(y, x) + Math.PI; // [0, 2pi)

  return { altDeg: radToDeg(alt), azRad: az };
}

function projectToMap(altDeg, azRad, radius, fullview) {
  if (!fullview && altDeg < 0) return null;

  // azimuthal equidistant projection (closer to printed planisphere style)
  const zenithDeg = 90 - altDeg; // 0 at zenith, 90 at horizon
  const maxZenith = fullview ? 180 : 90;
  const r = (zenithDeg / maxZenith) * radius;

  // Keep north up
  const x = r * Math.sin(azRad);
  const y = -r * Math.cos(azRad);
  return { x, y };
}

function starRadius(mag, magLimit, aperture) {
  if (mag > magLimit) return 0;
  // closer to original script behavior (sharper dynamic range)
  const v = (magLimit - mag + 0.8) * aperture;
  return Math.max(0.2, Math.min(4.5, v));
}

function normalizeStar(raw, idx = 0) {
  const ra = Number(raw.ra);
  const dec = Number(raw.dec);
  const mag = Number(raw.mag);
  if (!Number.isFinite(ra) || !Number.isFinite(dec) || !Number.isFinite(mag)) return null;
  return {
    idx,
    ra,
    dec,
    mag,
    name: raw.name || "",
    hr: raw.hr != null ? Number(raw.hr) : null,
  };
}

function parseFlexibleStarLine(line, idx) {
  // supports: "ra dec mag [name...]" or "hr ra dec mag [name...]"
  const cleaned = line.trim().replace(/\s+/g, " ");
  if (!cleaned || cleaned.startsWith("#")) return null;
  const parts = cleaned.split(" ");

  const nums = parts.map((p) => Number(p));
  const finiteIdx = nums.map((n, i) => [n, i]).filter(([n]) => Number.isFinite(n));

  if (finiteIdx.length < 3) return null;

  // Try hr + ra + dec + mag
  if (finiteIdx.length >= 4) {
    const [n0, i0] = finiteIdx[0];
    const [n1, i1] = finiteIdx[1];
    const [n2, i2] = finiteIdx[2];
    const [n3, i3] = finiteIdx[3];
    if (n1 >= 0 && n1 < 24 && n2 >= -90 && n2 <= 90 && n3 > -5 && n3 < 20) {
      const name = parts.slice(i3 + 1).join(" ");
      return normalizeStar({ hr: n0, ra: n1, dec: n2, mag: n3, name }, idx);
    }
  }

  // Try ra + dec + mag
  {
    const [n0, i0] = finiteIdx[0];
    const [n1, i1] = finiteIdx[1];
    const [n2, i2] = finiteIdx[2];
    if (n0 >= 0 && n0 < 24 && n1 >= -90 && n1 <= 90 && n2 > -5 && n2 < 20) {
      const name = parts.slice(i2 + 1).join(" ");
      return normalizeStar({ ra: n0, dec: n1, mag: n2, name }, idx);
    }
  }

  return null;
}

function parseYBSC5FixedWidth(line, idx) {
  // BSC5 common fixed-width fields:
  // HR: [0:4], RA h/m/s around [75:83], Dec sign/deg/min around [83:90], Vmag around [102:107]
  try {
    const hr = Number(line.slice(0, 4).trim());
    const rah = Number(line.slice(75, 77).trim());
    const ram = Number(line.slice(77, 79).trim());
    const ras = Number(line.slice(79, 83).trim());
    const decSign = line.slice(83, 84) === "-" ? -1 : 1;
    const decd = Number(line.slice(84, 86).trim());
    const decm = Number(line.slice(86, 88).trim());
    const mag = Number(line.slice(102, 107).trim());
    const name = line.slice(4, 14).trim();

    if (![rah, ram, ras, decd, decm, mag].every(Number.isFinite)) return null;
    const ra = rah + ram / 60 + ras / 3600;
    const dec = decSign * (decd + decm / 60);

    return normalizeStar({ hr, ra, dec, mag, name }, idx);
  } catch {
    return null;
  }
}

async function fetchFirstText(paths) {
  for (const p of paths) {
    try {
      const r = await fetch(p, { cache: "force-cache" });
      if (r.ok) return await r.text();
    } catch (_) {}
  }
  return null;
}

async function fetchFirstJson(paths) {
  for (const p of paths) {
    try {
      const r = await fetch(p, { cache: "force-cache" });
      if (r.ok) return await r.json();
    } catch (_) {}
  }
  return null;
}

async function loadCatalog() {
  if (CATALOG_CACHE) return CATALOG_CACHE;

  // Removed stars.min.json probe to avoid noisy 404 in production
  const ybscText = await fetchFirstText([
    "../datafiles/ybsc5.txt",
    "./datafiles/ybsc5.txt",
    "./ybsc5.txt",
  ]);

  const extraText = await fetchFirstText([
    "../datafiles/extradata.txt",
    "./datafiles/extradata.txt",
    "./extradata.txt",
  ]);

  const stars = [];
  if (ybscText) {
    for (const ln of ybscText.split(/\r?\n/)) {
      let s = parseYBSC5FixedWidth(ln, stars.length);
      if (!s) s = parseFlexibleStarLine(ln, stars.length);
      if (s) stars.push(s);
    }
  }
  if (extraText) {
    for (const ln of extraText.split(/\r?\n/)) {
      const s = parseFlexibleStarLine(ln, stars.length);
      if (s) stars.push(s);
    }
  }

  if (stars.length > 1000) {
    CATALOG_CACHE = stars;
    CATALOG_SOURCE = "repo-datafiles";
    return CATALOG_CACHE;
  }

  throw new Error(
    "Star catalog not loaded (ybsc5/extradata missing or blocked). " +
    "Do not run via file://. Use GitHub Pages or a local web server."
  );
}

function buildStarLookup(stars) {
  const byHr = new Map();
  const byName = new Map();
  for (const s of stars) {
    if (Number.isFinite(s.hr)) byHr.set(Number(s.hr), s);
    if (s.name) byName.set(String(s.name).trim().toLowerCase(), s);
  }
  return { byHr, byName };
}

function parseConstellationLineRow(line, lookup) {
  const t = line.trim();
  if (!t || t.startsWith("#")) return null;

  // accept separators: comma/semicolon/space
  const parts = t.split(/[,\s;]+/).filter(Boolean);
  if (parts.length < 2) return null;

  const aNum = Number(parts[0]);
  const bNum = Number(parts[1]);

  if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
    const a = lookup.byHr.get(aNum);
    const b = lookup.byHr.get(bNum);
    if (a && b) return [a, b];
  }

  const aName = parts[0].toLowerCase();
  const bName = parts[1].toLowerCase();
  const a = lookup.byName.get(aName);
  const b = lookup.byName.get(bName);
  if (a && b) return [a, b];

  return null;
}

async function loadConstellationSegments(stars) {
  if (CONSTELLATION_CACHE) return CONSTELLATION_CACHE;

  const lookup = buildStarLookup(stars);
  const segments = [];

  // Skip JSON probes entirely - load TXT only from known path
  const txt = await fetchFirstText([
    "https://corvus2606.github.io/starmap-svg/datafiles/constellation_lines.txt",
    "https://corvus2606.github.io/starmap-svg/constellation_lines.txt",
  ]);

  if (txt) {
    for (const line of txt.split(/\r?\n/)) {
      const seg = parseConstellationLineRow(line, lookup);
      if (seg) segments.push(seg);
    }
  }

  console.log(`Constellation segments loaded: ${segments.length}`);
  CONSTELLATION_CACHE = segments;
  return CONSTELLATION_CACHE;
}

function pyDateAndTimeToRad(dateStr, timeStr, utc, summertime) {
  // Exact parity with Python date_and_time_to_rad()
  const epochyear = 2000.0;
  const epochhour = 12.0;
  const calculation_mistake = -5.1;
  const days_in_year = 365.2425;
  const months = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  const year = Number(dateStr.slice(6, 10));
  const month = Number(dateStr.slice(3, 5));
  const day = Number(dateStr.slice(0, 2));

  const hour = Number(timeStr.slice(0, 2));
  const minute = Number(timeStr.slice(3, 5));
  const second = Number(timeStr.slice(6, 8));

  let daycounter = (year - epochyear) * days_in_year;
  daycounter += months.slice(0, month - 1).reduce((a, b) => a + b, 0);
  daycounter += day - 1;

  let secondcounter = (hour - epochhour + calculation_mistake) * 3600;
  secondcounter += minute * 60;
  secondcounter += second;

  if (summertime) secondcounter -= 3600;
  secondcounter -= 3600 * Number(utc || 0);

  let degree = mod(-(daycounter * 360.0 / days_in_year), 360);
  degree -= mod((secondcounter * 360.0) / (24 * 60 * 60), 360);

  return degToRad(degree);
}

function pyAngleBetween(north, east, dec_angle, ra_angle) {
  const delta_ra = ra_angle - east;
  const c =
    Math.cos(delta_ra) * Math.cos(north) * Math.cos(dec_angle) +
    Math.sin(north) * Math.sin(dec_angle);
  return Math.acos(clamp(c, -1, 1));
}

function pyStereographic(latitude0, longitude0, latitude, longitude, R) {
  const denom =
    1 +
    Math.sin(latitude0) * Math.sin(latitude) +
    Math.cos(latitude0) * Math.cos(latitude) * Math.cos(longitude - longitude0);

  // Guard against division by zero / near-zero
  if (Math.abs(denom) < 1e-10) return { x: 0, y: 0 };

  const k = (2 * R) / denom;

  const x = k * Math.cos(latitude) * Math.sin(longitude - longitude0);
  const y =
    k *
    (Math.cos(latitude0) * Math.sin(latitude) -
      Math.sin(latitude0) * Math.cos(latitude) * Math.cos(longitude - longitude0));

  return { x, y };
}

function generateGuidesPy(opts) {
  const N = degToRad(opts.lat);
  const E = degToRad(opts.lon);
  const raddatetime = pyDateAndTimeToRad(opts.dateRaw, opts.timeRaw, opts.utc, opts.summertime);

  // Match Python: R is based on min dimension / 2 minus border
  const R = Math.min(opts.width, opts.height) / 2 - opts.borders;
  const halfX = opts.width / 2;
  const halfY = opts.height / 2;

  const dots = [];
  const brightness = 1.1;
  const maxAngle = degToRad(89);

  const draw_guides = [];

  for (let degrees = -3; degrees < 3; degrees++) {
    for (let lines = 0; lines < 360; lines++) {
      draw_guides.push([degrees * 30, lines]);
    }
  }

  for (let hours = 0; hours < 24; hours++) {
    for (let lines = -160; lines < 160; lines++) {
      draw_guides.push([lines / 2.0, (hours / 24) * 360]);
    }
  }

  for (const line of draw_guides) {
    const ascension = degToRad(line[1]) + raddatetime;
    const declination = degToRad(line[0]);

    const angle_from_viewpoint = pyAngleBetween(N, E, declination, ascension);
    if (angle_from_viewpoint <= maxAngle || opts.fullview) {
      const { x, y } = pyStereographic(N, E, declination, ascension, R);

      // Guard against NaN/Infinity before pushing
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

      dots.push({
        x: halfX - x,
        y: halfY - y,
        r: brightness * opts.aperture,
      });
    }
  }

  return dots;
}

function buildSvg(stars, opts) {
  const width = opts.width;
  const height = opts.height;
  const border = opts.border ?? opts.borders ?? 14; // accept either key
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - border;

  const bg = opts.light ? "rgb(255,255,255)" : "rgb(45,59,98)";
  const fg = opts.light ? "rgb(0,0,0)" : "rgb(255,255,255)";
  const guide = opts.light ? "rgb(180,180,180)" : "rgb(255,255,255)";

  const pieces = [];
  pieces.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
  pieces.push(`<rect width="100%" height="100%" fill="${bg}"/>`);

  if (opts.guides) {
    const guideDots = generateGuidesPy({ ...opts, borders: border });
    for (const d of guideDots) {
      if (!Number.isFinite(d.x) || !Number.isFinite(d.y) || !Number.isFinite(d.r)) continue;
      pieces.push(
        `<circle cx="${d.x.toFixed(2)}" cy="${d.y.toFixed(2)}" r="${d.r.toFixed(2)}" fill="${guide}" />`
      );
    }
  }

  if (opts.constellation && Array.isArray(opts.constellationSegments)) {
    for (const [a, b] of opts.constellationSegments) {
      const pa = eqToAltAz(Number(a.ra), Number(a.dec), opts.lat, opts.lon, opts.dateUtc);
      const pb = eqToAltAz(Number(b.ra), Number(b.dec), opts.lat, opts.lon, opts.dateUtc);
      const A = projectToMap(pa.altDeg, pa.azRad, radius, opts.fullview);
      const B = projectToMap(pb.altDeg, pb.azRad, radius, opts.fullview);
      if (!A || !B) continue;
      if (!Number.isFinite(A.x) || !Number.isFinite(A.y) || !Number.isFinite(B.x) || !Number.isFinite(B.y)) continue;
      pieces.push(`<line x1="${(cx + A.x).toFixed(2)}" y1="${(cy + A.y).toFixed(2)}" x2="${(cx + B.x).toFixed(2)}" y2="${(cy + B.y).toFixed(2)}" stroke="${fg}" stroke-width="0.6" opacity="0.75"/>`);
    }
  }

  for (const s of stars) {
    const pos = eqToAltAz(Number(s.ra), Number(s.dec), opts.lat, opts.lon, opts.dateUtc);
    const p = projectToMap(pos.altDeg, pos.azRad, radius, opts.fullview);
    if (!p) continue;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
    const r = starRadius(Number(s.mag), opts.magLimit, opts.aperture);
    if (r <= 0 || !Number.isFinite(r)) continue;
    pieces.push(`<circle cx="${(cx + p.x).toFixed(2)}" cy="${(cy + p.y).toFixed(2)}" r="${r.toFixed(2)}" fill="${fg}" />`);
  }

  if (!opts.noInfo) {
    const ns = opts.lat >= 0 ? "N" : "S";
    const ew = opts.lon >= 0 ? "E" : "W";
    pieces.push(`<text x="16" y="${height - 30}" fill="${fg}" font-size="10" font-family="sans-serif">${escapeXml(opts.infoText)}</text>`);
    pieces.push(`<text x="16" y="${height - 18}" fill="${fg}" font-size="10" font-family="sans-serif">${Math.abs(opts.lat).toFixed(4)} ${ns} ${Math.abs(opts.lon).toFixed(4)} ${ew}</text>`);
    pieces.push(`<text x="16" y="${height - 6}" fill="${fg}" font-size="10" font-family="sans-serif">${opts.dateRaw} ${opts.timeRaw} UTC ${opts.utc}</text>`);
  }

  pieces.push(`</svg>`);
  return pieces.join("");
}

function escapeXml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function toDdMmYyyyFromPicker(v) {
  // yyyy-mm-dd -> dd.mm.yyyy
  if (!v) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return v;
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function toHhMmSsFromPicker(v) {
  // hh:mm or hh:mm:ss -> hh.mm.ss
  if (!v) return "";
  const parts = v.split(":");
  const hh = parts[0] ?? "00";
  const mm = parts[1] ?? "00";
  const ss = parts[2] ?? "00";
  return `${hh}.${mm}.${ss}`;
}

function setDefaultDateTime() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  const dateEl = document.getElementById("datePicker");
  const timeEl = document.getElementById("timePicker");

  if (dateEl && !dateEl.value) dateEl.value = `${yyyy}-${mm}-${dd}`;
  if (timeEl && !timeEl.value) timeEl.value = "09:00:00";
}

// call on load
setDefaultDateTime();

document.getElementById("generate")?.addEventListener("click", async () => {
  try {
    const { lat, lon } = parseCoord(getValue("coord", "60.186,24.959"));

    // Prefer picker inputs
    const dateRaw =
      toDdMmYyyyFromPicker(getValue("datePicker")) ||
      getValue("date", "01.01.2000");

    const timeRaw =
      toHhMmSsFromPicker(getValue("timePicker")) ||
      getValue("time", "12.00.00");

    const utc = Number(getValue("utc", "0")) || 0;
    const summertime = getBool("summertime", false);
    const dateUtc = parseDateTimeToUtc(dateRaw, timeRaw, utc, summertime);

    const width = Number(getValue("width", "800")) || 800;
    const height = Number(getValue("height", "800")) || 800;
    const magLimit = Number(getValue("magn", "5.7")) || 5.7;
    const aperture = Number(getValue("aperture", "0.4")) || 0.4;
    const fullview = getBool("fullview", false);
    const guides = getBool("guides", false);
    const constellation = getBool("constellation", false);
    const light = getBool("light", false);
    const noInfo = getBool("no-info", false);
    const infoText = getValue("info", "");

    const stars = await loadCatalog();
    console.log(`Catalog source: ${CATALOG_SOURCE}, stars: ${stars.length}`);

    const constellationSegments = constellation ? await loadConstellationSegments(stars) : [];
    const svg = buildSvg(stars, {
      lat, lon, utc, summertime, dateUtc, dateRaw, timeRaw,
      width, height,
      border,   // consistent single key
      borders: border,
      magLimit, aperture, fullview, guides, constellation, constellationSegments,
      light, noInfo, infoText
    });

    const preview = document.getElementById("preview");
    if (preview) preview.innerHTML = svg;

    const download = document.getElementById("download");
    if (download) download.href = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
  } catch (err) {
    console.error(err);
    alert(`Generate failed: ${err.message}`);
  }
});