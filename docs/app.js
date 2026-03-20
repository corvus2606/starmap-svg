let map, marker, autocomplete;
let LAST_PLACE_LABEL = "";

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

function toUpperCity(value) {
  return String(value ?? "").trim().toUpperCase();
}

function extractCityLabel(place, prediction) {
  const comps = Array.isArray(place?.addressComponents) ? place.addressComponents : [];
  const pick = (type) => comps.find((c) => Array.isArray(c.types) && c.types.includes(type));
  const read = (c) => c?.longText || c?.long_name || c?.shortText || c?.short_name || "";

  let city =
    read(pick("locality")) ||
    read(pick("postal_town")) ||
    read(pick("administrative_area_level_2")) ||
    read(pick("administrative_area_level_1")) ||
    place?.displayName?.text ||
    place?.displayName ||
    "";

  if (!city && place?.formattedAddress) {
    city = String(place.formattedAddress).split(",")[0].trim();
  }

  if (!city) {
    city =
      prediction?.mainText?.text ||
      prediction?.mainText ||
      prediction?.text?.text ||
      prediction?.text ||
      "";
  }

  return toUpperCity(city);
}

function setCityInfoFromPlace(place, prediction) {
  const city = extractCityLabel(place, prediction);
  if (!city) return;
  LAST_PLACE_LABEL = city;
  setValue("info", city);
}

function syncInfoInputToUppercase() {
  const infoEl = document.getElementById("info");
  if (!infoEl) return;
  infoEl.addEventListener("input", () => {
    const up = toUpperCity(infoEl.value);
    if (infoEl.value !== up) infoEl.value = up;
    if (up) LAST_PLACE_LABEL = up;
  });
}

async function setupAddressSearch() {
  if (!window.google?.maps?.places) return;

  const searchHost =
    document.getElementById("search-host") ||
    document.getElementById("search")?.parentElement ||
    document.body;

  const oldInput = document.getElementById("search");
  if (oldInput) oldInput.style.display = "none";

  const placeEl = new google.maps.places.PlaceAutocompleteElement({});
  placeEl.id = "place-autocomplete";
  placeEl.style.width = "320px";
  searchHost.appendChild(placeEl);

  placeEl.addEventListener("gmp-select", async (ev) => {
    try {
      const prediction = ev?.placePrediction || ev?.detail?.placePrediction;
      if (!prediction) {
        console.warn("[gmp-select] no prediction in event", ev);
        return;
      }

      const quick = toUpperCity(
        prediction?.mainText?.text ||
        String(prediction?.mainText || "") ||
        String(prediction?.text?.text || "") ||
        String(prediction?.text || "")
      );
      if (quick) {
        LAST_PLACE_LABEL = quick;
        const infoEl = document.getElementById("info");
        if (infoEl) infoEl.value = quick;
      }

      const place = prediction.toPlace();
      await place.fetchFields({
        fields: ["location", "displayName", "formattedAddress", "addressComponents"],
      });

      if (place?.location) {
        const lat = place.location.lat();
        const lng = place.location.lng();
        applyMapLocation(lat, lng, 10);
        applyTimezoneForLocation(lat, lng); // auto-set UTC + summertime
      }

      const refined = extractCityLabel(place, prediction);
      if (refined) {
        LAST_PLACE_LABEL = refined;
        const infoEl = document.getElementById("info");
        if (infoEl) infoEl.value = refined;
      }
    } catch (e) {
      console.warn("Place selection failed:", e);
    }
  });

  placeEl.addEventListener("gmp-placeselect", async (ev) => {
    try {
      const place = ev?.place || ev?.detail?.place;
      if (!place) return;

      if (typeof place.fetchFields === "function") {
        await place.fetchFields({
          fields: ["location", "displayName", "formattedAddress", "addressComponents"],
        });
      }

      if (place?.location) {
        applyMapLocation(place.location.lat(), place.location.lng(), 10);
      }

      const city = extractCityLabel(place, null);
      console.log("[gmp-placeselect] city:", city);
      if (city) {
        LAST_PLACE_LABEL = city;
        const infoEl = document.getElementById("info");
        if (infoEl) infoEl.value = city;
      }
    } catch (e) {
      console.warn("Place selection failed:", e);
    }
  });
}

