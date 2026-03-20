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

window.initMap = function () {
  const center = { lat: 60.186, lng: 24.959 };
  map = new google.maps.Map(document.getElementById("map"), { center, zoom: 5 });
  marker = new google.maps.Marker({ map, position: center });
  setValue("coord", `${center.lat},${center.lng}`);

  map.addListener("click", (e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    marker.setPosition({ lat, lng });
    setValue("coord", `${lat.toFixed(6)},${lng.toFixed(6)}`);
  });

  const searchEl = document.getElementById("search");
  if (searchEl) {
    autocomplete = new google.maps.places.Autocomplete(searchEl);
    autocomplete.addListener("place_changed", () => {
      const p = autocomplete.getPlace();
      if (!p.geometry) return;
      const lat = p.geometry.location.lat();
      const lng = p.geometry.location.lng();
      map.setCenter({ lat, lng });
      map.setZoom(8);
      marker.setPosition({ lat, lng });
      setValue("coord", `${lat.toFixed(6)},${lng.toFixed(6)}`);
    });
  }
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

function parseDateTimeLocal(dateStr, timeStr) {
  // DD.MM.YYYY + HH.MM.SS
  const [dd, mm, yyyy] = dateStr.split(".").map(Number);
  const [HH, MM, SS] = timeStr.split(".").map(Number);
  if (![dd, mm, yyyy, HH, MM, SS].every(Number.isFinite)) throw new Error("Invalid date/time");
  return new Date(Date.UTC(yyyy, mm - 1, dd, HH, MM, SS));
}

function parseDateTimeToUtc(dateStr, timeStr, utcHours = 0, summertime = false) {
  // DD.MM.YYYY + HH.MM.SS as local civil time -> UTC Date
  const [dd, mm, yyyy] = dateStr.split(".").map(Number);
  const [HH, MM, SS] = timeStr.split(".").map(Number);
  if (![dd, mm, yyyy, HH, MM, SS].every(Number.isFinite)) throw new Error("Invalid date/time");
  const offset = Number(utcHours || 0) + (summertime ? 1 : 0);
  return new Date(Date.UTC(yyyy, mm - 1, dd, HH - offset, MM, SS));
}

function degToRad(d) { return (d * Math.PI) / 180; }
function radToDeg(r) { return (r * 180) / Math.PI; }
function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }

function julianDate(dateUtc) {
  return dateUtc.getTime() / 86400000 + 2440587.5;
}

function gmstHours(dateUtc) {
  const jd = julianDate(dateUtc);
  const T = (jd - 2451545.0) / 36525.0;
  let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - (T * T * T) / 38710000.0;
  gmst = ((gmst % 360) + 360) % 360;
  return gmst / 15.0;
}

function eqToAltAz(raHours, decDeg, latDeg, lonDeg, dateUtc) {
  const lst = (gmstHours(dateUtc) + lonDeg / 15 + 24) % 24;
  let haHours = lst - raHours;
  if (haHours < -12) haHours += 24;
  if (haHours > 12) haHours -= 24;

  const ha = degToRad(haHours * 15);
  const dec = degToRad(decDeg);
  const lat = degToRad(latDeg);

  const sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(ha);
  const alt = Math.asin(clamp(sinAlt, -1, 1));

  const cosAz = (Math.sin(dec) - Math.sin(alt) * Math.sin(lat)) / (Math.cos(alt) * Math.cos(lat) || 1e-12);
  let az = Math.acos(clamp(cosAz, -1, 1));
  if (Math.sin(ha) > 0) az = 2 * Math.PI - az;

  return { altDeg: radToDeg(alt), azRad: az };
}

function projectToMap(altDeg, azRad, radius, fullview) {
  if (!fullview && altDeg < 0) return null;
  // Zenithal-like projection: horizon circle when fullview=false, extended when true
  const z = degToRad(90 - altDeg); // zenith distance
  const zMax = fullview ? Math.PI : Math.PI / 2;
  const r = (z / zMax) * radius;
  return {
    x: r * Math.sin(azRad),
    y: -r * Math.cos(azRad),
  };
}

