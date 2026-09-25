import { supabase, supabaseConfigured } from './supabase.js'

async function fetchDoctors(filters = {}) {
  let query = supabase
    .from('doctors')
    .select('*')
    .eq('city', filters.city || 'Varanasi');
  if (filters.specialty && filters.specialty !== 'all')
    query = query.overlaps('specialty', [filters.specialty]);
  if (filters.walkIn)
    query = query.eq('walk_in', true);
  if (filters.rating > 0)
    query = query.gte('rating', filters.rating);
  if (filters.language && filters.language !== 'all')
    query = query.contains('languages', [filters.language]);

  const { data, error } = await query
    .order('rating', { ascending: false });

  if (error) { console.error(error); loadFailed = true; return []; }
  return data;
}

async function fetchHospitals(filters = {}) {
  let query = supabase
    .from('hospitals')
    .select('*')
    .eq('city', filters.city || 'Varanasi');
  if (filters.specialty && filters.specialty !== 'all')
    query = query.contains('specialty', [filters.specialty]);
  const { data, error } = await query
    .order('distance_km', { ascending: true });
  if (error) { console.error(error); loadFailed = true; return []; }
  return data;
}

let USER_LAT = 25.31668000, USER_LNG = 83.01041000;

async function detectLocation() {
  if (!navigator.geolocation) {
    showToast("Geolocation not supported");
    return;
  }

  const locLabel = document.getElementById("locLabel");
  locLabel.textContent = "Detecting...";

  navigator.geolocation.getCurrentPosition(
    (position) => {
      USER_LAT = position.coords.latitude;
      USER_LNG = position.coords.longitude;

      const VARANASI_LAT = 25.3176;
      const VARANASI_LNG = 82.9739;

      const distance = getDistanceFromLatLonInKm(
        USER_LAT,
        USER_LNG,
        VARANASI_LAT,
        VARANASI_LNG
      );
      if (distance > 30) {
        showToast(
          "Your location is not currently supported. MediWay is available only in Varanasi."
        );
      }

      locLabel.textContent = "Current Location";

      if (mapInstance) {
        userMarker.setPosition({ lat: USER_LAT, lng: USER_LNG });
        mapInstance.flyTo({ center: [USER_LNG, USER_LAT], zoom: 14 });
      }

      console.log("User Location:", USER_LAT, USER_LNG);
    },
    (error) => {
      console.error(error);
      locLabel.textContent = "Location";
      showToast("Unable to access your location");
    },
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0
    }
  );
};

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371;

  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

let DOCTORS = [];
let loadFailed = false;
let HOSPITALS = [];
const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const DAY_FULL  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];

function timeToMins(t) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function fmtTime(t) {
  const [h, m] = t.split(':').map(Number);
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 || 12;
  return m === 0 ? `${h12} ${suffix}` : `${h12}:${String(m).padStart(2,'0')} ${suffix}`;
}

function getNowIST() {
  const now   = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60000;
  const ist   = new Date(utcMs + 330 * 60000);
  return {
    day:  ist.getDay(),
    mins: ist.getHours() * 60 + ist.getMinutes(),
  };
}

function getStatus(doctor) {
  const { day: today, mins: nowM } = getNowIST();

  for (const slot of doctor.schedule) {
    if (slot.days.includes(today)) {
      const openM  = timeToMins(slot.open);
      const closeM = timeToMins(slot.close);
      if (nowM >= openM && nowM < closeM) {
        return {
          open: true,
          label: `Open · closes ${fmtTime(slot.close)}`,
          nextSlot: `Today ${fmtTime(slot.open)}`,
        };
      }
    }
  }

  const laterToday = doctor.schedule
    .filter(s => s.days.includes(today) && timeToMins(s.open) > nowM)
    .sort((a, b) => timeToMins(a.open) - timeToMins(b.open));

  if (laterToday.length) {
    const next = laterToday[0];
    return {
      open: false,
      label: `Closed · opens ${fmtTime(next.open)}`,
      nextSlot: `Today ${fmtTime(next.open)}`,
    };
  }

  for (let delta = 1; delta <= 7; delta++) {
    const dayAhead = (today + delta) % 7;
    const slotsAhead = doctor.schedule
      .filter(s => s.days.includes(dayAhead))
      .sort((a, b) => timeToMins(a.open) - timeToMins(b.open));

    if (slotsAhead.length) {
      const next = slotsAhead[0];
      const dayLabel = delta === 1 ? 'Tomorrow' : DAY_NAMES[dayAhead];
      return {
        open: false,
        label: `Closed · opens ${dayLabel} ${fmtTime(next.open)}`,
        nextSlot: `${dayLabel} ${fmtTime(next.open)}`,
      };
    }
  }

  return { open: false, label: 'Closed today', nextSlot: 'Check back later' };
}

function scheduleText(doctor) {
  const groups = [];
  for (const slot of doctor.schedule) {
    const key = slot.days.join(',');
    const existing = groups.find(g => g.key === key);
    const range = `${fmtTime(slot.open)} – ${fmtTime(slot.close)}`;
    if (existing) existing.ranges.push(range);
    else groups.push({ key, days: slot.days, ranges: [range] });
  }

  return groups.map(g => {
    const sorted = [...g.days].sort((a,b) => a - b);
    let dayStr;
    if (sorted.length === 1) {
      dayStr = DAY_NAMES[sorted[0]];
    } else {
      const isConsec = sorted.every((d, i) => i === 0 || d === sorted[i-1] + 1);
      if (isConsec) {
        dayStr = `${DAY_NAMES[sorted[0]]}–${DAY_NAMES[sorted[sorted.length-1]]}`;
      } else {
        dayStr = sorted.map(d => DAY_NAMES[d]).join(', ');
      }
    }
    return `${dayStr}: ${g.ranges.join(', ')}`;
  }).join(' · ');
}

