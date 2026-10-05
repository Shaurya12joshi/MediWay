import { getStatus } from '../../lib/hours';
import { treats } from '../../lib/specialties';
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
  if (filters.specialty !== 'all' && !treats(d, filters.specialty))             return false;
  if (filters.language  !== 'all' && !d.languages?.includes(filters.language))  return false;
  if (d.distance_km > filters.distance)                                         return false;
  if (d.rating < filters.rating)                                                return false;
  if (filters.openNow   && !getStatus(d).open)                                  return false;
  if (filters.walkIn    && !d.walk_in)                                          return false;
  if (filters.english   && !d.languages?.includes('English'))                   return false;
  if (filters.insurance && !d.insurance)                                        return false;
  if (filters.femaleDoctor && d.gender !== 'female')                            return false;
  return !q || matchesSearchDoctor(d, q);
}

// Facilities: the kind chip (already applied by the query), distance slider, open-now and the search box
export function matchesPlace(h, filters, query) {
  const q = query.trim().toLowerCase();
  if (!showsPlaces(filters))                          return false;
  if (KINDS[filters.type] && h.kind !== filters.type) return false;
  if (h.distance_km > filters.distance)               return false;
  if (filters.openNow && !((kindOf(h) === KINDS.hospital && h.er24) || getStatus(h).open)) return false;
  if (filters.er24 && !(kindOf(h) === KINDS.hospital && h.er24 === true)) return false;
  // Traveller details: only places we know offer it
  if (filters.english && h.english_desk !== true)        return false;
  if (filters.intlInsurance && h.intl_insurance !== true) return false;
  if (filters.cards && h.accepts_cards !== true)         return false;
  if (filters.travelClinic && h.travel_clinic !== true)  return false;
  if (filters.femaleDoctor && h.female_doctor !== true)  return false;
  return !q || matchesSearchPlace(h, q);
}

export function sortDoctors(arr, by) {
  return [...arr].sort((a, b) => {
    // Profiles nobody has rated yet (e.g. imported from a hospital's website) go after the rated ones
    if (by === 'rating')   return (b.rating ?? -1) - (a.rating ?? -1);
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

// Parts of an address that say nothing to someone already in the city: the country, any state or
// union territory, district labels and PIN codes
const STATES = ['andhra pradesh', 'arunachal pradesh', 'assam', 'bihar', 'chhattisgarh', 'goa', 'gujarat', 'haryana',
  'himachal pradesh', 'jharkhand', 'karnataka', 'kerala', 'madhya pradesh', 'maharashtra', 'manipur', 'meghalaya',
  'mizoram', 'nagaland', 'odisha', 'orissa', 'punjab', 'rajasthan', 'sikkim', 'tamil nadu', 'telangana', 'tripura',
  'uttar pradesh', 'uttarakhand', 'uttaranchal', 'west bengal', 'andaman and nicobar islands', 'chandigarh',
  'dadra and nagar haveli and daman and diu', 'delhi', 'nct of delhi', 'new delhi', 'jammu and kashmir', 'ladakh',
  'lakshadweep', 'puducherry', 'pondicherry'];
const NOT_A_LOCALITY = new RegExp(`^(india|bharat|${STATES.join('|')})$|\\b(sub-?district|district|tehsil|taluka?|mandal)\\b|^\\d{6}$|^(\\D+ )?\\d{3} ?\\d{3}$`, 'i');

// Imported addresses often start with a house or shop number: show the locality instead
export function localityOf(address, cityName) {
  const city = cityName?.toLowerCase();
  const parts = (address || '').split(',').map(p => p.trim().replace(/\s+/g, ' '))
    .filter(p => p && p.toLowerCase() !== city && !NOT_A_LOCALITY.test(p));
  return parts.findLast(p => !/\d/.test(p)) ?? parts[0] ?? null;
}

// Rough travel times for the directions drawer, until the map has routed the trip on real roads.
// distance_km is a straight line; roads in Indian cities run about a third longer.
export const TRAVEL_SPEEDS = { drive: 40, walk: 5, transit: 25 };
const ROAD_FACTOR = 1.3;

export function estimateMinutes(distanceKm, mode) {
  if (!Number.isFinite(+distanceKm)) return null;
  return Math.max(1, Math.round((distanceKm * ROAD_FACTOR / TRAVEL_SPEEDS[mode]) * 60));
}

export function fmtMinutes(mins) {
  const h = Math.floor(mins / 60), m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m} min`;
}