function starRadius(mag, magLimit, aperture) {
  if (mag > magLimit) return 0;
  return Math.max(0.3, (magLimit - mag + 0.6) * aperture);
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

  // 1) JSON preferred
  const json = await fetchFirstJson(["./stars.min.json", "./data/stars.min.json", "../data/stars.min.json"]);
  if (Array.isArray(json) && json.length) {
    CATALOG_CACHE = json.map((s, i) => normalizeStar(s, i)).filter(Boolean);
    if (CATALOG_CACHE.length) return CATALOG_CACHE;
  }

  // 2) Parse repo text catalogs
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
    const lines = ybscText.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      let s = parseYBSC5FixedWidth(ln, stars.length);
      if (!s) s = parseFlexibleStarLine(ln, stars.length);
      if (s) stars.push(s);
    }
  }

  if (extraText) {
    const lines = extraText.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const s = parseFlexibleStarLine(lines[i], stars.length);
      if (s) stars.push(s);
    }
  }

  if (stars.length) {
    CATALOG_CACHE = stars;
    return CATALOG_CACHE;
  }

  // 3) Fallback
  CATALOG_CACHE = FALLBACK_STARS.map((s, i) => normalizeStar(s, i)).filter(Boolean);
  return CATALOG_CACHE;
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

  // 1) JSON preferred: [[hr1,hr2], ...] or [{a:..,b:..}, ...]
  const json = await fetchFirstJson([
    "./constellation_lines.json",
    "./data/constellation_lines.json",
    "../datafiles/constellation_lines.json",
  ]);

  const segments = [];
  if (Array.isArray(json)) {
    for (const row of json) {
      let aRef, bRef;
      if (Array.isArray(row) && row.length >= 2) {
        [aRef, bRef] = row;
      } else if (row && typeof row === "object") {
        aRef = row.a ?? row.from ?? row.hr1 ?? row[0];
        bRef = row.b ?? row.to ?? row.hr2 ?? row[1];
      }
      if (aRef == null || bRef == null) continue;

      const aNum = Number(aRef), bNum = Number(bRef);
      let a = null, b = null;
      if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
        a = lookup.byHr.get(aNum);
        b = lookup.byHr.get(bNum);
      } else {
        a = lookup.byName.get(String(aRef).toLowerCase());
        b = lookup.byName.get(String(bRef).toLowerCase());
      }
      if (a && b) segments.push([a, b]);
    }
    if (segments.length) {
      CONSTELLATION_CACHE = segments;
      return CONSTELLATION_CACHE;
    }
  }

  // 2) TXT fallback
  const txt = await fetchFirstText([
    "../datafiles/constellation_lines.txt",
    "./datafiles/constellation_lines.txt",
    "./constellation_lines.txt",
  ]);

  if (txt) {
    for (const line of txt.split(/\r?\n/)) {
      const seg = parseConstellationLineRow(line, lookup);
      if (seg) segments.push(seg);
    }
  }

  CONSTELLATION_CACHE = segments;
  return CONSTELLATION_CACHE;
}

function buildSvg(stars, opts) {
  const width = opts.width;
  const height = opts.height;
  const border = opts.border;
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
    pieces.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${guide}" stroke-width="1"/>`);
    pieces.push(`<line x1="${cx - radius}" y1="${cy}" x2="${cx + radius}" y2="${cy}" stroke="${guide}" stroke-width="1"/>`);
    pieces.push(`<line x1="${cx}" y1="${cy - radius}" x2="${cx}" y2="${cy + radius}" stroke="${guide}" stroke-width="1"/>`);
  }

  // Constellation lines first (behind stars)
  if (opts.constellation && Array.isArray(opts.constellationSegments)) {
    for (const [a, b] of opts.constellationSegments) {
      const pa = eqToAltAz(Number(a.ra), Number(a.dec), opts.lat, opts.lon, opts.dateUtc);
      const pb = eqToAltAz(Number(b.ra), Number(b.dec), opts.lat, opts.lon, opts.dateUtc);
      const A = projectToMap(pa.altDeg, pa.azRad, radius, opts.fullview);
      const B = projectToMap(pb.altDeg, pb.azRad, radius, opts.fullview);
      if (!A || !B) continue;
      pieces.push(
        `<line x1="${(cx + A.x).toFixed(2)}" y1="${(cy + A.y).toFixed(2)}" x2="${(cx + B.x).toFixed(2)}" y2="${(cy + B.y).toFixed(2)}" stroke="${fg}" stroke-width="0.6" opacity="0.75"/>`
      );
    }
  }

  for (const s of stars) {
    const pos = eqToAltAz(Number(s.ra), Number(s.dec), opts.lat, opts.lon, opts.dateUtc);
    const p = projectToMap(pos.altDeg, pos.azRad, radius, opts.fullview);
    if (!p) continue;
    const r = starRadius(Number(s.mag), opts.magLimit, opts.aperture);
    if (r <= 0) continue;
    pieces.push(`<circle cx="${(cx + p.x).toFixed(2)}" cy="${(cy + p.y).toFixed(2)}" r="${r.toFixed(2)}" fill="${fg}" />`);
  }

  if (!opts.noInfo) {
    pieces.push(`<text x="16" y="${height - 30}" fill="${fg}" font-size="10" font-family="sans-serif">${escapeXml(opts.infoText)}</text>`);
    pieces.push(`<text x="16" y="${height - 18}" fill="${fg}" font-size="10" font-family="sans-serif">${opts.lat.toFixed(4)} N ${opts.lon.toFixed(4)} E</text>`);
    pieces.push(`<text x="16" y="${height - 6}" fill="${fg}" font-size="10" font-family="sans-serif">${opts.dateRaw} ${opts.timeRaw}</text>`);
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

document.getElementById("generate")?.addEventListener("click", async () => {
  try {
    const { lat, lon } = parseCoord(getValue("coord", "60.186,24.959"));
    const dateRaw = getValue("date", "01.01.2000");
    const timeRaw = getValue("time", "12.00.00");

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
    const constellationSegments = constellation ? await loadConstellationSegments(stars) : [];

    const svg = buildSvg(stars, {
      lat, lon, dateUtc, dateRaw, timeRaw,
      width, height, border: 14, magLimit, aperture,
      fullview, guides, constellation, constellationSegments,
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