let filters = {
  type:'all', specialty:'all', language:'all',
  distance:20, rating:0,
  openNow:false, walkIn:false, english:false, insurance:false
};
let sortBy = 'rating', mapSortBy = 'rating', searchQuery = '', currentView = 'list';
let mapInstance = null, mapReady = null, userMarker = null, markers = {}, activeDir = null, dirMode = 'drive';

function mapsUrl(q)   { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q); }
function dirUrl(dest) { return 'https://www.google.com/maps/dir/?api=1&origin=' + USER_LAT + ',' + USER_LNG + '&destination=' + encodeURIComponent(dest); }

function starsHtml(r) {
  let s = '';
  for (let i = 1; i <= 5; i++)
    s += `<span class="text-[12px] ${i<=Math.round(r)?'text-[#F59E0B]':'text-[#D1D5DB]'}">★</span>`;
  return s;
}

function matchesSearchDoctor(d) {
  if (!searchQuery) return true;
  const q = searchQuery.toLowerCase();
  const specialtyStr = Array.isArray(d.specialty) ? d.specialty.join(' ') : (d.specialty || '');
  return d.name.toLowerCase().includes(q) ||
         specialtyStr.toLowerCase().includes(q) ||
         d.hospital.toLowerCase().includes(q);
}

function matchesSearchHospital(h) {
  if (!searchQuery) return true;
  const q = searchQuery.toLowerCase();
  const specialtyStr = Array.isArray(h.specialty) ? h.specialty.join(' ') : (h.specialty || '');
  return h.name.toLowerCase().includes(q) ||
         specialtyStr.toLowerCase().includes(q) ||
         (h.address || '').toLowerCase().includes(q);
}

function matchesFilters(d) {
  const status = getStatus(d);
  if (filters.type      !== 'all' && d.type !== filters.type)               return false;
  if (filters.specialty !== 'all' && !d.specialty?.includes(filters.specialty)) return false;
  if (filters.language  !== 'all' && !d.languages.includes(filters.language)) return false;
  if (d.distance_km > filters.distance)                                       return false;
  if (d.rating < filters.rating)                                             return false;
  if (filters.openNow   && !status.open)                                    return false;
  if (filters.walkIn    && !d.walk_in)                                        return false;
  if (filters.english   && !d.languages.includes('English'))                 return false;
  if (filters.insurance && !d.insurance)                                     return false;
  if (!matchesSearchDoctor(d))                                                return false;
  return true;
}

function sortDoctors(arr, by) {
  return [...arr].sort((a, b) => {
    if (by === 'rating')   return b.rating - a.rating;
    if (by === 'distance') return a.distance_km - b.distance_km;
    if (by === 'name')     return a.name.localeCompare(b.name);
    return 0;
  });
}

function simDirections(doc, mode) {
  const dist = doc.distance_km;
  const speeds = { drive:40, walk:5, transit:25 };
  const mins = Math.round((dist / speeds[mode]) * 60);
  const steps = {
    drive: [
      { icon:'↑',   text:'Head south on MG Road',          dist:'0.3 km' },
      { icon:'⟵',  text:'Turn right onto Residency Road',  dist:'1.2 km' },
      { icon:'⟶',  text:'Turn left onto Hospital Avenue',  dist:'0.8 km' },
      { icon:'📍',  text:`Arrive at ${doc.hospital}`,       dist:'' },
    ],
    walk: [
      { icon:'↑',   text:'Walk along the main road',             dist:'0.4 km' },
      { icon:'⟵',  text:'Cross at the pedestrian crossing',     dist:'0.2 km' },
      { icon:'📍',  text:`Arrive at ${doc.hospital}`,            dist:'' },
    ],
    transit: [
      { icon:'🚌',  text:'Board Bus 335 towards Silk Board',     dist:'3 stops' },
      { icon:'⬇',  text:'Alight at Hospital Circle',            dist:'' },
      { icon:'↑',   text:'Walk 200m to entrance',               dist:'0.2 km' },
      { icon:'📍',  text:`Arrive at ${doc.hospital}`,            dist:'' },
    ],
  };
  return { mins, steps: steps[mode] || steps.drive };
}

// ---------- Map (Mappls / MapmyIndia) ----------
// Mappls renders India's boundaries as per the Survey of India, which OSM-based tiles don't.
// Under the hood it's a MapLibre-compatible map, so camera methods, GeoJSON layers,
// markers and popups follow the MapLibre API.

const MAPPLS_KEY = import.meta.env.VITE_MAPPLS_KEY;
const MAPPLS_SDK_URLS = [
  `https://sdk.mappls.com/map/sdk/web?v=3.0&access_token=${MAPPLS_KEY}`,              // static keys (Aug 2025+ auth)
  `https://apis.mappls.com/advancedmaps/api/${MAPPLS_KEY}/map_sdk?v=3.0&layer=vector`, // legacy keys
];

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = resolve;
    el.onerror = () => { el.remove(); reject(new Error('Failed to load ' + src.split('?')[0])); };
    document.head.appendChild(el);
  });
}

// The SDK is ~1.4 MB: only fetch it the first time the map view opens.
async function loadMappls() {
  if (window.mappls?.Map) return;
  if (!MAPPLS_KEY) throw new Error('VITE_MAPPLS_KEY is not set');
  for (const url of MAPPLS_SDK_URLS) {
    try { await loadScript(url); if (window.mappls?.Map) return; } catch { /* try the next auth scheme */ }
  }
  throw new Error('Mappls SDK could not be loaded — check the key and its whitelisted domains');
}

