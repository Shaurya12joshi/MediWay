// ---------- Map (Mappls / MapmyIndia) ----------
// Mappls renders India's boundaries as per the Survey of India, which OSM-based tiles don't.
// Under the hood it's a MapLibre-compatible map, so camera methods, GeoJSON layers,
// markers and popups follow the MapLibre API. Markers and popups take HTML strings.

import { doctorHours, getStatus } from '../../lib/hours';
import { t } from '../../i18n';
import { directionsUrl } from '../../lib/origin';
import { DETAILS, KINDS, kindOf, placeDestination, placeStatus, telHref } from './kinds';
import { specialtyLabels } from '../../lib/specialties';

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
let sdk = null;
export function loadMappls() {
  sdk ??= (async () => {
    if (window.mappls?.Map) return window.mappls;
    if (!MAPPLS_KEY) throw new Error('VITE_MAPPLS_KEY is not set');
    for (const url of MAPPLS_SDK_URLS) {
      try { await loadScript(url); if (window.mappls?.Map) return window.mappls; } catch { /* try the next auth scheme */ }
    }
    throw new Error('Mappls SDK could not be loaded. Check the key and its whitelisted domains');
  })();
  sdk.catch(() => { sdk = null; }); // let a later attempt retry
  return sdk;
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// [[lng, lat], ...] -> [[west, south], [east, north]]
export function boundsOf(points) {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [lng, lat] of points) {
    w = Math.min(w, lng); e = Math.max(e, lng);
    s = Math.min(s, lat); n = Math.max(n, lat);
  }
  return [[w, s], [e, n]];
}

export const emptyFeatureCollection = () => ({ type: 'FeatureCollection', features: [] });

// Older GL engine under Mappls: no data-driven line-dasharray, so solid and dashed are separate layers.
export function addRouteLayers(map) {
  map.addSource('route', { type: 'geojson', data: emptyFeatureCollection() });
  const layout = { 'line-cap': 'round', 'line-join': 'round' };
  map.addLayer({ id: 'route-casing', type: 'line', source: 'route', layout,
    paint: { 'line-color': '#FFFFFF', 'line-width': 9 } });
  map.addLayer({ id: 'route-line', type: 'line', source: 'route', layout,
    filter: ['!=', ['get', 'approx'], true],
    paint: { 'line-color': '#D0423A', 'line-width': 5 } });
  map.addLayer({ id: 'route-line-approx', type: 'line', source: 'route', layout,
    filter: ['==', ['get', 'approx'], true],
    paint: { 'line-color': '#D0423A', 'line-width': 5, 'line-dasharray': [1, 1.6] } });
}