const GOOGLE_MAP_ID = "YOUR_MAP_ID";
const GOOGLE_MAPS_API_KEY = "AIzaSyBh0ZOoRiOk40Ny_1FczvOU9QQK0eYvyvk"; // This is a browser key with referrer restrictions, safe to expose

async function reverseGeocode(lat, lng) {
  try {
    const { Geocoder } = await google.maps.importLibrary("geocoding");
    const geocoder = new Geocoder();
    const result = await geocoder.geocode({ location: { lat, lng } });
    const place = result?.results?.[0];
    if (!place) return "";

    const comps = place.address_components || [];
    const pick = (type) => comps.find((c) => c.types.includes(type));

    const city =
      pick("locality")?.long_name ||
      pick("postal_town")?.long_name ||
      pick("administrative_area_level_2")?.long_name ||
      pick("administrative_area_level_1")?.long_name ||
      place.formatted_address?.split(",")[0] ||
      "";

    return toUpperCity(city);
  } catch (e) {
    console.warn("Reverse geocode failed:", e);
    return "";
  }
}

function getUtcOffsetAndDst(lat, lng, dateStr) {
  try {
    // Build a Date from dateStr (DD.MM.YYYY) at noon UTC
    const parts = String(dateStr).split(".");
    const dd = Number(parts[0]);
    const mm = Number(parts[1]);
    const yyyy = Number(parts[2]);
    if (!dd || !mm || !yyyy) return { utc: 0, summertime: false };

    const d = new Date(Date.UTC(yyyy, mm - 1, dd, 12, 0, 0));

    // Use Intl to get the timezone name for the lat/lng
    // We need the IANA timezone — use the TimeZone API if available, else fallback
    const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone;

    // Format the date in the target timezone to extract offset
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: tzName,
      hour: "numeric",
      timeZoneName: "shortOffset",
    });

    const parts2 = fmt.formatToParts(d);
    const tzPart = parts2.find((p) => p.type === "timeZoneName")?.value || "";
    // tzPart is like "GMT+3" or "GMT-5" or "GMT"
    const match = /GMT([+-])(\d+)(?::(\d+))?/.exec(tzPart);
    const sign = match?.[1] === "-" ? -1 : 1;
    const hours = Number(match?.[2] ?? 0);
    const utcOffset = sign * hours;

    // Detect DST: compare Jan 1 offset vs Jul 1 offset for same year
    const fmtJan = new Intl.DateTimeFormat("en-GB", {
      timeZone: tzName,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date(Date.UTC(yyyy, 0, 15, 12)));

    const fmtJul = new Intl.DateTimeFormat("en-GB", {
      timeZone: tzName,
      timeZoneName: "shortOffset",
    }).formatToParts(new Date(Date.UTC(yyyy, 6, 15, 12)));

    const offsetJan = parseOffsetFromParts(fmtJan);
    const offsetJul = parseOffsetFromParts(fmtJul);
    const maxOffset = Math.max(offsetJan, offsetJul);
    const isSummertime = utcOffset === maxOffset && offsetJan !== offsetJul;

    return { utc: isSummertime ? utcOffset - 1 : utcOffset, summertime: isSummertime };
  } catch (e) {
    console.warn("getUtcOffsetAndDst failed:", e);
    return { utc: 0, summertime: false };
  }
}

function parseOffsetFromParts(parts) {
  const tzPart = parts.find((p) => p.type === "timeZoneName")?.value || "";
  const match = /GMT([+-])(\d+)(?::(\d+))?/.exec(tzPart);
  const sign = match?.[1] === "-" ? -1 : 1;
  return sign * Number(match?.[2] ?? 0);
}