function ensureMap() {
  mapReady ??= (async () => {
    await loadMappls();

    mapInstance = new mappls.Map('map', {
      center: { lat: USER_LAT, lng: USER_LNG },
      zoom: 13,
      backgroundColor: '#F3ECE4',
      // Our own controls sit on top of the map
      zoomControl: false,
      fullscreenControl: false,
      rotateControl: false,
      scaleControl: false,
      traffic: false,
      geolocation: false,
      location: false,
      clickableIcons: false,
    });

    // Phones: the map is stacked in a scrolling page, so pan with two fingers only
    // (what MapLibre's cooperativeGestures does internally).
    if (window.matchMedia('(max-width: 767px) and (pointer: coarse)').matches) {
      const touchPan = mapInstance.handlers?._handlersById?.touchPan;
      if (touchPan) {
        touchPan._minTouches = 2;
        const hint = document.getElementById('mapGestureHint');
        let hideHint;
        mapInstance.getContainer().addEventListener('touchmove', e => {
          if (e.touches.length !== 1) return;
          hint.classList.remove('opacity-0');
          clearTimeout(hideHint);
          hideHint = setTimeout(() => hint.classList.add('opacity-0'), 1200);
        }, { passive: true });
      }
    }

    userMarker = new mappls.Marker({
      map: mapInstance,
      position: { lat: USER_LAT, lng: USER_LNG },
      html: '<div class="mw-user"></div>',
      width: 22,
      height: 22,
      popupHtml: '<div class="text-[13px] font-semibold text-[#1E293B]">You are here</div>',
      popupOptions: { offset: [0, -14], closeButton: false },
    });

    // Zoomed out past city level, 20 full pins pile into one blob over the region: shrink them to dots
    const syncPinScale = () => mapInstance.getContainer().classList.toggle('mw-far', mapInstance.getZoom() < 10);
    mapInstance.addListener('zoom', syncPinScale);
    syncPinScale();

    styleReady = new Promise(res => {
      if (mapInstance.loaded()) res(); else mapInstance.addListener('load', res);
    }).then(() => {
      addRouteLayers();
      document.getElementById('mapLoading')?.classList.add('opacity-0', 'pointer-events-none');
    });
    return mapInstance;
  })();
  return mapReady;
}

let styleReady = null;

// Older GL engine under Mappls: no data-driven line-dasharray, so solid and dashed are separate layers.
function addRouteLayers() {
  mapInstance.addSource('route', { type: 'geojson', data: emptyFeatureCollection() });
  const layout = { 'line-cap': 'round', 'line-join': 'round' };
  mapInstance.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout,
    paint: { 'line-color': '#FFFFFF', 'line-width': 9 } });
  mapInstance.addLayer({ id: 'route-line', type: 'line', source: 'route', layout,
    filter: ['!=', ['get', 'approx'], true],
    paint: { 'line-color': '#D0423A', 'line-width': 5 } });
  mapInstance.addLayer({ id: 'route-line-approx', type: 'line', source: 'route', layout,
    filter: ['==', ['get', 'approx'], true],
    paint: { 'line-color': '#D0423A', 'line-width': 5, 'line-dasharray': [1, 1.6] } });
}

// [[lng, lat], ...] -> [[west, south], [east, north]]
function boundsOf(points) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [lng, lat] of points) {
    w = Math.min(w, lng); e = Math.max(e, lng);
    s = Math.min(s, lat); n = Math.max(n, lat);
  }
  return [[w, s], [e, n]];
}

function emptyFeatureCollection() { return { type: 'FeatureCollection', features: [] }; }
function hasCoords(p) { return Number.isFinite(+p.lat) && Number.isFinite(+p.lng); }

function doctorPopupHtml(d) {
  const status = getStatus(d);
  const specialty = Array.isArray(d.specialty) ? d.specialty.join(', ') : d.specialty;
  return `
    <div class="w-[236px]">
      <div class="flex items-center gap-2.5">
        <div class="w-10 h-10 rounded-[11px] shrink-0 flex items-center justify-center text-[14px] font-serif text-white" style="background:${d.avatar_bg};">${d.initials}</div>
        <div class="min-w-0">
          <div class="font-serif text-[16px] leading-tight text-[#1E293B] truncate">${d.name}</div>
          <div class="text-[12px] text-[#D0423A] font-medium truncate">${specialty}</div>
        </div>
      </div>
      <div class="flex items-center flex-wrap gap-1.5 mt-2.5 text-[11px]">
        <span class="font-medium px-2 py-[3px] rounded-md ${status.open ? 'bg-[#F0FDF4] text-[#16A34A]' : 'bg-[#F1F5F9] text-[#64748B]'}">${status.open ? '●' : '○'} ${status.label}</span>
        <span class="text-[#64748B]"><span class="text-[#F59E0B]">★</span> ${d.rating ?? '—'}${d.distance_km != null ? ` · ${d.distance_km} km` : ''}</span>
      </div>
      <div class="text-[11px] text-[#94A3B8] mt-1.5 truncate">${d.hospital}</div>
      <div class="flex gap-1.5 mt-3">
        <button class="flex-1 py-2 rounded-lg text-[12px] font-semibold border-none cursor-pointer bg-[#D0423A] hover:bg-[#B8362F] text-white font-sans transition-colors" onclick="openDir(${d.id})">Directions</button>
        <a class="flex-1 py-2 rounded-lg text-[12px] font-semibold border-[1.5px] border-[#E2E8F0] hover:border-[#1E293B] bg-white text-[#1E293B] no-underline flex items-center justify-center font-sans transition-colors" href="profile.html?id=${d.id}">Profile</a>
      </div>
    </div>`;
}

