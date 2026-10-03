// Where distances are measured from, shared by the search and profile pages.
// Kept per tab in sessionStorage so a detected location survives a reload.

const KEY = 'mw.origin';

// origin: { lat, lng, city (slug), fromDevice (true when it's the user's real position) }
export function saveOrigin(origin) {
  try { sessionStorage.setItem(KEY, JSON.stringify(origin)); } catch { /* storage blocked */ }
}

export function readOrigin() {
  try { return JSON.parse(sessionStorage.getItem(KEY)); } catch { return null; }
}

// Great-circle distance on the same sphere PostGIS uses in nearby_doctors / nearby_hospitals
export function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371.0088, rad = Math.PI / 180;
  const a = Math.sin((lat2 - lat1) * rad / 2) ** 2 +
            Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin((lng2 - lng1) * rad / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Only pass an origin we actually know: without one, Google Maps starts from the device's
// own location, which beats routing from a city centre.
export function directionsUrl(dest, origin) {
  const from = origin?.fromDevice ? `&origin=${origin.lat},${origin.lng}` : '';
  return `https://www.google.com/maps/dir/?api=1${from}&destination=${encodeURIComponent(dest)}`;
}

export function cityCentre(city) {
  return { lat: city.center_lat, lng: city.center_lng, city: city.slug, fromDevice: false };
}

// The nearest launched city, and whether the point is inside its area
export function nearestCity(cities, lat, lng) {
  let city = null, km = Infinity;
  for (const c of cities) {
    const d = distanceKm(lat, lng, c.center_lat, c.center_lng);
    if (d < km) { city = c; km = d; }
  }
  return { city, inside: city != null && km <= city.radius_km };
}