async function getTimezoneForLocation(lat, lng) {
  try {
    // Use Geocoding API to get IANA timezone name from the location
    const { Geocoder } = await google.maps.importLibrary("geocoding");
    const geocoder = new Geocoder();
    const result = await geocoder.geocode({ location: { lat, lng } });

    // Extract country code to help guess timezone
    const comps = result?.results?.[0]?.address_components || [];
    const country = comps.find((c) => c.types.includes("country"))?.short_name || "";
    const adminArea = comps.find((c) => c.types.includes("administrative_area_level_1"))?.long_name || "";

    // Use Intl to find matching timezone by testing candidate zones
    const allZones = Intl.supportedValuesOf("timeZone");
    const candidates = allZones.filter((z) =>
      z.toLowerCase().includes(country.toLowerCase()) ||
      z.toLowerCase().includes(adminArea.toLowerCase().replace(/\s+/g, "_"))
    );

    // Find the zone whose UTC offset best matches the geographic longitude
    // Rough estimate: longitude / 15 = UTC offset in hours
    const roughUtc = Math.round(lng / 15);
    const dateRaw = toDdMmYyyyFromPicker(getValue("datePicker")) || getValue("date", "01.01.2000");
    const parts = dateRaw.split(".");
    const testDate = new Date(Date.UTC(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]), 12));

    // Check all zones for one matching the rough UTC offset
    const matchingZone = allZones.find((z) => {
      try {
        const fmt = new Intl.DateTimeFormat("en-GB", {
          timeZone: z,
          timeZoneName: "shortOffset",
        });
        const tzStr = fmt.formatToParts(testDate).find((p) => p.type === "timeZoneName")?.value || "";
        const m = /GMT([+-])(\d+)/.exec(tzStr);
        if (!m) return roughUtc === 0;
        const offset = (m[1] === "-" ? -1 : 1) * Number(m[2]);
        return offset === roughUtc;
      } catch { return false; }
    }) || Intl.DateTimeFormat().resolvedOptions().timeZone;

    return getUtcOffsetAndDstForZone(matchingZone, testDate, Number(parts[2]));
  } catch (e) {
    console.warn("getTimezoneForLocation failed:", e.message);
    // Fallback: estimate from longitude
    const roughUtc = Math.round(lng / 15);
    return { utc: roughUtc, summertime: false };
  }
}

function getUtcOffsetAndDstForZone(tzName, testDate, year) {
  try {
    const getOffset = (date) => {
      const fmt = new Intl.DateTimeFormat("en-GB", {
        timeZone: tzName,
        timeZoneName: "shortOffset",
      });
      const tzStr = fmt.formatToParts(date).find((p) => p.type === "timeZoneName")?.value || "";
      const m = /GMT([+-])(\d+)/.exec(tzStr);
      if (!m) return 0;
      return (m[1] === "-" ? -1 : 1) * Number(m[2]);
    };

    const currentOffset = getOffset(testDate);
    const janOffset = getOffset(new Date(Date.UTC(year, 0, 15, 12)));
    const julOffset = getOffset(new Date(Date.UTC(year, 6, 15, 12)));

    const stdOffset = Math.min(janOffset, julOffset);
    const isSummertime = currentOffset > stdOffset;

    console.log(`Timezone: ${tzName}, currentOffset=${currentOffset}, std=${stdOffset}, dst=${isSummertime}`);
    return { utc: stdOffset, summertime: isSummertime };
  } catch (e) {
    console.warn("getUtcOffsetAndDstForZone failed:", e);
    return { utc: 0, summertime: false };
  }
}