function hospitalPopupHtml(h) {
  return `
    <div class="w-[220px]">
      <div class="font-serif text-[16px] leading-tight text-[#1E293B]">${h.name}</div>
      <div class="text-[11px] text-[#64748B] mt-1 leading-snug">${h.address}</div>
      <div class="text-[11px] mt-2 font-medium">${h.er24 ? '<span class="text-[#16A34A]">● ER open 24/7</span>' : '<span class="text-[#94A3B8]">○ No 24/7 ER</span>'}${h.distance_km != null ? `<span class="text-[#64748B] font-normal"> · ${h.distance_km} km</span>` : ''}</div>
      <a class="mt-3 block text-center py-2 rounded-lg text-[12px] font-semibold bg-[#D0423A] hover:bg-[#B8362F] text-white no-underline transition-colors" href="${dirUrl(h.name + ' ' + h.address)}" target="_blank">Open in Maps</a>
    </div>`;
}

function renderMapMarkers() {
  if (!mapInstance) return;
  Object.values(markers).forEach(m => mappls.remove({ map: mapInstance, layer: m }));
  markers = {};

  HOSPITALS.filter(matchesSearchHospital).filter(hasCoords).forEach(h => {
    markers['h' + h.id] = new mappls.Marker({
      map: mapInstance,
      position: { lat: +h.lat, lng: +h.lng },
      html: '<div class="mw-hospital"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg></div>',
      width: 30,
      height: 30,
      popupHtml: hospitalPopupHtml(h),
      popupOptions: { offset: [0, -18], maxWidth: 'none' },
    });
  });

  DOCTORS.filter(matchesFilters).filter(hasCoords).forEach(d => {
    // The SDK owns the wrapper's transform, so the rotated pin lives one level down.
    // Markers are centre-anchored: shift up by half the 44px height so the tip sits on the spot.
    const marker = new mappls.Marker({
      map: mapInstance,
      position: { lat: +d.lat, lng: +d.lng },
      html: `<div class="mw-pin-wrap"><div class="mw-pin${getStatus(d).open ? '' : ' is-closed'}"><span>${d.initials}</span></div></div>`,
      width: 38,
      height: 44,
      offset: [0, -22],
      popupHtml: doctorPopupHtml(d),
      popupOptions: { offset: [0, -48], maxWidth: 'none' },
    });
    marker.getElement().addEventListener('click', () => highlightMapCard(d.id));
    markers['d' + d.id] = marker;
  });
}

function setActivePin(id) {
  Object.entries(markers).forEach(([key, m]) =>
    m.getElement().querySelector('.mw-pin')?.classList.toggle('is-active', key === 'd' + id));
}

function highlightMapCard(id) {
  document.querySelectorAll('.map-card').forEach(c => c.classList.remove('active'));
  const el = document.querySelector(`.map-card[data-id="${id}"]`);
  if (el) { el.classList.add('active'); el.scrollIntoView({ behavior:'smooth', block:'nearest' }); }
  setActivePin(id);
}

function fitToResults({ animate = true } = {}) {
  if (!mapInstance) return;
  const bounds = boundsOf([[USER_LNG, USER_LAT], ...Object.values(markers).map(m => { const p = m.getLngLat(); return [p.lng, p.lat]; })]);
  // Pins are anchored at their tip and stand ~44px tall; the legend and controls sit on top / right
  mapInstance.fitBounds(bounds, { padding: { top: 100, bottom: 40, left: 48, right: 72 }, maxZoom: 15, animate });
}

function centerMap() {
  if (!mapInstance) return;
  mapInstance.flyTo({ center: [USER_LNG, USER_LAT], zoom: 14 });
}

function zoomMap(delta) {
  if (mapInstance) mapInstance.easeTo({ zoom: mapInstance.getZoom() + delta, duration: 250 });
}

