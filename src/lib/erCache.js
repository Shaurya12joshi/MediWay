// The nearest 24/7 emergency rooms, kept on the phone so the emergency page works without a connection.
// Refreshed whenever search results or the emergency page load them online.

const KEY = 'mw.er';
const KEEP = 8;

// places: rows from nearby_hospitals (nearest first); only hospitals with a known 24/7 ER are kept
export function saveEmergencyRooms(places, near) {
  const rooms = places
    .filter(p => p.kind === 'hospital' && p.er24 === true)
    .slice(0, KEEP)
    .map(({ id, name, address, phone, lat, lng, distance_km }) => ({ id, name, address, phone, lat, lng, distance_km }));
  if (!rooms.length) return;
  try { localStorage.setItem(KEY, JSON.stringify({ at: Date.now(), near, rooms })); } catch { /* storage blocked */ }
}

// { at, near, rooms } or null
export function savedEmergencyRooms() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}