async function applyTimezoneForLocation(lat, lng) {
  const { utc, summertime } = await getTimezoneForLocation(lat, lng);
  setValue("utc", String(utc));
  const stEl = document.getElementById("summertime");
  if (stEl) stEl.checked = summertime;
  console.log(`Timezone applied: UTC${utc >= 0 ? "+" : ""}${utc}, summertime=${summertime}`);
}

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

  map.addListener("click", async (e) => {
    const lat = e.latLng.lat();
    const lng = e.latLng.lng();
    applyMapLocation(lat, lng, map.getZoom());

    const [city] = await Promise.all([
      reverseGeocode(lat, lng),
      applyTimezoneForLocation(lat, lng),
    ]);

    if (city) {
      LAST_PLACE_LABEL = city;
      const infoEl = document.getElementById("info");
      if (infoEl) infoEl.value = city;
    }
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

function parseStarDataLine(line) {
  // Format: "ra,dec,mag" (RA may be hours OR degrees depending on source file)
  const t = line.trim();
  if (!t || t.startsWith("#")) return null;

  const parts = t.split(",").map((s) => s.trim());
  if (parts.length < 3) return null;

  const raRaw = Number(parts[0]);
  const dec = Number(parts[1]);
  const mag = Number(parts[2]);

  if (!Number.isFinite(raRaw) || !Number.isFinite(dec) || !Number.isFinite(mag)) return null;
  return { raRaw, dec, mag };
}

async function loadCatalog() {
  if (CATALOG_CACHE) return CATALOG_CACHE;

  const stardataText = await fetchFirstText(["./datafiles/stardata.txt"]);
  const ybscText = !stardataText ? await fetchFirstText(["./datafiles/ybsc5.txt"]) : null;
  // const extraText = await fetchFirstText(["./datafiles/extradata.txt"]); // disabled

  const stars = [];
  const seen = new Set();

  // quantized key to collapse near-duplicates
  function starKey(s) {
    const raQ = Math.round(Number(s.ra) * 3600);   // ~0.001h bins
    const decQ = Math.round(Number(s.dec) * 60);   // ~1 arcmin bins
    const magQ = Math.round(Number(s.mag) * 10);   // 0.1 mag bins
    return `${raQ}|${decQ}|${magQ}`;
  }

  function addUnique(raw) {
    const s = normalizeStar(raw, stars.length);
    if (!s) return;
    const k = starKey(s);
    if (seen.has(k)) return;
    seen.add(k);
    stars.push(s);
  }

  if (stardataText) {
    const raw = [];
    for (const ln of stardataText.split(/\r?\n/)) {
      const s = parseStarDataLine(ln);
      if (s) raw.push(s);
    }

    const raMax = raw.length ? Math.max(...raw.map((s) => s.raRaw)) : 0;
    const raFactor = raMax > 24.5 ? (24 / 360) : 1;

    for (const r of raw) {
      addUnique({ ra: r.raRaw * raFactor, dec: r.dec, mag: r.mag });
    }

    console.log(`stardata.txt parsed: ${stars.length} unique stars`);
  } else if (ybscText) {
    for (const ln of ybscText.split(/\r?\n/)) {
      let s = parseYBSC5FixedWidth(ln, stars.length);
      if (!s) s = parseFlexibleStarLine(ln, stars.length);
      if(s) addUnique(s);
    }
    console.log(`ybsc5.txt parsed: ${stars.length} unique stars`);
  }

  // Disabled to prevent duplicated/misaligned stars vs constellation lines
  // if (extraText) {
  //   const before = stars.length;
  //   for (const ln of extraText.split(/\r?\n/)) {
  //     const s = parseFlexibleStarLine(ln, stars.length);
  //     if (s) addUnique(s);
  //   }
  //   console.log(`extradata.txt added: ${stars.length - before} unique stars`);
  // }

  if (stars.length > 100) {
    CATALOG_CACHE = stars;
    CATALOG_SOURCE = stardataText ? "stardata.txt" : "ybsc5.txt";
    return CATALOG_CACHE;
  }

  throw new Error(`Star catalog not loaded or too small (${stars.length} stars). Check datafiles are accessible.`);
}

function buildStarLookup(stars) {
  const byHr = new Map();
  const byName = new Map();
  for (const s of stars) {
    if (s.hr != null && Number.isFinite(Number(s.hr))) {
      byHr.set(Number(s.hr), s);
    }
    if (s.name) byName.set(String(s.name).trim().toLowerCase(), s);
  }
  return { byHr, byName };
}

function parseConstellationLineRow(line) {
  // Format: "NAME ra1 dec1 ra2 dec2"
  // RA in hours (0-24), Dec in degrees
  const t = line.trim();
  if (!t || t.startsWith("#")) return null;

  const parts = t.split(/\s+/);
  if (parts.length < 5) return null;

  const ra1  = Number(parts[1]);
  const dec1 = Number(parts[2]);
  const ra2  = Number(parts[3]);
  const dec2 = Number(parts[4]);

  if (![ra1, dec1, ra2, dec2].every(Number.isFinite)) return null;
  if (ra1 < 0 || ra1 >= 24 || ra2 < 0 || ra2 >= 24) return null;

  return [
    { ra: ra1, dec: dec1 },
    { ra: ra2, dec: dec2 },
  ];
}

async function loadConstellationSegments(stars) {
  if (CONSTELLATION_CACHE) return CONSTELLATION_CACHE;

  const txt = await fetchFirstText([
    "./datafiles/constellation_lines.txt",
  ]);

  if (!txt) {
    console.warn("constellation_lines.txt not found");
    CONSTELLATION_CACHE = [];
    return CONSTELLATION_CACHE;
  }

  const lines = txt.split(/\r?\n/);
  console.log(`constellation_lines.txt: ${lines.length} lines`);
  console.log("First 5 lines:", lines.slice(0, 5));

  const segments = [];
  let skipped = 0;
  for (const line of lines) {
    const seg = parseConstellationLineRow(line);
    if (seg) segments.push(seg);
    else if (line.trim() && !line.trim().startsWith("#")) skipped++;
  }

  console.log(`Constellation: ${segments.length} segments loaded, ${skipped} skipped`);
  CONSTELLATION_CACHE = segments;
  return CONSTELLATION_CACHE;
}

function pyDateAndTimeToRad(dateStr, timeStr, utc, summertime) {
  const epochyear = 2000.0;
  const epochhour = 12.0;
  const calculation_mistake = -5.1;
  const days_in_year = 365.2425;
  const months = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  // Support DD.MM.YYYY and DD/MM/YYYY
  const dateParts = String(dateStr).trim().replace(/[\/\-]/g, ".").split(".");
  const day   = Number(dateParts[0]);
  const month = Number(dateParts[1]);
  const year  = Number(dateParts[2]);

  // Support HH.MM.SS and HH:MM:SS
  const timeParts = String(timeStr).trim().replace(/:/g, ".").split(".");
  const hour   = Number(timeParts[0] ?? 0);
  const minute = Number(timeParts[1] ?? 0);
  const second = Number(timeParts[2] ?? 0);

  // Log to verify parsing is correct
  console.debug(`pyDateAndTimeToRad: date=${day}/${month}/${year} time=${hour}:${minute}:${second} utc=${utc} summertime=${summertime}`);

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

  console.debug(`pyDateAndTimeToRad: daycounter=${daycounter.toFixed(2)} degree=${degree.toFixed(4)}`);

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

function buildProjectionParams(lat, lon, dateRaw, timeRaw, utc, summertime, R, cx, cy) {
  const N = degToRad(lat);
  const E = degToRad(lon);
  const raddatetime = pyDateAndTimeToRad(dateRaw, timeRaw, utc, summertime);
  const maxAngle = degToRad(89);
  return { N, E, raddatetime, R, cx, cy, maxAngle };
}

// Project a single star using pre-computed params (fast - no recalculation)
function projectWithParams(raHours, decDeg, p) {
  const ascension = degToRad(raHours * 15.0) + p.raddatetime;
  const declination = degToRad(decDeg);

  const angle = pyAngleBetween(p.N, p.E, declination, ascension);
  if (angle > p.maxAngle) return null;

  const { x, y } = pyStereographic(p.N, p.E, declination, ascension, p.R);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  return { x: p.cx - x, y: p.cy - y };
}

function normalizeStarPoints(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 4;
  return Math.max(3, Math.min(12, v));
}

function buildSvg(stars, opts) {
  const width = opts.width;
  const height = opts.height;
  const border = opts.border ?? opts.borders ?? 14;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - border;

  const isLight = !!opts.light;
  const showBorder = !!opts.showBorder;
  const useStarShapes = !!opts.starShape;
  const starPoints = normalizeStarPoints(opts.starPoints);

  const bgDefault = isLight ? "#ffffff" : "#2d3b62";
  const fgDefault = isLight ? "#0a0a0a" : "#ffffff";
  const guideDefault = isLight ? "#7d89d8" : "#cfd6ff";
  const constellationDefault = fgDefault;
  const borderDefault = fgDefault;
  const textDefault = fgDefault;

  const bg = svgColor(opts.bgColor, bgDefault);
  const fg = svgColor(opts.starColor, fgDefault);
  const guideFill = svgColor(opts.guideColor, guideDefault);
  const conFill = svgColor(opts.constellationColor, constellationDefault);
  const borderClr = svgColor(opts.borderColor, borderDefault);
  const textClr = svgColor(opts.textColor, textDefault);

  const clipId = "map-clip";

  const proj = buildProjectionParams(
    opts.lat, opts.lon,
    opts.dateRaw, opts.timeRaw,
    opts.utc, opts.summertime,
    radius, cx, cy
  );

  const pieces = [];
  pieces.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`);
  pieces.push(`<defs><clipPath id="${clipId}"><circle cx="${cx}" cy="${cy}" r="${radius}"/></clipPath></defs>`);
  pieces.push(`<rect width="100%" height="100%" fill="${bg}"/>`);
  pieces.push(`<g clip-path="url(#${clipId})">`);

  if (opts.guides) {
    const guideDots = generateGuidesPy({ ...opts, borders: border, proj });
    for (const d of guideDots) {
      if (!Number.isFinite(d.x) || !Number.isFinite(d.y) || !Number.isFinite(d.r)) continue;
      pieces.push(`<circle cx="${d.x.toFixed(2)}" cy="${d.y.toFixed(2)}" r="${d.r.toFixed(2)}" fill="${guideFill}" opacity="0.35" />`);
    }
  }

  if (opts.constellation && Array.isArray(opts.constellationSegments)) {
    for (const [a, b] of opts.constellationSegments) {
      const A = projectWithParams(Number(a.ra), Number(a.dec), proj);
      const B = projectWithParams(Number(b.ra), Number(b.dec), proj);
      if (!A || !B) continue;
      pieces.push(`<line x1="${A.x.toFixed(2)}" y1="${A.y.toFixed(2)}" x2="${B.x.toFixed(2)}" y2="${B.y.toFixed(2)}" stroke="${conFill}" stroke-width="0.6" opacity="0.9"/>`);
    }
  }

  for (const s of stars) {
    const p = projectWithParams(Number(s.ra), Number(s.dec), proj);
    if (!p) continue;

    const r = starRadius(Number(s.mag), opts.magLimit, opts.aperture);
    if (r <= 0 || !Number.isFinite(r)) continue;

    if (useStarShapes && r >= 1.1) {
      pieces.push(`<path d="${starPath(p.x, p.y, r, r * 0.45, starPoints)}" fill="${fg}" />`);
    } else {
      pieces.push(`<circle cx="${p.x.toFixed(2)}" cy="${p.y.toFixed(2)}" r="${r.toFixed(2)}" fill="${fg}" />`);
    }
  }

  pieces.push(`</g>`);

  if (showBorder) {
    pieces.push(`<circle cx="${cx}" cy="${cy}" r="${radius}" fill="none" stroke="${borderClr}" stroke-width="1.5"/>`);
  }

  if (!opts.noInfo) {
    const ns = opts.lat >= 0 ? "N" : "S";
    const ew = opts.lon >= 0 ? "E" : "W";
    pieces.push(`<text x="16" y="${height - 30}" fill="${textClr}" font-size="10" font-family="sans-serif">${escapeXml(opts.infoText)}</text>`);
    pieces.push(`<text x="16" y="${height - 18}" fill="${textClr}" font-size="10" font-family="sans-serif">${Math.abs(opts.lat).toFixed(4)} ${ns} ${Math.abs(opts.lon).toFixed(4)} ${ew}</text>`);
    pieces.push(`<text x="16" y="${height - 6}" fill="${textClr}" font-size="10" font-family="sans-serif">${opts.dateRaw} ${opts.timeRaw} UTC ${opts.utc}</text>`);
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
syncInfoInputToUppercase();
bindTimezoneRefreshHandlers();
setDownloadEnabled(false);
applyThemeColorDefaults(true);
bindThemeDefaultHandlers();
bindStarPointsToggle();

document.getElementById("coord")?.addEventListener("blur", async (ev) => {
  const v = ev?.target?.value;
  if (!v) return;
  const { lat, lon } = parseCoord(v);
  applyMapLocation(lat, lon, 8);
  await applyTimezoneForLocation(lat, lon);
});

document.getElementById("generate")?.addEventListener("click", async () => {
  try {
    setDownloadEnabled(false);

    const { lat, lon } = parseCoord(getValue("coord", "60.186,24.959"));

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
    const showBorder = getBool("show-border", false);
    const starShape = getBool("star-shape", false);
    const starPoints = normalizeStarPoints(getValue("star-points", "4"));

    const bgColor = getValue("bg-color", "");
    const starColor = getValue("star-color", "");
    const guideColor = getValue("guide-color", "");
    const constellationColor = getValue("constellation-color", "");
    const borderColor = getValue("border-color", "");
    const textColor = getValue("text-color", "");

    // Use manual input first, then fall back to last place label from map search
    const manualInfo = toUpperCity(getValue("info", ""));
    const infoText = manualInfo || LAST_PLACE_LABEL || "";
    console.log("infoText for SVG:", infoText, "| LAST_PLACE_LABEL:", LAST_PLACE_LABEL);

    const border = 14;
    const stars = await loadCatalog();
    const constellationSegments = constellation ? await loadConstellationSegments(stars) : [];

    const svg = buildSvg(stars, {
      lat, lon, utc, summertime, dateUtc, dateRaw, timeRaw,
      width, height,
      border,
      borders: border,
      magLimit, aperture, fullview, guides, constellation, constellationSegments,
      light, noInfo, infoText, showBorder, starShape, starPoints,
      bgColor, starColor, guideColor, constellationColor, borderColor, textColor
    });

    const preview = document.getElementById("preview");
    if (preview) preview.innerHTML = svg;

    setDownloadEnabled(true, svg);
  } catch (err) {
    console.error(err);
    setDownloadEnabled(false);
    alert(`Generate failed: ${err.message}`);
  }
});

async function fetchFirstText(paths) {
  for (const p of paths) {
    try {
      const res = await fetch(p, { cache: "no-cache" });
      if (res.ok) return await res.text();
    } catch {
      // try next path
    }
  }
  return null;
}

function generateGuidesPy(opts) {
  // Reuse precomputed projection params if provided
  const border = opts.border ?? opts.borders ?? 14;
  const proj = opts.proj ?? buildProjectionParams(
    opts.lat,
    opts.lon,
    opts.dateRaw,
    opts.timeRaw,
    opts.utc,
    opts.summertime,
    Math.min(opts.width, opts.height) / 2 - border,
    opts.width / 2,
    opts.height / 2
  );

  const dots = [];
  const brightness = 1.1;

  // Declination bands every 30°, RA sampled every 1°
  for (let decDeg = -90; decDeg < 90; decDeg += 30) {
    for (let raDeg = 0; raDeg < 360; raDeg++) {
      const ascension = degToRad(raDeg) + proj.raddatetime;
      const declination = degToRad(decDeg);
      const angle = pyAngleBetween(proj.N, proj.E, declination, ascension);
      if (angle > proj.maxAngle && !opts.fullview) continue;

      const { x, y } = pyStereographic(proj.N, proj.E, declination, ascension, proj.R);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      dots.push({ x: proj.cx - x, y: proj.cy - y, r: brightness * opts.aperture });
    }
  }

  // RA meridians every 1h, Dec sampled every 0.5°
  for (let hour = 0; hour < 24; hour++) {
    const raDeg = hour * 15;
    for (let d = -160; d < 160; d++) {
      const decDeg = d / 2.0;
      const ascension = degToRad(raDeg) + proj.raddatetime;
      const declination = degToRad(decDeg);
      const angle = pyAngleBetween(proj.N, proj.E, declination, ascension);
      if (angle > proj.maxAngle && !opts.fullview) continue;

      const { x, y } = pyStereographic(proj.N, proj.E, declination, ascension, proj.R);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      dots.push({ x: proj.cx - x, y: proj.cy - y, r: brightness * opts.aperture });
    }
  }

  return dots;
}

async function refreshTimezoneFromCurrentInputs() {
  try {
    const { lat, lon } = parseCoord(getValue("coord", ""));
    await applyTimezoneForLocation(lat, lon);
  } catch {
    // ignore until coord is valid
  }
}

function bindTimezoneRefreshHandlers() {
  const ids = ["datePicker", "timePicker", "date", "time"];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.addEventListener("blur", () => {
      refreshTimezoneFromCurrentInputs();
    });
  }
}

bindTimezoneRefreshHandlers();

function setDownloadEnabled(enabled, svg = "") {
  const download = document.getElementById("download");
  if (!download) return;

  if (enabled && svg) {
    download.href = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    download.download = "starmap.svg";
    download.setAttribute("aria-disabled", "false");
  } else {
    download.removeAttribute("href");
    download.setAttribute("aria-disabled", "true");
  }
}

function svgColor(value, fallback) {
  const v = String(value || "").trim();
  return v || fallback;
}

function starPath(cx, cy, outerR, innerR = outerR * 0.45, points = 4) {
  const step = Math.PI / points;
  let d = "";
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const a = -Math.PI / 2 + i * step;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    d += `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)} `;
  }
  return `${d}Z`;
}

function getThemeDefaults(isLight) {
  return {
    "bg-color": isLight ? "#ffffff" : "#2d3b62",
    "star-color": isLight ? "#0a0a0a" : "#ffffff",
    "guide-color": isLight ? "#7d89d8" : "#cfd6ff",
    "constellation-color": isLight ? "#0a0a0a" : "#ffffff",
    "border-color": isLight ? "#0a0a0a" : "#ffffff",
    "text-color": isLight ? "#0a0a0a" : "#ffffff",
  };
}

function applyThemeColorDefaults(force = false) {
  const light = getBool("light", false);
  const next = getThemeDefaults(light);
  const prev = getThemeDefaults(!light);

  for (const [id, value] of Object.entries(next)) {
    const el = document.getElementById(id);
    if (!el) continue;

    const current = String(el.value || "").toLowerCase();
    const prevValue = String(prev[id] || "").toLowerCase();

    if (force || !current || current === prevValue || el.dataset.autoTheme === "1") {
      el.value = value;
      el.dataset.autoTheme = "1";
    }
  }
}

function bindThemeDefaultHandlers() {
  const lightEl = document.getElementById("light");
  if (lightEl) {
    lightEl.addEventListener("change", () => {
      applyThemeColorDefaults(false);
    });
  }

  ["bg-color", "star-color", "guide-color", "constellation-color", "border-color", "text-color"].forEach((id) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", () => {
      el.dataset.autoTheme = "0";
    });
  });
}

bindThemeDefaultHandlers();

function syncStarPointsEnabled() {
  const starShapeEl = document.getElementById("star-shape");
  const starPointsEl = document.getElementById("star-points");
  if (!starShapeEl || !starPointsEl) return;

  const enabled = !!starShapeEl.checked;
  starPointsEl.disabled = !enabled;
  starPointsEl.setAttribute("aria-disabled", String(!enabled));
}

function bindStarPointsToggle() {
  const starShapeEl = document.getElementById("star-shape");
  if (!starShapeEl) return;
  starShapeEl.addEventListener("change", syncStarPointsEnabled);
  syncStarPointsEnabled(); // initialize on load
}