// Road geometry from the public OSRM demo server; falls back to a dashed straight line.
async function fetchRoute(d) {
  const url = `https://router.project-osrm.org/route/v1/driving/${USER_LNG},${USER_LAT};${d.lng},${d.lat}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    const route = json.routes?.[0];
    if (!route) throw new Error(json.code || 'no route');
    return { geometry: route.geometry, minutes: Math.round(route.duration / 60), km: route.distance / 1000, approx: false };
  } catch (err) {
    console.warn('Routing unavailable, drawing straight line:', err);
    return { geometry: { type: 'LineString', coordinates: [[USER_LNG, USER_LAT], [+d.lng, +d.lat]] }, minutes: null, km: null, approx: true };
  }
}

// Keep the route clear of the directions drawer: a floating panel on the left from md,
// a bottom sheet below that. offset* ignores the slide-in transform, so this is safe mid-animation.
function routePadding() {
  const pad = { top: 100, right: 72, bottom: 60, left: 60 }; // top: room for the ~44px destination pin
  const drawer = document.getElementById('dirDrawer');
  const map = mapInstance.getContainer().getBoundingClientRect();
  const { offsetLeft: left, offsetTop: top, offsetWidth: w } = drawer;
  if (window.matchMedia('(min-width: 768px)').matches) {
    pad.left = Math.max(pad.left, left + w - map.left + 40);
  } else {
    pad.bottom = Math.max(pad.bottom, map.bottom - top + 40);
  }
  // fitBounds refuses padding that leaves no room; fall back to the defaults then
  if (pad.left + pad.right > map.width - 80) pad.left = 60;
  // Give up pin headroom before giving up the sheet's clearance
  if (pad.top + pad.bottom > map.height - 80) pad.top = 40;
  if (pad.top + pad.bottom > map.height - 80) pad.bottom = 60;
  return pad;
}

async function drawRoute(d) {
  if (!mapInstance || !hasCoords(d)) return;
  const [route] = await Promise.all([fetchRoute(d), styleReady]);
  if (activeDir !== d) return; // drawer was closed or switched meanwhile
  mapInstance.getSource('route').setData({
    type: 'Feature', properties: { approx: route.approx }, geometry: route.geometry,
  });
  if (route.minutes != null) {
    // Driving time is OSRM's; walk/transit reuse simDirections' speeds but on the real road distance
    // (distance_km is missing for some doctors, which made those read "0 min").
    const fmt = mins => { const h = Math.floor(mins / 60), m = mins % 60; return h > 0 ? `${h}h ${m}m` : `${m} min`; };
    document.getElementById('modeTimeDrive').textContent = fmt(route.minutes);
    document.getElementById('modeTimeWalk').textContent = fmt(Math.round(route.km / 5 * 60));
    document.getElementById('modeTimeTransit').textContent = fmt(Math.round(route.km / 25 * 60));
  }
  mapInstance.fitBounds(boundsOf(route.geometry.coordinates), { padding: routePadding(), maxZoom: 16 });
  setActivePin(d.id);
}

function openDir(docId) {
  const d = DOCTORS.find(x => x.id === docId);
  if (!d) return;
  activeDir = d;
  document.getElementById('dirDest').textContent = d.hospital;
  document.getElementById('dirAddr').textContent  = d.hospital_address;
  document.getElementById('dirGmapsLink').href    = dirUrl(d.hospital + ' ' + d.hospital_address);

  ['drive','walk','transit'].forEach(m => {
    const { mins } = simDirections(d, m);
    const h = Math.floor(mins / 60), min = mins % 60;
    document.getElementById('modeTime' + m.charAt(0).toUpperCase() + m.slice(1)).textContent =
      h > 0 ? `${h}h ${min}m` : `${min} min`;
  });

  dirMode = 'drive';
  document.querySelectorAll('.dir-mode-btn').forEach((b, i) => {
    const on = i === 0;
    b.classList.toggle('border-[#D0423A]', on);
    b.classList.toggle('bg-[#FDECEA]', on);
    b.classList.toggle('border-[#E2E8F0]', !on);
    b.classList.toggle('bg-white', !on);
  });
  renderDirSteps(d, dirMode);

  document.getElementById('dirDrawer').classList.remove('translate-y-[120%]');
  if (mapInstance && currentView === 'map' && !window.matchMedia('(min-width: 768px)').matches) {
    // Phones: the map is stacked in the page, so bring it up under the sticky nav before
    // measuring how much of it the bottom sheet covers.
    const navBottom = document.querySelector('nav').getBoundingClientRect().bottom;
    window.scrollTo({ top: window.scrollY + mapInstance.getContainer().getBoundingClientRect().top - navBottom, behavior: 'instant' });
  }
  if (mapInstance && currentView === 'map') {
    Object.values(markers).forEach(m => m.getPopup()?.isOpen() && m.togglePopup());
    drawRoute(d);
  }
}

function renderDirSteps(d, mode) {
  const { steps } = simDirections(d, mode);
  document.getElementById('dirSteps').innerHTML = steps.map(s => `
    <div class="flex gap-3 py-[9px] border-b border-[#E2E8F0] last:border-b-0">
      <div class="w-7 h-7 rounded-[7px] bg-slate-100 flex items-center justify-center shrink-0 mt-0.5 text-[14px]">${s.icon}</div>
      <div>
        <div class="text-[13px] text-[#1E293B] leading-[1.5]">${s.text}</div>
        ${s.dist ? `<div class="text-[11px] text-[#94A3B8] mt-0.5">${s.dist}</div>` : ''}
      </div>
    </div>`).join('');
}

function selectMode(mode, btn) {
  dirMode = mode;
  document.querySelectorAll('.dir-mode-btn').forEach(b => {
    b.classList.remove('border-[#D0423A]','bg-[#FDECEA]');
    b.classList.add('border-[#E2E8F0]','bg-white');
    b.querySelector('span.text-\\[11px\\]').style.color = '#64748B';
  });
  btn.classList.add('border-[#D0423A]','bg-[#FDECEA]');
  btn.classList.remove('border-[#E2E8F0]','bg-white');
  btn.querySelector('span.text-\\[11px\\]').style.color = '#D0423A';
  if (activeDir) renderDirSteps(activeDir, mode);
}

function closeDir() {
  document.getElementById('dirDrawer').classList.add('translate-y-[120%]');
  activeDir = null;
  mapInstance?.getSource('route')?.setData(emptyFeatureCollection());
}

let NO_RESULTS_HTML = null;

function renderDoctors() {
  NO_RESULTS_HTML ??= document.getElementById('noResults').innerHTML;
  const filtered = sortDoctors(DOCTORS.filter(matchesFilters), sortBy);
  const grid  = document.getElementById('doctorGrid');
  const noRes = document.getElementById('noResults');
  const label = document.getElementById('doctorLabel');
  document.getElementById('resultCount').textContent = filtered.length;

  if (filtered.length === 0) {
    grid.innerHTML = ''; noRes.classList.remove('hidden'); label.style.display = 'none';
    noRes.innerHTML = loadFailed ? `
      <p class="text-[32px] mb-3">⚠️</p>
      <p class="font-serif text-[22px] mb-2">Couldn’t load results</p>
      <p class="text-[14px] text-[#64748B]">Something went wrong reaching our servers. Please try again in a moment.</p>
      <button onclick="applyFilters()" class="mt-4 bg-[#D0423A] text-white border-none px-6 py-2.5 rounded-[10px] text-[14px] font-semibold cursor-pointer font-sans">Try again</button>`
    : NO_RESULTS_HTML;
    return;
  }
  noRes.classList.add('hidden'); label.style.display = '';
  label.textContent = `Doctors · ${filtered.length} result${filtered.length !== 1 ? 's' : ''}`;

  grid.innerHTML = filtered.map((d, i) => {
    const displayRating = d.rating ?? d.google_rating ?? '—';
    const displayReviews = d.reviews ?? d.google_reviews ?? 0;
    const status = getStatus(d);
    const timings = scheduleText(d);
    return `
    <div class="animate-fadeUp bg-white border border-[#E2E8F0] ${d.featured ? 'border-[#D0423A] shadow-[0_0_0_1px_#D0423A,0_4px_16px_rgba(208,66,58,.08)]' : ''} rounded-2xl p-4 sm:p-5 flex gap-3 sm:gap-4 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_rgba(0,0,0,.07)] hover:border-slate-300 transition-all cursor-default mb-3" style="animation-delay:${i*.05}s;" id="card-${d.id}">
      <div class="w-12 h-12 sm:w-16 sm:h-16 rounded-[14px] shrink-0 flex items-center justify-center text-[18px] sm:text-[22px] font-serif text-white" style="background:${d.avatar_bg};">${d.initials}</div>
      <div class="flex-1 min-w-0">
        <div class="flex items-start justify-between gap-2 mb-[3px]">
          <div class="min-w-0">
            <p class="font-serif text-[16px] sm:text-[18px] text-[#1E293B] leading-[1.2]">${d.name}</p>
            <p class="text-[13px] text-[#D0423A] font-medium mb-[5px]">${Array.isArray(d.specialty) ? d.specialty.join(', ') : d.specialty}</p>
          </div>
          <div class="flex gap-1.5 items-center shrink-0">
            ${d.featured ? '<span class="bg-[#D0423A] text-white text-[10px] font-bold uppercase tracking-[.06em] px-2 py-[3px] rounded-[6px] shrink-0">Top Pick</span>' : ''}
            <button class="bookmark-btn bg-transparent border-[1.5px] border-[#E2E8F0] rounded-lg w-8 h-8 flex items-center justify-center cursor-pointer text-[#94A3B8] hover:border-[#D0423A] hover:text-[#D0423A] transition-all shrink-0" onclick="toggleBookmark(this,'${d.name}')" title="Save">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            </button>
          </div>
        </div>
        <p class="text-[13px] text-[#64748B] mb-2 flex items-center gap-[5px]">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C8.134 2 5 5.134 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.866-3.134-7-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>
          ${d.hospital} · ${d.distance_km} km away
        </p>
        <p class="text-[12px] text-[#94A3B8] mb-2.5 flex items-center gap-[5px]">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          ${timings}
        </p>
        <div class="flex flex-wrap gap-1.5 mb-3">
          <span class="text-[11px] font-medium px-[9px] py-[3px] rounded-[6px] ${status.open ? 'bg-[#F0FDF4] text-[#16A34A]' : 'bg-[#F1F5F9] text-[#64748B]'}">
            ${status.open ? '●' : '○'} ${status.label}
          </span>
          ${d.walk_in    ? '<span class="text-[11px] font-medium px-[9px] py-[3px] rounded-[6px] bg-[#EFF6FF] text-[#2563EB]">Walk-ins OK</span>' : ''}
          ${d.insurance ? '<span class="text-[11px] font-medium px-[9px] py-[3px] rounded-[6px] bg-[#EFF6FF] text-[#2563EB]">Insurance OK</span>' : ''}
          <span class="text-[11px] font-medium px-[9px] py-[3px] rounded-[6px] bg-slate-100 text-[#64748B]">${d.languages.join(' · ')}</span>
          <span class="text-[11px] font-medium px-[9px] py-[3px] rounded-[6px] bg-slate-100 text-[#64748B]">${d.experience} yrs exp.</span>
        </div>
        <div class="flex items-center justify-between gap-3 flex-wrap pt-3 border-t border-[#E2E8F0]">
          <div class="flex items-center gap-3.5 flex-wrap">
            <div class="flex items-center gap-[5px] text-[12px] text-[#64748B]">
              <div class="flex gap-0.5">${starsHtml(displayRating)}</div>
              <span>${displayRating} (${displayReviews})</span>
            </div>
            <div class="flex items-center gap-[5px] text-[12px] text-[#64748B]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Next: ${status.nextSlot}
            </div>
          </div>
          <div class="flex gap-2 flex-wrap">
            <button onclick="openDir(${d.id})" class="bg-white text-[#1E293B] border-[1.5px] border-[#E2E8F0] px-3.5 py-[7px] rounded-[9px] text-[13px] font-medium cursor-pointer hover:border-[#D0423A] hover:text-[#D0423A] hover:bg-[#FDECEA] transition-all font-sans flex items-center gap-[5px]">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
              Directions
            </button>
            <a href="profile.html?id=${d.id}" class="bg-white text-[#1E293B] border-[1.5px] border-[#E2E8F0] px-3.5 py-[7px] rounded-[9px] text-[13px] font-medium cursor-pointer hover:border-[#1E293B] transition-all font-sans flex items-center gap-[5px] no-underline">
              View Profile
            </a>
            <button onclick="showToast('Booking ${d.name}...')" class="bg-[#D0423A] hover:bg-[#B8362F] text-white border-none px-[18px] py-2 rounded-[9px] text-[13px] font-semibold cursor-pointer transition-colors font-sans">
              Book →
            </button>
          </div>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderHospitals() {
  const filtered = HOSPITALS.filter(matchesSearchHospital);
  const grid = document.getElementById('hospitalGrid');
  grid.innerHTML = filtered.map((h, i) => `
    <div class="animate-fadeUp bg-white border border-[#E2E8F0] rounded-2xl px-5 py-[18px] flex items-center gap-3.5 cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(0,0,0,.06)] hover:border-slate-300 transition-all" style="animation-delay:${i*.05}s;" onclick="window.open('${dirUrl(h.name+' '+h.address)}','_blank')">
      <div class="w-12 h-12 rounded-xl bg-[#FEF2F2] flex items-center justify-center shrink-0">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="#D0423A"><path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm-7 14H8v-4h4v4zm0-6H8V7h4v4zm4 6h-2v-2h2v2zm0-4h-2v-2h2v2zm0-4h-2V7h2v4z"/></svg>
      </div>
      <div class="flex-1 min-w-0">
        <p class="text-[14px] font-semibold text-[#1E293B] break-words">${h.name}</p>
        <p class="text-[12px] text-[#64748B]">${h.distance_km} km · ${h.address.split(',')[0]}</p>
        <p class="text-[11px] font-medium mt-0.5 ${h.er24?'text-[#16A34A]':'text-[#64748B]'}">${h.er24?'● ER open 24/7':'○ No 24/7 ER'}</p>
      </div>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#94A3B8" stroke-width="2"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
    </div>`).join('');
}

function renderMapCards() {
  const filtered = sortDoctors(DOCTORS.filter(matchesFilters), mapSortBy);
  const container = document.getElementById('mapCards');
  if (filtered.length === 0) {
    container.innerHTML = '<div class="p-6 text-center text-[#64748B] text-[13px]">No results match your filters</div>';
    return;
  }
  container.innerHTML = filtered.map(d => {
    const status = getStatus(d);
    return `
    <div class="map-card bg-white border border-[#E2E8F0] rounded-xl p-3.5 flex gap-3 cursor-pointer hover:border-[#D0423A] hover:shadow-[0_2px_12px_rgba(208,66,58,.12)] transition-all" data-id="${d.id}" onclick="focusDoctor(${d.id})" onmouseenter="setActivePin(${d.id})" onmouseleave="setActivePin(null)">
      <div class="w-11 h-11 rounded-[10px] shrink-0 flex items-center justify-center text-[14px] font-serif text-white" style="background:${d.avatar_bg};">${d.initials}</div>
      <div class="flex-1 min-w-0">
        <div class="font-semibold text-[14px] text-[#1E293B] leading-[1.3] mb-[1px]">${d.name}</div>
        <div class="text-[12px] text-[#D0423A] font-medium">${Array.isArray(d.specialty) ? d.specialty.join(', ') : d.specialty}</div>
        <div class="text-[11px] mt-1 ${status.open?'text-[#16A34A]':'text-[#64748B]'}">
          ${status.open ? '●' : '○'} ${status.label}
        </div>
        <div class="text-[11px] text-[#94A3B8] mt-[2px]">Next: ${status.nextSlot}</div>
        <div class="flex items-center justify-between mt-2">
          <div class="flex items-center gap-[3px] text-[11px] text-[#64748B]">${starsHtml(d.rating)}<span class="ml-[3px]">${d.rating}</span></div>
          <a href="profile.html?id=${d.id}" class="bg-white text-[#1E293B] border-[1.5px] border-[#E2E8F0] text-[12px] font-medium px-2.5 py-[5px] rounded-[9px] cursor-pointer flex items-center gap-[5px] hover:border-[#D0423A] hover:text-[#D0423A] transition-all font-sans no-underline">View</a>
        </div>
      </div>
    </div>`;
  }).join('');
}

function focusDoctor(id) {
  const d = DOCTORS.find(x => x.id === id);
  if (!d || !mapInstance || !hasCoords(d)) return;
  mapInstance.flyTo({ center: [+d.lng, +d.lat], zoom: Math.max(mapInstance.getZoom(), 15), duration: 700 });
  Object.entries(markers).forEach(([key, m]) => {
    const open = m.getPopup()?.isOpen();
    if ((key === 'd' + id) !== !!open) m.togglePopup();
  });
  highlightMapCard(id);
}

function setView(v) {
  currentView = v;
  const listView = document.getElementById('listView');
  const mapView  = document.getElementById('mapView');
  const vtList   = document.getElementById('vt-list');
  const vtMap    = document.getElementById('vt-map');
  const pageWrap = document.getElementById('pageWrap');
  if (v === 'list') {
    listView.classList.remove('hidden');
    mapView.classList.add('hidden');
    vtList.classList.add('bg-white','text-[#1E293B]','shadow-sm');
    vtList.classList.remove('bg-transparent','text-[#64748B]');
    vtMap.classList.remove('bg-white','text-[#1E293B]','shadow-sm');
    vtMap.classList.add('bg-transparent','text-[#64748B]');
    pageWrap.classList.remove('map-mode');
  } else {
    mapView.classList.remove('hidden');
    listView.classList.add('hidden');
    vtMap.classList.add('bg-white','text-[#1E293B]','shadow-sm');
    vtMap.classList.remove('bg-transparent','text-[#64748B]');
    vtList.classList.remove('bg-white','text-[#1E293B]','shadow-sm');
    vtList.classList.add('bg-transparent','text-[#64748B]');
    pageWrap.classList.add('map-mode');
    renderMapCards();
    const firstOpen = !mapInstance;
    ensureMap().then(() => {
      mapInstance.resize();
      renderMapMarkers();
      if (activeDir) drawRoute(activeDir);
      else if (firstOpen) fitToResults({ animate: false });
    }).catch(err => {
      console.error('Map failed to load:', err);
      document.getElementById('mapLoading').innerHTML = '<p class="text-[13px] text-[#64748B]">Map couldn\u2019t load. Check your connection and try again.</p>';
    });
  }
}

async function setFilter(key, value, btn) {
  filters[key] = value;
  if (btn) {
    btn.closest('[id$="Filter"]').querySelectorAll('.chip').forEach(c => {
      c.classList.remove('active','border-[#D0423A]','bg-[#FDECEA]','text-[#D0423A]','font-medium');
      c.classList.add('border-[#E2E8F0]','bg-white','text-[#64748B]');
    });
    btn.classList.add('active','border-[#D0423A]','bg-[#FDECEA]','text-[#D0423A]','font-medium');
    btn.classList.remove('border-[#E2E8F0]','bg-white','text-[#64748B]');
  }
  await loadData({ ...filters });
}

async function toggleOption(key, row) {
  filters[key] = !filters[key];
  row.querySelector('.toggle').classList.toggle('on', filters[key]);
  await loadData({ ...filters });
}

function setSort(key, btn) {
  sortBy = key;
  document.querySelectorAll('.sort-tab').forEach(t => {
    t.classList.remove('bg-[#1E293B]','border-[#1E293B]','text-white');
    t.classList.add('bg-white','border-[#E2E8F0]','text-[#64748B]');
  });
  btn.classList.add('bg-[#1E293B]','border-[#1E293B]','text-white');
  btn.classList.remove('bg-white','border-[#E2E8F0]','text-[#64748B]');
  document.getElementById('sortedLabel').textContent =
    { rating:'Sorted by rating', distance:'Sorted by distance', name:'Sorted A – Z' }[key];
  render();
}

function setMapSort(key, btn) {
  mapSortBy = key;
  document.querySelectorAll('.map-sort-btn').forEach(b => {
    b.classList.remove('bg-[#1E293B]','border-[#1E293B]','text-white');
    b.classList.add('bg-white','border-[#E2E8F0]','text-[#64748B]');
  });
  btn.classList.add('bg-[#1E293B]','border-[#1E293B]','text-white');
  btn.classList.remove('bg-white','border-[#E2E8F0]','text-[#64748B]');
  renderMapCards();
}

async function resetFilters() {
  filters = { type:'all', specialty:'all', language:'all', distance:20, rating:0, openNow:false, walkIn:false, english:false, insurance:false };
  searchQuery = '';
  document.getElementById('searchInput').value = '';
  document.querySelectorAll('.chip').forEach(c => {
    const isDefault = c.dataset.value === 'all' || c.dataset.value === '0';
    if (isDefault) {
      c.classList.add('active','border-[#D0423A]','bg-[#FDECEA]','text-[#D0423A]','font-medium');
      c.classList.remove('border-[#E2E8F0]','bg-white','text-[#64748B]');
    } else {
      c.classList.remove('active','border-[#D0423A]','bg-[#FDECEA]','text-[#D0423A]','font-medium');
      c.classList.add('border-[#E2E8F0]','bg-white','text-[#64748B]');
    }
  });
  document.querySelectorAll('.toggle').forEach(t => t.classList.remove('on'));
  document.getElementById('distVal').textContent = '20 km';
  document.querySelector('input[type=range]').value = 20;

  await loadData();
  showToast('Filters reset');
}

function toggleBookmark(btn, name) {
  const saved = btn.classList.toggle('saved');
  btn.innerHTML = saved
    ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>'
    : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
  showToast(saved ? `Saved ${name}` : `Removed ${name}`);
}

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('opacity-0', 'translate-y-4', 'pointer-events-none');
  t.classList.add('opacity-100', 'translate-y-0');
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => {
    t.classList.remove('opacity-100', 'translate-y-0');
    t.classList.add('opacity-0', 'translate-y-4', 'pointer-events-none');
  }, 2500);
}

