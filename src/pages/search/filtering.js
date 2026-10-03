import { getStatus } from '../../lib/hours';
import { KINDS, kindOf } from './kinds';

// Which rows a set of filters shows. The database already applied type, specialty, walk-ins,
// rating and language (see getNearby); the distance slider, toggles and search box apply here.

export const showsDoctors = filters => filters.type === 'all' || filters.type === 'doctor';
export const showsPlaces  = filters => filters.type !== 'doctor';
export const hasCoords = p => Number.isFinite(+p.lat) && Number.isFinite(+p.lng);
export const specialtyText = d => Array.isArray(d.specialty) ? d.specialty.join(', ') : (d.specialty || '');

function matchesSearchDoctor(d, q) {
  return d.name.toLowerCase().includes(q) ||
         specialtyText(d).toLowerCase().includes(q) ||
         (d.hospital || '').toLowerCase().includes(q);
}

function matchesSearchPlace(h, q) {
  return h.name.toLowerCase().includes(q) ||
         specialtyText(h).toLowerCase().includes(q) ||
         kindOf(h).label.toLowerCase().includes(q) ||
         (h.address || '').toLowerCase().includes(q);
}

export function matchesDoctor(d, filters, query) {
  const q = query.trim().toLowerCase();
  if (!showsDoctors(filters))                                                   return false;
  if (filters.specialty !== 'all' && !d.specialty?.includes(filters.specialty)) return false;
  if (filters.language  !== 'all' && !d.languages?.includes(filters.language))  return false;
  if (d.distance_km > filters.distance)                                         return false;
  if (d.rating < filters.rating)                                                return false;
  if (filters.openNow   && !getStatus(d).open)                                  return false;
  if (filters.walkIn    && !d.walk_in)                                          return false;
  if (filters.english   && !d.languages?.includes('English'))                   return false;
  if (filters.insurance && !d.insurance)                                        return false;
  return !q || matchesSearchDoctor(d, q);
}

// Facilities: the kind chip (already applied by the query), distance slider, open-now and the search box
export function matchesPlace(h, filters, query) {
  const q = query.trim().toLowerCase();
  if (!showsPlaces(filters))                          return false;
  if (KINDS[filters.type] && h.kind !== filters.type) return false;
  if (h.distance_km > filters.distance)               return false;
  if (filters.openNow && !((kindOf(h) === KINDS.hospital && h.er24) || getStatus(h).open)) return false;
  return !q || matchesSearchPlace(h, q);
}

export function sortDoctors(arr, by) {
  return [...arr].sort((a, b) => {
    if (by === 'rating')   return b.rating - a.rating;
    if (by === 'distance') return a.distance_km - b.distance_km;
    if (by === 'name')     return a.name.localeCompare(b.name);
    return 0;
  });
}

// "All" maps hospitals only (a city has hundreds of pharmacies and labs); choosing a kind maps that kind.
// Nearest first, capped so the map stays quick.
const MAP_PLACE_LIMIT = 150;
export function mapPlaces(places, filters) {
  return places.filter(hasCoords)
    .filter(h => filters.type !== 'all' || kindOf(h) === KINDS.hospital)
    .slice(0, MAP_PLACE_LIMIT);
}

// "All" previews a mix — the nearest hospital, pharmacy, clinic, lab, then round again — so a
// cluster of labs next door doesn't hide the nearest hospital
function previewMix(places, n) {
  const byKind = Object.values(KINDS).map(k => places.filter(h => kindOf(h) === k));
  const picked = [];
  for (let i = 0; picked.length < n && byKind.some(list => list[i]); i++) {
    for (const list of byKind) if (list[i] && picked.length < n) picked.push(list[i]);
  }
  return picked.sort((a, b) => a.distance_km - b.distance_km);
}

// In "All", the preview mix stays on screen and loading more adds the next nearest places after it
export function visiblePlaces(all, filters, shown, previewSize) {
  if (KINDS[filters.type]) return all.slice(0, shown);
  const preview = previewMix(all, previewSize);
  const extra = all.filter(h => !preview.includes(h)).slice(0, shown - preview.length);
  return [...preview, ...extra];
}

// Imported addresses often start with a house or shop number: show the locality instead
export function localityOf(address, cityName) {
  const city = cityName?.toLowerCase();
  const parts = (address || '').split(',').map(p => p.trim())
    .filter(p => p && p.toLowerCase() !== city && !/sub-district|uttar pradesh|india|^\d{6}$/i.test(p));
  return parts.findLast(p => !/\d/.test(p)) ?? parts[0] ?? null;
}

// Travel time estimates and sample steps for the directions drawer. Times are replaced by real
// road figures when the map has routed the trip.
export const TRAVEL_SPEEDS = { drive: 40, walk: 5, transit: 25 };

export function simDirections(doc, mode) {
  const mins = Math.round((doc.distance_km / TRAVEL_SPEEDS[mode]) * 60);
  const steps = {
    drive: [
      { icon: '↑',  text: 'Head south on MG Road',          dist: '0.3 km' },
      { icon: '⟵', text: 'Turn right onto Residency Road',  dist: '1.2 km' },
      { icon: '⟶', text: 'Turn left onto Hospital Avenue',  dist: '0.8 km' },
      { icon: '📍', text: `Arrive at ${doc.hospital}`,       dist: '' },
    ],
    walk: [
      { icon: '↑',  text: 'Walk along the main road',         dist: '0.4 km' },
      { icon: '⟵', text: 'Cross at the pedestrian crossing', dist: '0.2 km' },
      { icon: '📍', text: `Arrive at ${doc.hospital}`,        dist: '' },
    ],
    transit: [
      { icon: '🚌', text: 'Board Bus 335 towards Silk Board', dist: '3 stops' },
      { icon: '⬇',  text: 'Alight at Hospital Circle',        dist: '' },
      { icon: '↑',  text: 'Walk 200m to entrance',            dist: '0.2 km' },
      { icon: '📍', text: `Arrive at ${doc.hospital}`,        dist: '' },
    ],
  };
  return { mins, steps: steps[mode] || steps.drive };
}

export function fmtMinutes(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}