// Road geometry from the public OSRM demo server; falls back to a dashed straight line.
export async function fetchRoute(origin, d) {
  const url = `https://router.project-osrm.org/route/v1/driving/${origin.lng},${origin.lat};${d.lng},${d.lat}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    const json = await res.json();
    const route = json.routes?.[0];
    if (!route) throw new Error(json.code || 'no route');
    return { geometry: route.geometry, minutes: Math.round(route.duration / 60), km: route.distance / 1000, approx: false };
  } catch (err) {
    console.warn('Routing unavailable, drawing straight line:', err);
    return { geometry: { type: 'LineString', coordinates: [[origin.lng, origin.lat], [+d.lng, +d.lat]] }, minutes: null, km: null, approx: true };
  }
}

// Popup buttons are wired by the map view: [data-open-dir] opens the directions drawer,
// a[data-spa] navigates inside the app instead of reloading the page, [data-visit-place] is remembered
// for the "Did you visit?" prompt. Text is in the visitor's language: popups are rebuilt when it changes.
export function doctorPopupHtml(d) {
  const status = doctorHours(d).status;
  return `
    <div class="w-[236px]">
      <div class="flex items-center gap-2.5">
        <div class="w-10 h-10 rounded-[11px] shrink-0 flex items-center justify-center text-[14px] font-serif text-white" style="background:${escapeHtml(d.avatar_bg)};">${escapeHtml(d.initials)}</div>
        <div class="min-w-0">
          <div class="font-serif text-[16px] leading-tight text-[#1E293B] truncate">${escapeHtml(d.name)}</div>
          <div class="text-[12px] text-[#D0423A] font-medium truncate">${escapeHtml(specialtyLabels(t, d))}</div>
        </div>
      </div>
      <div class="flex items-center flex-wrap gap-1.5 mt-2.5 text-[11px]">
        <span class="font-medium px-2 py-[3px] rounded-md ${status.open ? 'bg-[#F0FDF4] text-[#16A34A]' : 'bg-[#F1F5F9] text-[#64748B]'}">${status.open ? '●' : '○'} ${status.label}</span>
        <span class="text-[#64748B]"><span class="text-[#F59E0B]">★</span> ${escapeHtml(d.rating ?? '–')}${d.distance_km != null ? ` · ${t('common.km', { km: d.distance_km })}` : ''}</span>
      </div>
      <div class="text-[11px] text-[#94A3B8] mt-1.5 truncate">${escapeHtml(d.hospital)}</div>
      <div class="flex gap-1.5 mt-3">
        <button class="flex-1 py-2 rounded-lg text-[12px] font-semibold border-none cursor-pointer bg-[#D0423A] hover:bg-[#B8362F] text-white font-sans transition-colors" data-open-dir="${escapeHtml(d.id)}">${t('common.directions')}</button>
        <a class="flex-1 py-2 rounded-lg text-[12px] font-semibold border-[1.5px] border-[#E2E8F0] hover:border-[#1E293B] bg-white text-[#1E293B] no-underline flex items-center justify-center font-sans transition-colors" href="/doctor/${escapeHtml(d.id)}" data-spa>${t('card.profile')}</a>
      </div>
    </div>`;
}

export function placePopupHtml(h, origin) {
  const k = kindOf(h), status = placeStatus(h);
  return `
    <div class="w-[220px]">
      <div class="text-[10px] font-semibold uppercase tracking-[.08em]" style="color:${k.color}">${k.label}</div>
      <div class="font-serif text-[16px] leading-tight text-[#1E293B] mt-0.5">${escapeHtml(h.name)}</div>
      ${h.address ? `<div class="text-[11px] text-[#64748B] mt-1 leading-snug">${escapeHtml(h.address)}</div>` : ''}
      <div class="text-[11px] mt-2 font-medium"><span class="${status.cls}">${status.text}</span>${h.distance_km != null ? `<span class="text-[#64748B] font-normal"> · ${t('common.km', { km: h.distance_km })}</span>` : ''}</div>
      ${detailsHtml(h)}
      <div class="flex gap-1.5 mt-3">
        <a class="flex-1 block text-center py-2 rounded-lg text-[12px] font-semibold bg-[#D0423A] hover:bg-[#B8362F] text-white no-underline transition-colors" href="${escapeHtml(directionsUrl(placeDestination(h), origin))}" target="_blank" rel="noopener" data-visit-place="${escapeHtml(h.id)}" data-visit-name="${escapeHtml(h.name)}">${t('common.directions')}</a>
        ${h.phone ? `<a class="flex-1 block text-center py-2 rounded-lg text-[12px] font-semibold border-[1.5px] border-[#E2E8F0] hover:border-[#1E293B] bg-white text-[#1E293B] no-underline transition-colors" href="${escapeHtml(telHref(h.phone))}">${t('common.call')}</a>` : ''}
      </div>
    </div>`;
}

// The traveller details we know, as a short list under the status
function detailsHtml(h) {
  const known = DETAILS.filter(d => h[d.key] === true)
  if (!known.length) return ''
  return `<div class="text-[11px] text-[#1D4ED8] mt-1.5 leading-snug">${known.map(d => `${d.icon} ${escapeHtml(t(`detail.${d.key}`))}`).join('<br>')}</div>`
}

export function placePinHtml(h) {
  const k = kindOf(h);
  const weight = k === KINDS.hospital ? 3 : 2.2;
  return `<div class="mw-hospital" style="--kind:${k.color}"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${weight}" stroke-linecap="round" stroke-linejoin="round">${k.icon}</svg></div>`;
}

// The SDK owns the wrapper's transform, so the rotated pin lives one level down
export function doctorPinHtml(d) {
  return `<div class="mw-pin-wrap"><div class="mw-pin${doctorHours(d).status.open ? '' : ' is-closed'}"><span>${escapeHtml(d.initials)}</span></div></div>`;
}