function render() {
  renderDoctors(); renderHospitals();
  if (currentView === 'map') { renderMapMarkers(); renderMapCards(); }
}

// Filter sidebar is collapsed by default below md, where it would otherwise
// push the results a full screen down.
function toggleFilters() {
  const sidebar = document.getElementById('filterSidebar');
  const open = sidebar.classList.toggle('hidden') === false;
  document.getElementById('filterToggle').classList.toggle('border-[#D0423A]', open);
  document.getElementById('filterToggle').classList.toggle('text-[#D0423A]', open);
  if (open) sidebar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

document.getElementById('searchInput').addEventListener('input', e => {
  searchQuery = e.target.value.trim();
  render();
});

document.getElementById('searchInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') e.preventDefault();
});

function skeletonCard() {
  return `
    <div class="bg-white border border-[#E2E8F0] rounded-2xl p-4 sm:p-5 flex gap-3 sm:gap-4 mb-3 animate-pulse">
      <div class="w-12 h-12 sm:w-16 sm:h-16 rounded-[14px] bg-[#EEF2F6] shrink-0"></div>
      <div class="flex-1 space-y-2.5 py-1">
        <div class="h-4 bg-[#EEF2F6] rounded w-2/5"></div>
        <div class="h-3 bg-[#EEF2F6] rounded w-3/5"></div>
        <div class="h-3 bg-[#EEF2F6] rounded w-1/3"></div>
      </div>
    </div>`;
}

function showLoading() {
  document.getElementById('resultCount').textContent = '…';
  document.getElementById('noResults').classList.add('hidden');
  const label = document.getElementById('doctorLabel');
  label.style.display = ''; label.textContent = 'Doctors';
  document.getElementById('doctorGrid').innerHTML = skeletonCard().repeat(4);
  document.getElementById('hospitalGrid').innerHTML = `
    <div class="bg-white border border-[#E2E8F0] rounded-2xl h-[86px] animate-pulse"></div>`.repeat(2);
}

async function loadData(f = {}) {
  showLoading();
  loadFailed = !supabaseConfigured;
  if (supabaseConfigured) {
    [DOCTORS, HOSPITALS] = await Promise.all([fetchDoctors(f), fetchHospitals(f)]);
  } else {
    DOCTORS = []; HOSPITALS = [];
  }
  render();
}

function init() { return loadData(); }
init();

function applyFilters() { return loadData({ ...filters }); }

window.setFilter = setFilter;
window.setSort = setSort;
window.setMapSort = setMapSort;
window.setView = setView;
window.toggleOption = toggleOption;
window.openDir = openDir;
window.closeDir = closeDir;
window.selectMode = selectMode;
window.centerMap = centerMap;
window.applyFilters = applyFilters;
window.resetFilters = resetFilters;
window.detectLocation = detectLocation;
window.toggleBookmark = toggleBookmark;
window.toggleFilters = toggleFilters;
window.zoomMap = zoomMap;
window.fitToResults = fitToResults;
window.setActivePin = setActivePin;
window.focusDoctor = focusDoctor;